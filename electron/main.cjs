const { app, BrowserWindow, shell, Menu, ipcMain, dialog } = require('electron')
const fs = require('fs/promises')
const path = require('path')

let mainWindow = null

const isInside = (parent, child) => {
  const rel = path.relative(parent, child)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

// Prevent path traversal: all file operations must remain inside the chosen root directory.
const resolveSafePath = (rootPath, relPath) => {
  const absRoot = path.resolve(rootPath)
  const absPath = path.resolve(absRoot, relPath || '')
  if (!isInside(absRoot, absPath)) {
    throw new Error('Path outside root')
  }
  return absPath
}

const extToMime = (ext) => {
  const e = ext.toLowerCase()
  if (e === '.png') return 'image/png'
  if (e === '.jpg' || e === '.jpeg') return 'image/jpeg'
  if (e === '.gif') return 'image/gif'
  if (e === '.webp') return 'image/webp'
  if (e === '.svg') return 'image/svg+xml'
  return 'application/octet-stream'
}

const listTree = async (rootPath, currentAbs, currentRel) => {
  const entries = await fs.readdir(currentAbs, { withFileTypes: true })
  const items = []

  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
    const abs = path.join(currentAbs, entry.name)
    const rel = currentRel ? `${currentRel}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      const children = await listTree(rootPath, abs, rel)
      items.push({ name: entry.name, kind: 'directory', path: rel, children })
    } else {
      items.push({ name: entry.name, kind: 'file', path: rel })
    }
  }

  items.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  return items
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Markdown Notebook',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))

  const send = (payload) => {
    if (!mainWindow) return
    mainWindow.webContents.send('menu-action', payload)
  }

  const autosaveChoices = [
    { label: '关闭', minutes: 0 },
    { label: '1 分钟', minutes: 1 },
    { label: '3 分钟', minutes: 3 },
    { label: '5 分钟（默认）', minutes: 5 },
    { label: '10 分钟', minutes: 10 },
  ]

  const menu = Menu.buildFromTemplate([
    {
      label: '文件',
      submenu: [
        { label: '打开文件夹', click: () => send({ type: 'open_folder' }) },
        { type: 'separator' },
        { label: '撤销', accelerator: 'CmdOrCtrl+Z', click: () => send({ type: 'undo' }) },
        { label: '重做', accelerator: 'CmdOrCtrl+Y', click: () => send({ type: 'redo' }) },
        { type: 'separator' },
        { label: '保存', accelerator: 'CmdOrCtrl+S', click: () => send({ type: 'save' }) },
        { label: '导出 PDF', click: () => send({ type: 'export_pdf' }) },
        { label: '导出 Word', click: () => send({ type: 'export_word' }) },
        { type: 'separator' },
        {
          label: '自动保存时间',
          submenu: autosaveChoices.map((c) => ({
            label: c.label,
            type: 'radio',
            checked: c.minutes === 5,
            click: () => send({ type: 'set_autosave', minutes: c.minutes }),
          })),
        },
        { type: 'separator' },
        { role: 'quit', label: '退出' },
      ],
    },
    {
      label: '帮助',
      submenu: [
        { label: '关于', click: () => send({ type: 'about' }) },
      ],
    },
  ])

  Menu.setApplicationMenu(menu)
}

ipcMain.handle('dialog:openFolder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
  })
  if (result.canceled || !result.filePaths?.[0]) return null
  return result.filePaths[0]
})

ipcMain.handle('dialog:openImages', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] }],
  })
  if (result.canceled || !result.filePaths?.length) return null
  return result.filePaths
})

ipcMain.handle('dialog:saveMarkdown', async (_event, payload) => {
  const { rootPath, defaultName } = payload || {}
  const suggested = typeof defaultName === 'string' && defaultName ? defaultName : '新文件.md'
  const defaultPath = rootPath ? path.join(rootPath, suggested) : suggested
  const result = await dialog.showSaveDialog({
    defaultPath,
    filters: [{ name: 'Markdown', extensions: ['md'] }],
  })
  if (result.canceled || !result.filePath) return null

  const filePath = result.filePath
  const absRoot = rootPath ? path.resolve(rootPath) : null
  const absFile = path.resolve(filePath)
  if (absRoot && isInside(absRoot, absFile)) {
    return { rootPath: absRoot, relPath: path.relative(absRoot, absFile).split(path.sep).join('/') }
  }
  const newRoot = path.dirname(absFile)
  return { rootPath: newRoot, relPath: path.basename(absFile) }
})

ipcMain.handle('fs:listTree', async (_event, payload) => {
  const rootPath = payload?.rootPath
  if (!rootPath) return []
  const absRoot = path.resolve(rootPath)
  return listTree(absRoot, absRoot, '')
})

ipcMain.handle('fs:readTextFile', async (_event, payload) => {
  const abs = resolveSafePath(payload.rootPath, payload.relPath)
  return fs.readFile(abs, 'utf8')
})

ipcMain.handle('fs:writeTextFile', async (_event, payload) => {
  const abs = resolveSafePath(payload.rootPath, payload.relPath)
  await fs.mkdir(path.dirname(abs), { recursive: true })
  await fs.writeFile(abs, payload.content ?? '', 'utf8')
  return true
})

ipcMain.handle('fs:mkdir', async (_event, payload) => {
  const abs = resolveSafePath(payload.rootPath, payload.relPath)
  await fs.mkdir(abs, { recursive: true })
  return true
})

ipcMain.handle('fs:importFiles', async (_event, payload) => {
  const rootPath = payload?.rootPath
  const dirRelPath = payload?.dirRelPath || ''
  const filePaths = Array.isArray(payload?.filePaths) ? payload.filePaths : []
  if (!rootPath || filePaths.length === 0) return []

  const absDir = resolveSafePath(rootPath, dirRelPath)
  await fs.mkdir(absDir, { recursive: true })

  const exists = async (absPath) => {
    try {
      await fs.access(absPath)
      return true
    } catch {
      return false
    }
  }

  const chosenNames = []
  for (const filePath of filePaths) {
    if (typeof filePath !== 'string' || !filePath) continue
    const absSrc = path.resolve(filePath)
    const originalName = path.basename(absSrc)

    const dotIndex = originalName.lastIndexOf('.')
    const base = dotIndex >= 0 ? originalName.slice(0, dotIndex) : originalName
    const ext = dotIndex >= 0 ? originalName.slice(dotIndex) : ''

    let chosen = originalName
    let absDest = path.join(absDir, chosen)
    if (await exists(absDest)) {
      for (let i = 1; i <= 999; i++) {
        const candidate = `${base}-${i}${ext}`
        const absCandidate = path.join(absDir, candidate)
        if (!(await exists(absCandidate))) {
          chosen = candidate
          absDest = absCandidate
          break
        }
      }
    }

    await fs.copyFile(absSrc, absDest)
    chosenNames.push(chosen)
  }

  return chosenNames
})

ipcMain.handle('fs:deleteEntry', async (_event, payload) => {
  const abs = resolveSafePath(payload.rootPath, payload.relPath)
  const recursive = Boolean(payload?.recursive)
  await fs.rm(abs, { recursive, force: true })
  return true
})

ipcMain.handle('fs:readFileAsDataUrl', async (_event, payload) => {
  const abs = resolveSafePath(payload.rootPath, payload.relPath)
  const buf = await fs.readFile(abs)
  const mime = extToMime(path.extname(abs))
  return `data:${mime};base64,${buf.toString('base64')}`
})

ipcMain.handle('fs:writeBase64FileUnique', async (_event, payload) => {
  const rootPath = payload.rootPath
  const dirRelPath = payload.dirRelPath || ''
  const fileName = payload.fileName || 'image.png'
  const base64 = payload.base64 || ''

  const absDir = resolveSafePath(rootPath, dirRelPath)
  await fs.mkdir(absDir, { recursive: true })

  const dotIndex = fileName.lastIndexOf('.')
  const base = dotIndex >= 0 ? fileName.slice(0, dotIndex) : fileName
  const ext = dotIndex >= 0 ? fileName.slice(dotIndex) : ''

  const exists = async (absPath) => {
    try {
      await fs.access(absPath)
      return true
    } catch {
      return false
    }
  }

  let chosen = fileName
  let absFile = path.join(absDir, chosen)
  if (await exists(absFile)) {
    for (let i = 1; i <= 999; i++) {
      const candidate = `${base}-${i}${ext}`
      const absCandidate = path.join(absDir, candidate)
      if (!(await exists(absCandidate))) {
        chosen = candidate
        absFile = absCandidate
        break
      }
    }
  }

  const buf = Buffer.from(base64, 'base64')
  await fs.writeFile(absFile, buf)
  return chosen
})

ipcMain.handle('fs:rename', async (_event, payload) => {
  const rootPath = payload?.rootPath
  const oldRelPath = payload?.oldRelPath
  const newRelPath = payload?.newRelPath
  if (!rootPath || !oldRelPath || !newRelPath) return false

  const oldAbs = resolveSafePath(rootPath, oldRelPath)
  const newAbs = resolveSafePath(rootPath, newRelPath)
  await fs.mkdir(path.dirname(newAbs), { recursive: true })

  try {
    await fs.access(newAbs)
    throw new Error('Target already exists')
  } catch (err) {
    if (String(err?.message || '') === 'Target already exists') throw err
  }

  await fs.rename(oldAbs, newAbs)
  return true
})

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
