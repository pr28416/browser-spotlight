import { authService } from "./auth"
import type { DriveFile, SearchResult, FileSearchQuery, DriveService } from "~types"

const DRIVE_API_BASE_URL = "https://www.googleapis.com/drive/v3"
const DEFAULT_FIELDS = "nextPageToken,files(id,name,mimeType,parents,webViewLink,iconLink,thumbnailLink,modifiedTime,size,owners,lastModifyingUser)"

class GoogleDriveService implements DriveService {
  async authenticate(): Promise<boolean> {
    await authService.initialize()
    if (authService.isAuthenticated()) {
      return true
    }
    return authService.authenticate()
  }

  isAuthenticated(): boolean {
    return authService.isAuthenticated()
  }

  async listFiles(pageToken?: string): Promise<SearchResult> {
    return this.searchFiles({
      query: "",
      maxResults: 50,
      pageToken
    })
  }

  async searchFiles(searchQuery: FileSearchQuery): Promise<SearchResult> {
    const accessToken = authService.getAccessToken()
    if (!accessToken) {
      throw new Error("Not authenticated")
    }

    // Try fullText search first, fallback to name-only if it fails
    try {
      return await this.performSearch(searchQuery, true)
    } catch (error: any) {
      // If we get a 403 error, it might be due to fullText permissions
      if (error.message?.includes('403') && searchQuery.query.trim()) {
        console.warn("fullText search failed, falling back to name-only search")
        try {
          return await this.performSearch(searchQuery, false)
        } catch (fallbackError) {
          console.error("Both fullText and name-only search failed:", fallbackError)
          throw fallbackError
        }
      }
      throw error
    }
  }

  private async performSearch(searchQuery: FileSearchQuery, useFullText: boolean): Promise<SearchResult> {
    const accessToken = authService.getAccessToken()
    if (!accessToken) {
      throw new Error("Not authenticated")
    }

    const params = new URLSearchParams({
      fields: DEFAULT_FIELDS,
      pageSize: (searchQuery.maxResults || 50).toString()
    })

    if (searchQuery.pageToken) {
      params.append("pageToken", searchQuery.pageToken)
    }

    // Build the query string for Google Drive API
    let q = "trashed=false" // Exclude trashed files

    if (searchQuery.query.trim()) {
      const searchTerm = searchQuery.query.trim().replace(/'/g, "\\'")
      if (useFullText) {
        // Search in name and content
        q += ` and (name contains '${searchTerm}' or fullText contains '${searchTerm}')`
      } else {
        // Search only in name
        q += ` and name contains '${searchTerm}'`
      }
    }

    if (searchQuery.mimeType) {
      q += ` and mimeType='${searchQuery.mimeType}'`
    }

    params.append("q", q)
    params.append("orderBy", "modifiedTime desc,name")

    const response = await fetch(`${DRIVE_API_BASE_URL}/files?${params.toString()}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      if (response.status === 401) {
        // Token expired, try to refresh
        await authService.signOut()
        throw new Error("Authentication expired. Please sign in again.")
      }
      throw new Error(`Drive API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    
    return {
      files: data.files?.map((file: any) => this.transformDriveFile(file)) || [],
      nextPageToken: data.nextPageToken
    }
  }

  async getFileMetadata(fileId: string): Promise<DriveFile> {
    const accessToken = authService.getAccessToken()
    if (!accessToken) {
      throw new Error("Not authenticated")
    }

    try {
      const params = new URLSearchParams({
        fields: DEFAULT_FIELDS.replace("nextPageToken,files(", "").replace(")", "")
      })

      const response = await fetch(`${DRIVE_API_BASE_URL}/files/${fileId}?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error(`Failed to get file metadata: ${response.status} ${response.statusText}`)
      }

      const file = await response.json()
      return this.transformDriveFile(file)
    } catch (error) {
      console.error("Get file metadata error:", error)
      throw error
    }
  }

  openFile(fileId: string): void {
    const file = { webViewLink: `https://drive.google.com/file/d/${fileId}/view` }
    
    if (typeof chrome !== "undefined" && chrome.tabs) {
      // Extension context
      chrome.tabs.create({ url: file.webViewLink })
    } else {
      // Web context
      window.open(file.webViewLink, "_blank")
    }
  }

  private transformDriveFile(file: any): DriveFile {
    return {
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      parents: file.parents,
      webViewLink: file.webViewLink,
      iconLink: file.iconLink,
      thumbnailLink: file.thumbnailLink,
      modifiedTime: file.modifiedTime,
      size: file.size,
      owners: file.owners,
      lastModifyingUser: file.lastModifyingUser
    }
  }

  // Helper methods for file type filtering
  async searchDocuments(query: string = "", pageToken?: string): Promise<SearchResult> {
    return this.searchFiles({
      query,
      mimeType: "application/vnd.google-apps.document",
      pageToken
    })
  }

  async searchSpreadsheets(query: string = "", pageToken?: string): Promise<SearchResult> {
    return this.searchFiles({
      query,
      mimeType: "application/vnd.google-apps.spreadsheet", 
      pageToken
    })
  }

  async searchPresentations(query: string = "", pageToken?: string): Promise<SearchResult> {
    return this.searchFiles({
      query,
      mimeType: "application/vnd.google-apps.presentation",
      pageToken
    })
  }

  async searchPDFs(query: string = "", pageToken?: string): Promise<SearchResult> {
    return this.searchFiles({
      query,
      mimeType: "application/pdf",
      pageToken
    })
  }

  /**
   * Get the current change token for the user's Drive
   * This token can be used to track changes since this point in time
   */
  async getStartPageToken(): Promise<string> {
    const accessToken = authService.getAccessToken()
    if (!accessToken) {
      throw new Error("Not authenticated")
    }

    const response = await fetch(`${DRIVE_API_BASE_URL}/changes/startPageToken`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      if (response.status === 401) {
        await authService.signOut()
        throw new Error("Authentication expired. Please sign in again.")
      }
      throw new Error(`Drive API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    return data.startPageToken
  }

  /**
   * Get changes since the specified page token
   * Returns list of changed files and a new page token
   */
  async getChanges(pageToken: string): Promise<{
    changes: Array<{
      fileId: string
      removed: boolean
      file?: DriveFile
    }>
    nextPageToken: string
    newStartPageToken?: string
  }> {
    const accessToken = authService.getAccessToken()
    if (!accessToken) {
      throw new Error("Not authenticated")
    }

    const params = new URLSearchParams({
      pageToken,
      fields: `nextPageToken,newStartPageToken,changes(fileId,removed,file(${DEFAULT_FIELDS.replace('nextPageToken,files(', '').replace(')', '')}))`
    })

    const response = await fetch(`${DRIVE_API_BASE_URL}/changes?${params.toString()}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      if (response.status === 401) {
        await authService.signOut()
        throw new Error("Authentication expired. Please sign in again.")
      }
      throw new Error(`Drive API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    
    return {
      changes: data.changes?.map((change: any) => ({
        fileId: change.fileId,
        removed: change.removed || false,
        file: change.file ? this.transformDriveFile(change.file) : undefined
      })) || [],
      nextPageToken: data.nextPageToken,
      newStartPageToken: data.newStartPageToken
    }
  }
}

// Export singleton instance
export const googleDriveService = new GoogleDriveService()