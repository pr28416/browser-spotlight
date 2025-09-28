import { googleDriveService } from './googleDrive'
import { searchService } from './persistentSearch'

export class ChangeSyncService {
  private syncInterval: NodeJS.Timeout | null = null
  private isSyncing: boolean = false

  /**
   * Start periodic sync to check for changes every few minutes
   */
  startPeriodicSync(intervalMs: number = 5 * 60 * 1000): void { // Default: 5 minutes
    if (this.syncInterval) {
      this.stopPeriodicSync()
    }

    console.log('📅 Starting periodic change sync every', Math.round(intervalMs / 1000), 'seconds')
    
    // Initial sync
    this.syncChanges()
    
    // Set up periodic sync
    this.syncInterval = setInterval(() => {
      this.syncChanges()
    }, intervalMs)
  }

  /**
   * Stop periodic sync
   */
  stopPeriodicSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval)
      this.syncInterval = null
      console.log('⏹️ Stopped periodic change sync')
    }
  }

  /**
   * Manually trigger a sync to check for changes
   */
  async syncChanges(): Promise<{
    success: boolean
    changesProcessed: number
    error?: string
  }> {
    if (this.isSyncing) {
      console.log('⏳ Sync already in progress, skipping...')
      return { success: false, changesProcessed: 0, error: 'Sync already in progress' }
    }

    if (!googleDriveService.isAuthenticated()) {
      return { success: false, changesProcessed: 0, error: 'Not authenticated' }
    }

    this.isSyncing = true
    
    try {
      console.log('🔄 Starting change sync...')
      const start = performance.now()

      // Get the stored change token
      let changeToken = await searchService.getChangeToken()
      
      if (!changeToken) {
        // No change token stored - this is first time setup
        console.log('🆕 No change token found, getting current token for future changes')
        changeToken = await googleDriveService.getStartPageToken()
        await searchService.saveChangeToken(changeToken)
        console.log('✅ Saved initial change token for future tracking')
        return { success: true, changesProcessed: 0 }
      }

      // Get changes since the stored token
      let allChanges: Array<{
        fileId: string
        removed: boolean
        file?: any
      }> = []

      let nextPageToken = changeToken
      let hasMorePages = true

      while (hasMorePages) {
        try {
          const result = await googleDriveService.getChanges(nextPageToken)
          
          // Filter out changes we don't care about (only files, not folders)
          const relevantChanges = result.changes.filter(change => {
            // Skip if removed (we'll handle these)
            if (change.removed) return true
            // Skip if no file data
            if (!change.file) return false
            // Skip folders (we only index files)
            if (change.file.mimeType === 'application/vnd.google-apps.folder') return false
            // Skip trashed files
            return true
          })

          allChanges.push(...relevantChanges)
          
          if (result.newStartPageToken) {
            // We've reached the end, save the new token
            await searchService.saveChangeToken(result.newStartPageToken)
            hasMorePages = false
          } else if (result.nextPageToken) {
            // More pages to fetch
            nextPageToken = result.nextPageToken
          } else {
            // No more pages
            hasMorePages = false
          }
        } catch (error) {
          console.error('Error fetching changes page:', error)
          break
        }
      }

      // Process the changes
      if (allChanges.length > 0) {
        await searchService.processChanges(allChanges)
      }

      const timeTaken = performance.now() - start
      console.log(`✅ Change sync completed in ${Math.round(timeTaken)}ms: ${allChanges.length} changes processed`)
      
      return { success: true, changesProcessed: allChanges.length }

    } catch (error) {
      console.error('❌ Change sync failed:', error)
      return { 
        success: false, 
        changesProcessed: 0, 
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    } finally {
      this.isSyncing = false
    }
  }

  /**
   * Initialize change tracking after a full index build
   * This sets up the initial change token for future tracking
   */
  async initializeChangeTracking(): Promise<void> {
    try {
      console.log('🎯 Initializing change tracking...')
      const startToken = await googleDriveService.getStartPageToken()
      await searchService.saveChangeToken(startToken)
      console.log('✅ Change tracking initialized with token:', startToken.substring(0, 20) + '...')
    } catch (error) {
      console.error('❌ Failed to initialize change tracking:', error)
    }
  }

  /**
   * Get sync status
   */
  getSyncStatus() {
    return {
      isPeriodicSyncActive: this.syncInterval !== null,
      isSyncing: this.isSyncing
    }
  }
}

// Export singleton instance
export const changeSyncService = new ChangeSyncService()