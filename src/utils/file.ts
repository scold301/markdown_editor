/**
 * 将文件转换为 Base64 编码
 * @param file 文件对象
 * @returns Base64 编码字符串
 */
export async function fileToBase64(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  for (let i = 0; i < buf.length; i++) {
    binary += String.fromCharCode(buf[i])
  }
  return btoa(binary)
}
