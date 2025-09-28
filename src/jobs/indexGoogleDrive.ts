import { searchService } from '../lib/persistentSearch'
import { googleDriveService } from '../lib/googleDrive'
import { changeSyncService } from '../lib/changeSync'
import type { DriveFile } from '~types'

interface IndexJobOptions {
  force?: boolean // Force full re-index even if one exists
  userId?: string // Future: support for multiple users
}

interface IndexJobResult {
  success: boolean
  filesIndexed: number
  timeTaken: number
  errors: string[]
}

/**
 * Main indexing job that scrapes Google Drive and builds the search index
 */
export async function indexGoogleDriveJob(options: IndexJobOptions = {}): Promise<IndexJobResult> {
  const startTime = performance.now()
  const errors: string[] = []
  let filesIndexed = 0

  console.log('🚀 Starting Google Drive indexing job...')

  try {
    // 1. Initialize the search service
    await searchService.initialize()
    
    // 2. Check if we should skip if already indexed
    const stats = searchService.getStats()
    if (!options.force && stats.totalFiles > 0) {
      console.log(`⏭️ Index already exists with ${stats.totalFiles} files. Use force=true to re-index.`)
      return {
        success: true,
        filesIndexed: 0,
        timeTaken: performance.now() - startTime,
        errors: ['Index already exists - skipped']
      }
    }

    // 3. Verify Google Drive authentication
    if (!googleDriveService.isAuthenticated()) {
      throw new Error('Google Drive not authenticated. Please authenticate first.')
    }

    console.log('📥 Fetching all files from Google Drive...')
    
    // 4. Fetch all files from Google Drive with pagination
    const allFiles: DriveFile[] = []
    let pageToken: string | undefined
    let pageCount = 0

    do {
      try {
        const result = await googleDriveService.listFiles(pageToken)
        allFiles.push(...result.files)
        pageToken = result.nextPageToken
        pageCount++
        
        console.log(`📄 Page ${pageCount}: Fetched ${result.files.length} files (total: ${allFiles.length})`)
        
        // Add a small delay to respect rate limits
        if (pageToken) {
          await sleep(100) // 100ms delay between pages
        }
        
      } catch (error) {
        const errorMsg = `Failed to fetch page ${pageCount}: ${error}`
        console.error('❌', errorMsg)
        errors.push(errorMsg)
        
        // Break on repeated failures
        if (errors.length > 5) {
          throw new Error(`Too many page fetch failures: ${errors.join(', ')}`)
        }
        
        // Continue with what we have
        break
      }
    } while (pageToken)

    console.log(`📊 Fetched ${allFiles.length} total files from Google Drive`)

    if (allFiles.length === 0) {
      console.log('📭 No files found in Google Drive')
      return {
        success: true,
        filesIndexed: 0,
        timeTaken: performance.now() - startTime,
        errors: ['No files found']
      }
    }

    // 5. Clear existing index and rebuild
    console.log('🗑️ Clearing existing index...')
    await searchService.replaceIndex([]) // Clear the index
    
    // 6. Add all files to the search index in batches
    console.log('🔨 Building search index...')
    const batchSize = 100
    let batchCount = 0
    
    for (let i = 0; i < allFiles.length; i += batchSize) {
      const batch = allFiles.slice(i, i + batchSize)
      batchCount++
      
      try {
        await searchService.addFiles(batch)
        filesIndexed += batch.length
        console.log(`✅ Indexed batch ${batchCount}: ${batch.length} files (total: ${filesIndexed}/${allFiles.length})`)
        
        // Small delay between batches
        await sleep(50)
        
      } catch (error) {
        const errorMsg = `Failed to index batch ${batchCount}: ${error}`
        console.error('❌', errorMsg)
        errors.push(errorMsg)
        // Continue with next batch
      }
    }

    const timeTaken = performance.now() - startTime
    
    console.log('🎉 Google Drive indexing job completed!')
    console.log(`📊 Results:`)
    console.log(`   • Files indexed: ${filesIndexed}/${allFiles.length}`)
    console.log(`   • Time taken: ${Math.round(timeTaken)}ms`)
    console.log(`   • Errors: ${errors.length}`)
    
    if (errors.length > 0) {
      console.log(`⚠️ Errors encountered:`)
      errors.forEach(error => console.log(`   • ${error}`))
    }

    // 7. Verify the index was built correctly
    const finalStats = searchService.getStats()
    console.log(`✅ Index verification: ${finalStats.totalFiles} files in search index`)

    // 8. Initialize change tracking for future updates
    if (filesIndexed > 0) {
      await changeSyncService.initializeChangeTracking()
    }

    return {
      success: filesIndexed > 0,
      filesIndexed,
      timeTaken,
      errors
    }

  } catch (error) {
    const timeTaken = performance.now() - startTime
    const errorMsg = `Indexing job failed: ${error}`
    console.error('❌', errorMsg)
    errors.push(errorMsg)

    return {
      success: false,
      filesIndexed,
      timeTaken,
      errors
    }
  }
}

/**
 * Utility function to run incremental sync (for future use)
 */
export async function incrementalSyncJob(): Promise<IndexJobResult> {
  const startTime = performance.now()
  const errors: string[] = []

  console.log('🔄 Starting incremental sync job...')

  try {
    await searchService.initialize()
    
    // For now, we'll do a simple approach - check files modified in last 24 hours
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    
    console.log(`🔍 Checking for files modified since ${yesterday.toISOString()}`)
    
    // Search for recently modified files
    const result = await googleDriveService.searchFiles({
      query: `modifiedTime>'${yesterday.toISOString()}'`,
      maxResults: 1000
    })

    if (result.files.length === 0) {
      console.log('✅ No recent changes detected')
      return {
        success: true,
        filesIndexed: 0,
        timeTaken: performance.now() - startTime,
        errors: []
      }
    }

    console.log(`🔄 Found ${result.files.length} recently modified files`)
    
    // Update these files in the index
    await searchService.updateFiles(result.files)
    
    const timeTaken = performance.now() - startTime
    console.log(`✅ Incremental sync completed: ${result.files.length} files updated in ${Math.round(timeTaken)}ms`)

    return {
      success: true,
      filesIndexed: result.files.length,
      timeTaken,
      errors
    }

  } catch (error) {
    const timeTaken = performance.now() - startTime
    const errorMsg = `Incremental sync failed: ${error}`
    console.error('❌', errorMsg)
    errors.push(errorMsg)

    return {
      success: false,
      filesIndexed: 0,
      timeTaken,
      errors
    }
  }
}

/**
 * Command-line interface for running the indexing job
 */
export async function runIndexingJobCLI(): Promise<void> {
  const args = process.argv.slice(2)
  const force = args.includes('--force')
  const incremental = args.includes('--incremental')

  try {
    let result: IndexJobResult

    if (incremental) {
      result = await incrementalSyncJob()
    } else {
      result = await indexGoogleDriveJob({ force })
    }

    if (result.success) {
      console.log('✅ Job completed successfully')
      process.exit(0)
    } else {
      console.error('❌ Job failed')
      process.exit(1)
    }
  } catch (error) {
    console.error('💥 Job crashed:', error)
    process.exit(1)
  }
}

// Helper function
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// If this file is run directly, execute the CLI
if (require.main === module) {
  runIndexingJobCLI()
}