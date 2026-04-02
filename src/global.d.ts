export {}

declare global {
  interface Window {
    desktop?: {
      platform: string
      onMenuAction?: (handler: (payload: any) => void) => (() => void) | void
      openFolderDialog?: () => Promise<string | null>
      openImageFilesDialog?: () => Promise<string[] | null>
      saveTextFileDialog?: (payload: { rootPath?: string | null; defaultName: string }) => Promise<{ rootPath: string; relPath: string } | null>
      listTree?: (rootPath: string) => Promise<any[]>
      readTextFile?: (payload: { rootPath: string; relPath: string }) => Promise<string>
      writeTextFile?: (payload: { rootPath: string; relPath: string; content: string }) => Promise<boolean>
      mkdir?: (payload: { rootPath: string; relPath: string }) => Promise<boolean>
      importFiles?: (payload: { rootPath: string; dirRelPath: string; filePaths: string[] }) => Promise<string[]>
      deleteEntry?: (payload: { rootPath: string; relPath: string; recursive?: boolean }) => Promise<boolean>
      readFileAsDataUrl?: (payload: { rootPath: string; relPath: string }) => Promise<string>
      writeBase64FileUnique?: (payload: { rootPath: string; dirRelPath: string; fileName: string; base64: string }) => Promise<string>
      rename?: (payload: { rootPath: string; oldRelPath: string; newRelPath: string }) => Promise<boolean>
    }
  }
}
