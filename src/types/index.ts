export interface DriveFile {
  id: string
  name: string
  mimeType: string
  parents?: string[]
  webViewLink?: string
  iconLink?: string
  thumbnailLink?: string
  modifiedTime?: string
  size?: string
  owners?: Array<{
    displayName: string
    emailAddress: string
  }>
  lastModifyingUser?: {
    displayName: string
    emailAddress: string
  }
}

export interface SearchResult {
  files: DriveFile[]
  nextPageToken?: string
}

export interface FileSearchQuery {
  query: string
  mimeType?: string
  maxResults?: number
  pageToken?: string
}

export interface AuthState {
  isAuthenticated: boolean
  accessToken?: string
  refreshToken?: string
  expiresAt?: number
}

export interface SearchState {
  query: string
  results: DriveFile[]
  isLoading: boolean
  hasMore: boolean
  nextPageToken?: string
  error?: string
}

export interface DriveService {
  authenticate(): Promise<boolean>
  listFiles(pageToken?: string): Promise<SearchResult>
  searchFiles(query: FileSearchQuery): Promise<SearchResult>
  getFileMetadata(fileId: string): Promise<DriveFile>
  openFile(fileId: string): void
  isAuthenticated(): boolean
}