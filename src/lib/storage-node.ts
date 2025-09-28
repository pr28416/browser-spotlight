// Node.js-specific storage implementation
import { promises as fs } from 'fs'
import path from 'path'
import type { StorageInterface } from './storage'

export class NodeStorage implements StorageInterface {
  async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath)
      return true
    } catch {
      return false
    }
  }

  async read(filePath: string): Promise<string> {
    console.log(`📖 Reading file: ${filePath}`)
    const data = await fs.readFile(filePath, 'utf8')
    console.log(`✅ File read successfully: ${filePath} (${data.length} chars)`)
    return data
  }

  async write(filePath: string, data: string): Promise<void> {
    console.log(`💾 Writing to file: ${filePath} (${data.length} chars)`)
    await fs.writeFile(filePath, data, 'utf8')
    console.log(`✅ File written successfully: ${filePath}`)
  }

  async ensureDirectory(dirPath: string): Promise<void> {
    await fs.mkdir(dirPath, { recursive: true })
  }

  getPath(...segments: string[]): string {
    return path.join(...segments)
  }

  getCurrentDir(): string {
    return process.cwd()
  }
}