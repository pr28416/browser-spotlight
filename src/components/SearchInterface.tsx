import { useState, useEffect, useCallback, useMemo } from "react"
import { Search, FileText, FileSpreadsheet, File, LogOut } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

import { googleDriveService } from "@/lib/googleDrive"
import { authService } from "@/lib/auth"
import type { DriveFile, SearchState } from "~types"

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
  
  // Debounce search query with 300ms delay
  const debouncedSearchQuery = useDebounce(searchQuery, 300)

  // Initialize authentication on component mount
  useEffect(() => {
    const initializeAuth = async () => {
      setIsInitializing(true)
      try {
        const authenticated = await authService.initialize()
        setIsAuthenticated(authenticated)
        
        if (authenticated) {
          // Load recent files if authenticated - call search directly to avoid dependency
          try {
            const result = await googleDriveService.searchFiles({
              query: "",
              maxResults: 20
            })
            setSearchState({
              query: "",
              results: result.files,
              hasMore: !!result.nextPageToken,
              nextPageToken: result.nextPageToken,
              isLoading: false,
              error: undefined
            })
          } catch (error) {
            console.error("Failed to load initial files:", error)
          }
        }
      } catch (error) {
        console.error("Failed to initialize authentication:", error)
      } finally {
        setIsInitializing(false)
      }
    }
    
    initializeAuth()
  }, [])

  const handleSearch = useCallback(async (query: string) => {
    if (!googleDriveService.isAuthenticated()) {
      setSearchState(prev => ({ ...prev, error: "Not authenticated" }))
      return
    }

    setSearchState(prev => ({ ...prev, isLoading: true, error: undefined, query }))

    try {
      const result = await googleDriveService.searchFiles({
        query: query.trim(),
        maxResults: 20
      })
      
      setSearchState(prev => ({
        ...prev,
        results: result.files,
        hasMore: !!result.nextPageToken,
        nextPageToken: result.nextPageToken,
        isLoading: false
      }))
    } catch (error) {
      setSearchState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : "Search failed"
      }))
    }
  }, [])

  // Trigger search when debounced query changes
  useEffect(() => {
    if (isAuthenticated && !isInitializing) {
      handleSearch(debouncedSearchQuery)
    }
  }, [debouncedSearchQuery, isAuthenticated, isInitializing, handleSearch])

  const handleAuthenticate = async () => {
    setIsInitializing(true)
    try {
      const success = await googleDriveService.authenticate()
      if (success) {
        setIsAuthenticated(true)
        // Load recent files after successful authentication
        await handleSearch("")
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

  const handleSignOut = async () => {
    try {
      await authService.signOut()
      setIsAuthenticated(false)
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
      ) : (
        <div className="space-y-4">
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-12 text-base bg-background border-0 shadow-sm ring-1 ring-border focus:ring-2 focus:ring-ring rounded-lg"
              autoFocus
            />
            {/* Subtle sign out option in corner */}
            {isAuthenticated && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSignOut}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
              >
                <LogOut className="h-3 w-3" />
              </Button>
            )}
          </div>

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
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {searchState.results.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors group"
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