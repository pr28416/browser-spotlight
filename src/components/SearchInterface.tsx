import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { Search, FileText, FileSpreadsheet, File } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

import { googleDriveService } from "@/lib/googleDrive"
import { authService } from "@/lib/auth"
import { searchService } from "@/lib/persistentSearch"
import { changeSyncService } from "@/lib/changeSync"
import { indexGoogleDriveJob } from "@/jobs/indexGoogleDrive"
import { SettingsModal } from "@/components/SettingsModal"
import { FilterableSearchInput } from "@/components/FilterableSearchInput"
import type { DriveFile, SearchState } from "~types"
import type { FileTypeFilter, SearchFilters } from "@/lib/persistentSearch"

interface SearchInterfaceProps {
  title?: string
}

// Custom debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => {
      clearTimeout(handler)
    }
  }, [value, delay])

  return debouncedValue
}

export function SearchInterface({ title = "Browser Spotlight" }: SearchInterfaceProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [searchState, setSearchState] = useState<SearchState>({
    query: "",
    results: [],
    isLoading: false,
    hasMore: false,
    error: undefined
  })
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isInitializing, setIsInitializing] = useState(true)
  const [isIndexed, setIsIndexed] = useState(false)
  const [isIndexing, setIsIndexing] = useState(false)
  const [visibleCount, setVisibleCount] = useState(25) // Start with 25 visible items
  const [userEmail, setUserEmail] = useState<string | undefined>()
  const [selectedResultIndex, setSelectedResultIndex] = useState(0) // Track selected result for keyboard navigation
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  
  // Debounce search query with 300ms delay
  const debouncedSearchQuery = useDebounce(searchQuery, 300)

  // Initialize authentication and search service on component mount
  useEffect(() => {
    const initializeApp = async () => {
      setIsInitializing(true)
      try {
        // Initialize search service first
        await searchService.initialize()
        const searchStats = searchService.getStats()
        setIsIndexed(searchStats.totalFiles > 0)
        
        // Then initialize authentication
        const authenticated = await authService.initialize()
        setIsAuthenticated(authenticated)
        
        // Get user info if authenticated
        if (authenticated) {
          const userInfo = await authService.getUserInfo()
          setUserEmail(userInfo?.email)
        }
        
        if (authenticated && searchStats.totalFiles > 0) {
          // If we have an index, load recent files from it
          const recentFiles = searchService.search('', 20) // Empty query returns recent files
          setSearchState({
            query: "",
            results: recentFiles,
            hasMore: false,
            isLoading: false,
            error: undefined
          })
          
          // Start periodic change sync to keep index updated
          changeSyncService.startPeriodicSync()
        } else if (authenticated && searchStats.totalFiles === 0) {
          // No index exists, show indexing option
          console.log('No search index found. User should run initial indexing.')
        }
      } catch (error) {
        console.error("Failed to initialize app:", error)
        setSearchState(prev => ({
          ...prev,
          error: error instanceof Error ? error.message : "Initialization failed"
        }))
      } finally {
        setIsInitializing(false)
      }
    }
    
    initializeApp()
  }, [])

  const handleSearch = useCallback(async (query: string, filters: FileTypeFilter[] = []) => {
    if (!googleDriveService.isAuthenticated()) {
      setSearchState(prev => ({ ...prev, error: "Not authenticated" }))
      return
    }

    setSearchState(prev => ({ ...prev, isLoading: true, error: undefined, query }))
    setVisibleCount(25) // Reset visible count on new search

    try {
      let results: DriveFile[]
      
      if (isIndexed) {
        // Use lightning-fast persistent search with filters
        const searchFilters: SearchFilters | undefined = filters.length > 0 ? { fileTypes: filters } : undefined
        results = searchService.search(query.trim(), 1000, searchFilters) // Get up to 1000 results
      } else {
        // Fallback to direct API search if no index
        console.log('No search index available, using direct API search')
        const result = await googleDriveService.searchFiles({
          query: query.trim(),
          maxResults: 50 // Limit API results
        })
        results = result.files
      }
      
      setSearchState(prev => ({
        ...prev,
        results,
        hasMore: results.length > 50, // Show "load more" if we have more than 50 results
        isLoading: false
      }))
      
      // Reset selected index when results change
      setSelectedResultIndex(0)
    } catch (error) {
      setSearchState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : "Search failed"
      }))
    }
  }, [isIndexed])
  // Handle search with filters from FilterableSearchInput
  const handleFilterableSearch = useCallback((query: string, filters: FileTypeFilter[]) => {
    // Don't update searchQuery here to avoid infinite loops
    if (isAuthenticated && !isInitializing) {
      setVisibleCount(25)
      setSelectedResultIndex(0) // Reset selection when user types
      handleSearch(query, filters)
    }
  }, [isAuthenticated, isInitializing, handleSearch])


  // Auto-scroll to keep selected item visible
  useEffect(() => {
    if (!scrollContainerRef.current || selectedResultIndex < 0) return

    const container = scrollContainerRef.current
    const selectedElement = container.children[0]?.children[selectedResultIndex] as HTMLElement
    
    if (selectedElement) {
      const containerRect = container.getBoundingClientRect()
      const elementRect = selectedElement.getBoundingClientRect()
      
      if (elementRect.bottom > containerRect.bottom) {
        // Scroll down to show the selected item
        selectedElement.scrollIntoView({ behavior: 'smooth', block: 'end' })
      } else if (elementRect.top < containerRect.top) {
        // Scroll up to show the selected item
        selectedElement.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }
  }, [selectedResultIndex])

  // Disable the old debounced search since we're using FilterableSearchInput now
  // useEffect(() => {
  //   if (isAuthenticated && !isInitializing) {
  //     setVisibleCount(25)
  //     handleSearch(debouncedSearchQuery)
  //   }
  // }, [debouncedSearchQuery, isAuthenticated, isInitializing, handleSearch])

  // Handle scroll-based lazy loading
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container || visibleCount >= searchState.results.length) return

    const { scrollTop, scrollHeight, clientHeight } = container
    const isNearBottom = scrollTop + clientHeight >= scrollHeight - 100 // Load more when 100px from bottom

    if (isNearBottom) {
      setVisibleCount(prev => Math.min(prev + 25, searchState.results.length))
    }
  }, [visibleCount, searchState.results.length])

  // Attach scroll listener
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => container.removeEventListener('scroll', handleScroll)
  }, [handleScroll])

  const handleAuthenticate = async () => {
    setIsInitializing(true)
    try {
      const success = await googleDriveService.authenticate()
      if (success) {
        setIsAuthenticated(true)
        
        // Get user info
        const userInfo = await authService.getUserInfo()
        setUserEmail(userInfo?.email)
        
        // After authentication, check if we need to index
        const searchStats = searchService.getStats()
        if (searchStats.totalFiles === 0) {
          console.log('No search index found after authentication')
        } else {
          // Load recent files from index
          await handleSearch("")
        }
      }
    } catch (error) {
      setSearchState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : "Authentication failed"
      }))
      console.error("Authentication failed:", error)
    } finally {
      setIsInitializing(false)
    }
  }

  const handleBuildIndex = async () => {
    if (!isAuthenticated) {
      setSearchState(prev => ({
        ...prev,
        error: "Please authenticate first"
      }))
      return
    }

    setIsIndexing(true)
    setSearchState(prev => ({ ...prev, isLoading: true, error: undefined }))

    try {
      console.log('🚀 Starting Google Drive indexing...')
      const result = await indexGoogleDriveJob({ force: true })
      
      if (result.success) {
        setIsIndexed(true)
        console.log(`✅ Indexing completed: ${result.filesIndexed} files indexed`)
        
        // Load initial results from the new index
        const recentFiles = searchService.search('', 20)
        setSearchState({
          query: "",
          results: recentFiles,
          hasMore: false,
          isLoading: false,
          error: undefined
        })
        
        // Start periodic change sync now that we have an index
        changeSyncService.startPeriodicSync()
      } else {
        throw new Error(`Indexing failed: ${result.errors.join(', ')}`)
      }
    } catch (error) {
      console.error('❌ Indexing failed:', error)
      setSearchState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : "Indexing failed"
      }))
    } finally {
      setIsIndexing(false)
    }
  }

  const handleSignOut = async () => {
    try {
      // Stop change sync when signing out
      changeSyncService.stopPeriodicSync()
      
      await authService.signOut()
      setIsAuthenticated(false)
      setIsIndexed(false)
      setUserEmail(undefined)
      setSearchState({
        query: "",
        results: [],
        isLoading: false,
        hasMore: false,
        error: undefined
      })
    } catch (error) {
      console.error("Sign out failed:", error)
    }
  }

  const openFile = (file: DriveFile) => {
    // Track file usage for better ranking
    if (isIndexed) {
      searchService.trackFileOpen(file.id)
    }

    if (file.webViewLink) {
      if (typeof chrome !== "undefined" && chrome.tabs) {
        // Extension context
        chrome.tabs.create({ url: file.webViewLink })
      } else {
        // Web context
        window.open(file.webViewLink, "_blank")
      }
    } else {
      // Fallback: construct Drive URL from file ID
      googleDriveService.openFile(file.id)
    }
  }

  // Handle keyboard navigation
  const handleKeyNavigation = useCallback((e: React.KeyboardEvent) => {
    // Only handle navigation if we have results and no filter popup is showing
    if (!searchState.results.length || e.defaultPrevented) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedResultIndex(prev => 
          prev < Math.min(visibleCount - 1, searchState.results.length - 1) ? prev + 1 : prev
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedResultIndex(prev => prev > 0 ? prev - 1 : 0)
        break
      case 'Enter':
        e.preventDefault()
        if (searchState.results[selectedResultIndex]) {
          openFile(searchState.results[selectedResultIndex])
        }
        break
    }
  }, [searchState.results, selectedResultIndex, visibleCount])

  const getFileIcon = (mimeType: string) => {
    if (mimeType.includes('document')) {
      return <FileText className="h-5 w-5 text-blue-500" />
    }
    if (mimeType.includes('spreadsheet')) {
      return <FileSpreadsheet className="h-5 w-5 text-green-500" />
    }
    if (mimeType.includes('presentation')) {
      return (
        <div className="h-5 w-5 bg-orange-500 rounded-sm flex items-center justify-center">
          <div className="w-3 h-2 bg-white rounded-xs"></div>
        </div>
      )
    }
    if (mimeType.includes('pdf')) {
      return (
        <div className="h-5 w-5 bg-red-500 rounded-sm flex items-center justify-center text-white text-xs font-bold">
          P
        </div>
      )
    }
    if (mimeType.includes('folder')) {
      return (
        <div className="h-5 w-5 bg-blue-400 rounded-sm flex items-center justify-center">
          <div className="w-3 h-2 bg-blue-300 rounded-xs"></div>
        </div>
      )
    }
    if (mimeType.includes('image')) {
      return (
        <div className="h-5 w-5 bg-purple-500 rounded-sm flex items-center justify-center">
          <div className="w-2 h-2 bg-white rounded-full"></div>
        </div>
      )
    }
    // Default file icon
    return <File className="h-5 w-5 text-gray-500" />
  }

  const getFileTypeLabel = (mimeType: string) => {
    if (mimeType.includes('document')) return 'Google Doc'
    if (mimeType.includes('spreadsheet')) return 'Google Sheet'
    if (mimeType.includes('presentation')) return 'Google Slides'
    if (mimeType.includes('pdf')) return 'PDF'
    if (mimeType.includes('folder')) return 'Folder'
    if (mimeType.includes('image')) return 'Image'
    if (mimeType.includes('video')) return 'Video'
    if (mimeType.includes('audio')) return 'Audio'
    return 'File'
  }

  const formatModifiedTime = (modifiedTime?: string) => {
    if (!modifiedTime) return ''
    
    const date = new Date(modifiedTime)
    const now = new Date()
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60)
    
    if (diffInHours < 24) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } else if (diffInHours < 24 * 7) {
      return date.toLocaleDateString([], { weekday: 'short' })
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
    }
  }

  return (
    <div className="w-full max-w-2xl mx-auto p-6">
      {isInitializing ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-sm text-muted-foreground">Initializing...</div>
        </div>
      ) : !isAuthenticated ? (
        <div className="text-center space-y-6">
          <div className="space-y-2">
            <h2 className="text-lg font-medium">Connect to Google Drive</h2>
            <p className="text-sm text-muted-foreground">
              Search your files instantly
            </p>
          </div>
          <Button onClick={handleAuthenticate} disabled={isInitializing}>
            {isInitializing ? "Connecting..." : "Connect Google Drive"}
          </Button>
        </div>
      ) : !isIndexed ? (
        <div className="text-center space-y-6">
          <div className="space-y-2">
            <h2 className="text-lg font-medium">Build Search Index</h2>
            <p className="text-sm text-muted-foreground">
              Index your Google Drive files for lightning-fast search
            </p>
          </div>
          <Button onClick={handleBuildIndex} disabled={isIndexing}>
            {isIndexing ? "Building Index..." : "Build Index"}
          </Button>
          {isIndexing && (
            <p className="text-xs text-muted-foreground mt-2">
              This may take a few minutes depending on your file count
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Search Bar */}
          <FilterableSearchInput
            placeholder="Search files... (try @docs, @sheets)"
            value={searchQuery}
            onSearchChange={handleFilterableSearch}
            onKeyDown={handleKeyNavigation}
            className="h-12 text-base bg-background border-0 shadow-sm ring-1 ring-border focus:ring-2 focus:ring-ring rounded-lg"
            autoFocus
            rightSlot={
              <>
                {/* Index status indicator */}
                {isAuthenticated && isIndexed && (
                  <div className="text-xs text-green-600 flex items-center gap-1">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span>Indexed</span>
                  </div>
                )}
                
                {/* Settings button */}
                {isAuthenticated && (
                  <SettingsModal onSignOut={handleSignOut} userEmail={userEmail} />
                )}
              </>
            }
          />

          {/* Loading State */}
          {searchState.isLoading && (
            <div className="flex items-center justify-center py-8">
              <div className="text-sm text-muted-foreground">Searching...</div>
            </div>
          )}

          {/* Error State */}
          {searchState.error && (
            <div className="flex items-center justify-center py-8">
              <div className="text-sm text-destructive">{searchState.error}</div>
            </div>
          )}

          {/* Results List */}
          {searchState.results.length > 0 && (
            <div className="space-y-2">
              {/* Results summary */}
              <div className="text-xs text-muted-foreground px-1">
                Showing {Math.min(visibleCount, searchState.results.length)} of {searchState.results.length} results
              </div>
              
              {/* Virtual scrolling container */}
              <div 
                ref={scrollContainerRef}
                className="max-h-96 overflow-y-auto"
              >
                <div className="space-y-1">
                  {/* Only render visible items */}
                  {searchState.results.slice(0, visibleCount).map((file, index) => (
                    <div
                      key={file.id}
                      className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors group ${
                        index === selectedResultIndex 
                          ? 'bg-primary/10 border border-primary/20' 
                          : 'hover:bg-muted/50'
                      }`}
                      onClick={() => openFile(file)}
                    >
                      <div className="flex-shrink-0 group-hover:scale-110 transition-transform">
                        {getFileIcon(file.mimeType)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate group-hover:text-foreground transition-colors">
                          {file.name}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                          <span>{getFileTypeLabel(file.mimeType)}</span>
                          {file.modifiedTime && (
                            <>
                              <span className="text-muted-foreground/60">•</span>
                              <span>Modified {formatModifiedTime(file.modifiedTime)}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {/* Loading indicator for more results */}
                  {visibleCount < searchState.results.length && (
                    <div className="flex justify-center py-2">
                      <div className="text-xs text-muted-foreground animate-pulse">
                        Scroll to load more...
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Empty State */}
          {searchState.query && !searchState.isLoading && searchState.results.length === 0 && (
            <div className="flex items-center justify-center py-8">
              <div className="text-sm text-muted-foreground">
                No files found for "{searchState.query}"
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}