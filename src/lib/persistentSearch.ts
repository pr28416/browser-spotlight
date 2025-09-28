import MiniSearch from 'minisearch'
import type { DriveFile } from '~types'
import { createStorage, joinPath, getCurrentDirectory, type StorageInterface } from './storage'

interface SearchableFile {
  id: string
  name: string
  pathTokens: string
  typeKeywords: string
  mimeType: string
  modifiedTime?: string
}

interface FileMetadata extends DriveFile {
  openCount?: number
  lastOpenedTime?: string
}

export class PersistentSearchService {
  private miniSearch: MiniSearch<SearchableFile>
  private fileMap: Map<string, FileMetadata> = new Map()
  private storage: StorageInterface
  private indexKey: string
  private metadataKey: string
  private changeTokenKey: string
  private isReady: boolean = false

  constructor(userId: string = 'default') {
    this.storage = createStorage()
    
    // For Node.js: use full file paths, for browser: use simple keys
    if (typeof process !== 'undefined' && process.versions?.node) {
      // Node.js environment - use full paths
      const indexDir = joinPath(getCurrentDirectory(), 'data', 'indexes')
      this.indexKey = joinPath(indexDir, `${userId}-search.json`)
      this.metadataKey = joinPath(indexDir, `${userId}-metadata.json`)
      this.changeTokenKey = joinPath(indexDir, `${userId}-change-token.txt`)
    } else {
      // Browser environment - use simple keys
      this.indexKey = `${userId}-search.json`
      this.metadataKey = `${userId}-metadata.json`
      this.changeTokenKey = `${userId}-change-token`
    }
    
    
    // Initialize MiniSearch with configuration
    this.miniSearch = new MiniSearch({
      fields: ['name', 'pathTokens', 'typeKeywords'], // fields to search
      storeFields: ['id', 'name', 'mimeType', 'modifiedTime'], // fields to return
      idField: 'id',
      searchOptions: {
        boost: {
          name: 3,        // Boost filename matches most
          pathTokens: 1,  // Path components 
          typeKeywords: 2 // File type keywords
        },
        fuzzy: 0.2,      // Allow small typos
        prefix: true,    // Enable prefix search (typing "doc" matches "document")
        combineWith: 'AND'
      }
    })
  }

  /**
   * Load existing index from storage on startup
   * This should be called when the app starts
   */
  async initialize(): Promise<void> {
    try {
      console.log('Loading search index from storage...')
      const start = performance.now()
      
      // Ensure storage directory exists (no-op for browser)
      if (typeof process !== 'undefined' && process.versions?.node) {
        const indexPath = joinPath(getCurrentDirectory(), 'data', 'indexes')
        await this.storage.ensureDirectory(indexPath)
      }
      
      // Try to load existing index and metadata
      const [indexExists, metadataExists] = await Promise.all([
        this.storage.exists(this.indexKey),
        this.storage.exists(this.metadataKey)
      ])
      
      if (indexExists && metadataExists) {
        try {
          await this.loadFromStorage()
          const loadTime = performance.now() - start
          console.log(`✅ Loaded search index with ${this.miniSearch.documentCount} files in ${Math.round(loadTime)}ms`)
        } catch (error) {
          console.warn('⚠️ Failed to load existing index, clearing corrupted data:', error)
          // Clear corrupted data and start fresh
          if (this.storage.clear) {
            await this.storage.clear()
          }
          console.log('🗑️ Cleared corrupted storage, starting fresh')
        }
      } else {
        console.log('📁 No existing index found, starting fresh')
      }
      
      this.isReady = true
    } catch (error) {
      console.error('❌ Failed to load search index:', error)
      // Continue with empty index
      this.isReady = true
    }
  }

