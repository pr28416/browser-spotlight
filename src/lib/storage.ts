// Storage abstraction that works in both Node.js and browser environments

export interface StorageInterface {
  exists(key: string): Promise<boolean>
  read(key: string): Promise<string>
  write(key: string, data: string): Promise<void>
  ensureDirectory(path: string): Promise<void>
  clear?(): Promise<void>
}

// Browser implementation using IndexedDB for better performance with large data
class BrowserStorage implements StorageInterface {
  private dbName = 'browser-spotlight'
  private dbVersion = 1
  private storeName = 'search-data'
  private db: IDBDatabase | null = null

  private async getDB(): Promise<IDBDatabase> {
    if (this.db) return this.db

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion)
      
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        this.db = request.result
        resolve(request.result)
      }
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName)
        }
      }
    })
  }

  async exists(key: string): Promise<boolean> {
    try {
      const db = await this.getDB()
      const transaction = db.transaction([this.storeName], 'readonly')
      const store = transaction.objectStore(this.storeName)
      
      return new Promise((resolve, reject) => {
        const request = store.get(key)
        request.onerror = () => reject(request.error)
        request.onsuccess = () => resolve(request.result !== undefined)
      })
    } catch {
      return false
    }
  }

  async read(key: string): Promise<string> {
    const db = await this.getDB()
    const transaction = db.transaction([this.storeName], 'readonly')
    const store = transaction.objectStore(this.storeName)
    
    return new Promise((resolve, reject) => {
      const request = store.get(key)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        if (request.result === undefined) {
          reject(new Error(`Key ${key} not found`))
        } else {
          resolve(request.result)
        }
      }
    })
  }

  async write(key: string, data: string): Promise<void> {
    console.log(`💾 Writing to IndexedDB: ${key} (${data.length} chars)`)
    const db = await this.getDB()
    const transaction = db.transaction([this.storeName], 'readwrite')
    const store = transaction.objectStore(this.storeName)
    
    return new Promise((resolve, reject) => {
      const request = store.put(data, key)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        console.log(`✅ IndexedDB write successful: ${key}`)
        resolve()
      }
    })
  }

  async ensureDirectory(_path: string): Promise<void> {
    // No-op in browser - IndexedDB doesn't have directories
  }

  async clear(): Promise<void> {
    const db = await this.getDB()
    const transaction = db.transaction([this.storeName], 'readwrite')
    const store = transaction.objectStore(this.storeName)
    
    return new Promise((resolve, reject) => {
      const request = store.clear()
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }
}


// Environment detection and factory
function isNodeEnvironment(): boolean {
  // In Next.js, we want to use browser storage since it runs in the browser
  // Only use Node.js storage for actual server-side or CLI execution
  return typeof process !== 'undefined' && 
         process.versions != null && 
         process.versions.node != null &&
         typeof window === 'undefined' && 
         typeof document === 'undefined' && // Not in DOM environment
         !process.env.NEXT_RUNTIME // Not in Next.js runtime
}

export function createStorage(): StorageInterface {
  if (isNodeEnvironment()) {
    // Use Node.js storage - webpack will exclude this from browser builds
    const { NodeStorage } = require('./storage-node')
    return new NodeStorage()
  } else {
    return new BrowserStorage()
  }
}

// Path utilities that work in both environments
export function joinPath(...segments: string[]): string {
  if (isNodeEnvironment()) {
    const path = require('path')
    return path.join(...segments)
  } else {
    // Simple path joining for browser
    return segments.filter(Boolean).join('/')
  }
}

export function getCurrentDirectory(): string {
  if (isNodeEnvironment()) {
    return process.cwd()
  } else {
    // In browser, use a virtual directory concept
    return '/browser-spotlight'
  }
}
