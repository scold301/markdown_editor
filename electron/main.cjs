/**
 * Electron 主进程入口文件
 * 负责创建窗口、处理文件系统操作、设置应用菜单等
 */

const { app, BrowserWindow, shell, Menu, ipcMain, dialog } = require('electron')
const fs = require('fs/promises')
const path = require('path')

let mainWindow = null

/**
 * 判断子路径是否在父路径内
 * 用于防止路径遍历攻击
 * @param {string} parent 父路径
 * @param {string} child 子路径
 * @returns {boolean} 是否在内部
 */
const isInside = (parent, child) => {
  const rel = path.relative(parent, child)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

/**
 * 安全地解析路径
 * 所有文件操作必须保持在选择的根目录内，防止路径遍历攻击
 * @param {string} rootPath 根目录路径
 * @param {string} relPath 相对路径
 * @returns {string} 绝对路径
 * @throws {Error} 如果路径在根目录外
 */
const resolveSafePath = (rootPath, relPath) => {
  const absRoot = path.resolve(rootPath)
  const absPath = path.resolve(absRoot, relPath || '')
  if (!isInside(absRoot, absPath)) {
    throw new Error('Path outside root')
  }
  return absPath
}

/**
 * 根据文件扩展名获取 MIME 类型
 * @param {string} ext 文件扩展名
 * @returns {string} MIME 类型
 */
const extToMime = (ext) => {
  const e = ext.toLowerCase()
  if (e === '.png') return 'image/png'
  if (e === '.jpg' || e === '.jpeg') return 'image/jpeg'
  if (e === '.gif') return 'image/gif'
  if (e === '.webp') return 'image/webp'
  if (e === '.svg') return 'image/svg+xml'
  return 'application/octet-stream'
}

/**
 * 递归列出目录树
 * @param {string} rootPath 根目录路径
 * @param {string} currentAbs 当前绝对路径
 * @param {string} currentRel 当前相对路径
 * @returns {Promise<Array>} 文件树结构
 */
const listTree = async (rootPath, currentAbs, currentRel) => {
  const entries = await fs.readdir(currentAbs, { withFileTypes: true })
  const items = []

  for (const entry of entries) {
    // 跳过隐藏文件和 node_modules
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

  // 排序：目录优先，然后按名称排序
  items.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  return items
}

/**
 * 创建主窗口
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Markdown Notebook',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,  // 启用上下文隔离，提高安全性
      nodeIntegration: false,  // 禁用 Node.js 集成，提高安全性
      sandbox: false,
    },
  })

  // 拦截窗口打开请求，在外部浏览器中打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // 加载应用页面
  mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))

  /**
   * 向渲染进程发送菜单动作
   * @param {object} payload 动作载荷
   */
  const send = (payload) => {
    if (!mainWindow) return
    mainWindow.webContents.send('menu-action', payload)
  }

  // 自动保存时间选项
  const autosaveChoices = [
    { label: '关闭', minutes: 0 },
    { label: '1 分钟', minutes: 1 },
    { label: '3 分钟', minutes: 3 },
    { label: '5 分钟（默认）', minutes: 5 },
    { label: '10 分钟', minutes: 10 },
  ]

  // 创建应用菜单
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

// IPC 处理器：打开文件夹对话框
ipcMain.handle('dialog:openFolder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
  })
  if (result.canceled || !result.filePaths?.[0]) return null
  return result.filePaths[0]
})

// IPC 处理器：打开图片文件对话框
ipcMain.handle('dialog:openImages', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] }],
  })
  if (result.canceled || !result.filePaths?.length) return null
  return result.filePaths
})

// IPC 处理器：保存 Markdown 文件对话框
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
  
  // 如果文件在当前根目录内，返回相对路径
  if (absRoot && isInside(absRoot, absFile)) {
    return { rootPath: absRoot, relPath: path.relative(absRoot, absFile).split(path.sep).join('/') }
  }
  
  // 否则，将文件所在目录设为新的根目录
  const newRoot = path.dirname(absFile)
  return { rootPath: newRoot, relPath: path.basename(absFile) }
})

// IPC 处理器：列出目录树
ipcMain.handle('fs:listTree', async (_event, payload) => {
  const rootPath = payload?.rootPath
  if (!rootPath) return []
  const absRoot = path.resolve(rootPath)
  return listTree(absRoot, absRoot, '')
})

// IPC 处理器：读取文本文件
ipcMain.handle('fs:readTextFile', async (_event, payload) => {
  const abs = resolveSafePath(payload.rootPath, payload.relPath)
  return fs.readFile(abs, 'utf8')
})

// IPC 处理器：写入文本文件
ipcMain.handle('fs:writeTextFile', async (_event, payload) => {
  const abs = resolveSafePath(payload.rootPath, payload.relPath)
  // 确保父目录存在
  await fs.mkdir(path.dirname(abs), { recursive: true })
  await fs.writeFile(abs, payload.content ?? '', 'utf8')
  return true
})

// IPC 处理器：创建目录
ipcMain.handle('fs:mkdir', async (_event, payload) => {
  const abs = resolveSafePath(payload.rootPath, payload.relPath)
  await fs.mkdir(abs, { recursive: true })
  return true
})

// IPC 处理器：导入文件
ipcMain.handle('fs:importFiles', async (_event, payload) => {
  const rootPath = payload?.rootPath
  const dirRelPath = payload?.dirRelPath || ''
  const filePaths = Array.isArray(payload?.filePaths) ? payload.filePaths : []
  if (!rootPath || filePaths.length === 0) return []

  const absDir = resolveSafePath(rootPath, dirRelPath)
  await fs.mkdir(absDir, { recursive: true })

  // 检查文件是否存在
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

    // 处理文件名冲突
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

// IPC 处理器：删除文件或目录
ipcMain.handle('fs:deleteEntry', async (_event, payload) => {
  const abs = resolveSafePath(payload.rootPath, payload.relPath)
  const recursive = Boolean(payload?.recursive)
  await fs.rm(abs, { recursive, force: true })
  return true
})

// IPC 处理器：读取文件为 Data URL
ipcMain.handle('fs:readFileAsDataUrl', async (_event, payload) => {
  const abs = resolveSafePath(payload.rootPath, payload.relPath)
  const buf = await fs.readFile(abs)
  const mime = extToMime(path.extname(abs))
  return `data:${mime};base64,${buf.toString('base64')}`
})

// IPC 处理器：写入 Base64 文件（自动处理重名）
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

  // 检查文件是否存在
  const exists = async (absPath) => {
    try {
      await fs.access(absPath)
      return true
    } catch {
      return false
    }
  }

  // 处理文件名冲突
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

// IPC 处理器：重命名文件或目录
ipcMain.handle('fs:rename', async (_event, payload) => {
  const rootPath = payload?.rootPath
  const oldRelPath = payload?.oldRelPath
  const newRelPath = payload?.newRelPath
  if (!rootPath || !oldRelPath || !newRelPath) return false

  const oldAbs = resolveSafePath(rootPath, oldRelPath)
  const newAbs = resolveSafePath(rootPath, newRelPath)
  await fs.mkdir(path.dirname(newAbs), { recursive: true })

  // 检查目标是否已存在
  try {
    await fs.access(newAbs)
    throw new Error('Target already exists')
  } catch (err) {
    if (String(err?.message || '') === 'Target already exists') throw err
  }

  await fs.rename(oldAbs, newAbs)
  return true
})

// 应用就绪时创建窗口
app.whenReady().then(() => {
  createWindow()

  // macOS 特性：点击 Dock 图标时重新创建窗口
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// 所有窗口关闭时退出应用（macOS 除外）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