  /**
   * Load index and metadata from storage
   */
  private async loadFromStorage(): Promise<void> {
    const [indexData, metadataData] = await Promise.all([
      this.storage.read(this.indexKey),
      this.storage.read(this.metadataKey)
    ])
    
    
    // Restore the search index with error handling
    try {
      // MiniSearch.loadJSON expects a JSON string, not a parsed object
      this.miniSearch = MiniSearch.loadJSON(indexData, {
        fields: ['name', 'pathTokens', 'typeKeywords'],
        storeFields: ['id', 'name', 'mimeType', 'modifiedTime'],
        idField: 'id'
      })
      
    } catch (error) {
      console.warn('⚠️ Failed to parse search index, starting fresh:', error)
      // Start with a fresh index if corrupted
      this.miniSearch = new MiniSearch({
        fields: ['name', 'pathTokens', 'typeKeywords'],
        storeFields: ['id', 'name', 'mimeType', 'modifiedTime'],
        idField: 'id',
        searchOptions: {
          boost: {
            name: 3,
            pathTokens: 1,
            typeKeywords: 2
          },
          fuzzy: 0.2,
          prefix: true,
          combineWith: 'AND'
        }
      })
    }
    
    // Restore file metadata map with error handling
    try {
      const savedMetadata = JSON.parse(metadataData)
      this.fileMap = new Map(savedMetadata)
    } catch (error) {
      console.warn('⚠️ Failed to parse metadata, starting fresh:', error)
      this.fileMap = new Map()
    }
  }

  /**
   * Save current index to storage
   * Call this after any changes to persist them
   */
  async saveToStorage(): Promise<void> {
    try {
      const start = performance.now()
      
      await Promise.all([
        // Save the search index
        this.storage.write(this.indexKey, JSON.stringify(this.miniSearch.toJSON())),
        // Save file metadata separately (for full file info)
        this.storage.write(this.metadataKey, JSON.stringify([...this.fileMap.entries()]))
      ])
      
      const saveTime = performance.now() - start
      console.log(`💾 Saved search index (${this.miniSearch.documentCount} files) in ${Math.round(saveTime)}ms`)
    } catch (error) {
      console.error('❌ Failed to save search index:', error)
    }
  }

  /**
   * Add files to the index (incremental)
   */
  async addFiles(files: FileMetadata[]): Promise<void> {
    if (!this.isReady) {
      throw new Error('Search service not initialized. Call initialize() first.')
    }

    // Prepare files for indexing
    const searchableFiles: SearchableFile[] = files.map(file => ({
      id: file.id,
      name: file.name,
      pathTokens: this.tokenizePath(file.name), // For Google Drive, we use name since no real paths
      typeKeywords: this.getTypeKeywords(file.mimeType),
      mimeType: file.mimeType,
      modifiedTime: file.modifiedTime
    }))
    
    // Add to search index
    this.miniSearch.addAll(searchableFiles)
    
    // Store full metadata separately
    files.forEach(file => this.fileMap.set(file.id, file))
    
    // Persist to storage
    await this.saveToStorage()
  }

  /**
   * Update existing files in the index
   */
  async updateFiles(files: FileMetadata[]): Promise<void> {
    if (!this.isReady) return

    // Remove old versions first
    const fileIds = files.map(f => f.id)
    this.miniSearch.discardAll(fileIds)
    
    // Add updated versions
    await this.addFiles(files)
  }

  /**
   * Remove files from the index
   */
  async removeFiles(fileIds: string[]): Promise<void> {
    if (!this.isReady) return

    // Remove from search index
    this.miniSearch.discardAll(fileIds)
    
    // Remove from metadata map
    fileIds.forEach(id => this.fileMap.delete(id))
    
    // Persist changes
    await this.saveToStorage()
  }

  /**
   * Replace entire index (for full re-index)
   */
  async replaceIndex(files: FileMetadata[]): Promise<void> {
    if (!this.isReady) return

    // Clear existing index
    this.miniSearch.removeAll()
    this.fileMap.clear()
    
    // Add all files
    await this.addFiles(files)
  }

  /**
   * Search the index
   */
  search(query: string, limit: number = 20): FileMetadata[] {
    if (!this.isReady || !query.trim()) {
      return []
    }

    const start = performance.now()
    
    const results = this.miniSearch.search(query, {
      limit,
      // Apply dynamic ranking boosts
      boostDocument: (docId, term, storedFields) => {
        const file = this.fileMap.get(docId)
        if (!file) return 1

        let boost = 1
        
        // Recency boost (exponential decay over 30 days)
        if (file.modifiedTime) {
          const daysSinceModified = (Date.now() - new Date(file.modifiedTime).getTime()) / (1000 * 60 * 60 * 24)
          const recencyBoost = Math.exp(-daysSinceModified / 30)
          boost += recencyBoost * 0.3
        }
        
        // Frequency boost (if we track file opens)
        if (file.openCount) {
          const frequencyBoost = Math.log(1 + file.openCount)
          boost += frequencyBoost * 0.2
        }
        
        return boost
      }
    })

    const searchTime = performance.now() - start
    console.log(`🔍 Search "${query}" found ${results.length} results in ${Math.round(searchTime)}ms`)
    
    // Return full file metadata
    return results
      .map(result => this.fileMap.get(result.id))
      .filter((file): file is FileMetadata => file !== undefined)
  }

  /**
   * Get search statistics
   */
  getStats() {
    return {
      totalFiles: this.miniSearch.documentCount,
      isReady: this.isReady,
      memoryUsage: typeof process !== 'undefined' && process.memoryUsage ? process.memoryUsage() : { rss: 0, heapUsed: 0, heapTotal: 0, external: 0, arrayBuffers: 0 }
    }
  }

  /**
   * Track file usage for better ranking
   */
  async trackFileOpen(fileId: string): Promise<void> {
    const file = this.fileMap.get(fileId)
    if (file) {
      file.openCount = (file.openCount || 0) + 1
      file.lastOpenedTime = new Date().toISOString()
      this.fileMap.set(fileId, file)
      
      // Save periodically (not on every open to avoid too much I/O)
      if (Math.random() < 0.1) { // 10% chance to save
        await this.saveToStorage()
      }
    }
  }

  /**
   * Get the stored change token for tracking changes
   */
  async getChangeToken(): Promise<string | null> {
    try {
      if (await this.storage.exists(this.changeTokenKey)) {
        return await this.storage.read(this.changeTokenKey)
      }
    } catch (error) {
      console.warn('Failed to read change token:', error)
    }
    return null
  }

  /**
   * Store the change token for future change tracking
   */
  async saveChangeToken(token: string): Promise<void> {
    try {
      await this.storage.write(this.changeTokenKey, token)
    } catch (error) {
      console.error('Failed to save change token:', error)
    }
  }

  /**
   * Process changes from Google Drive API
   * Updates the search index based on file additions, modifications, and deletions
   */
  async processChanges(changes: Array<{
    fileId: string
    removed: boolean
    file?: FileMetadata
  }>): Promise<void> {
    if (!this.isReady || changes.length === 0) return

    const start = performance.now()
    let addedCount = 0
    let updatedCount = 0
    let removedCount = 0

    for (const change of changes) {
      try {
        if (change.removed || !change.file) {
          // File was deleted or trashed
          if (this.fileMap.has(change.fileId)) {
            await this.removeFiles([change.fileId])
            removedCount++
          }
        } else {
          // File was added or modified
          const existingFile = this.fileMap.get(change.fileId)
          if (existingFile) {
            // Update existing file
            await this.updateFiles([change.file])
            updatedCount++
          } else {
            // Add new file
            await this.addFiles([change.file])
            addedCount++
          }
        }
      } catch (error) {
        console.error(`Failed to process change for file ${change.fileId}:`, error)
      }
    }

    const timeTaken = performance.now() - start
    console.log(
      `🔄 Processed ${changes.length} changes in ${Math.round(timeTaken)}ms: ` +
      `+${addedCount} added, ~${updatedCount} updated, -${removedCount} removed`
    )
  }

  // Helper methods - fileExists is no longer needed as we use storage.exists()

  private tokenizePath(name: string): string {
    // For Google Drive, tokenize the filename for better matching
    return name
      .replace(/[._-]/g, ' ') // Replace separators with spaces
      .replace(/([a-z])([A-Z])/g, '$1 $2') // Split camelCase
      .toLowerCase()
  }

  private getTypeKeywords(mimeType: string): string {
    const keywords: string[] = []
    
    if (mimeType.includes('document')) keywords.push('doc', 'document', 'text', 'word')
    if (mimeType.includes('spreadsheet')) keywords.push('sheet', 'excel', 'csv', 'table')
    if (mimeType.includes('presentation')) keywords.push('slide', 'powerpoint', 'ppt', 'presentation')
    if (mimeType.includes('pdf')) keywords.push('pdf', 'document')
    if (mimeType.includes('folder')) keywords.push('folder', 'directory')
    if (mimeType.includes('image')) keywords.push('image', 'photo', 'picture')
    if (mimeType.includes('video')) keywords.push('video', 'movie')
    if (mimeType.includes('audio')) keywords.push('audio', 'music', 'sound')
    
    return keywords.join(' ')
  }
}

// Export singleton instance for easy use
export const searchService = new PersistentSearchService()