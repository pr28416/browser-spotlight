# Browser Spotlight - Custom Indexing Architecture

## Overview

This document outlines the architecture for building a custom indexing system that will replace direct API calls to external services (Google Drive, OneDrive, GitHub, etc.) with a fast, searchable local index.

## High-Level Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Backend API   │    │   Job Queue     │
│                 │    │                 │    │                 │
│ - Search UI     │◄──►│ - User Auth     │◄──►│ - Index Jobs    │
│ - Auth Flow     │    │ - Search API    │    │ - Sync Jobs     │
│ - Integration   │    │ - Integration   │    │ - Cleanup Jobs  │
│   Management    │    │   Management    │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │                        │
                                ▼                        ▼
                       ┌─────────────────┐    ┌─────────────────┐
                       │   Database      │    │   Source APIs   │
                       │                 │    │                 │
                       │ - User Data     │    │ - Google Drive  │
                       │ - Integrations  │    │ - OneDrive      │
                       │ - File Index    │    │ - GitHub        │
                       │ - Search Index  │    │ - Notion, etc.  │
                       └─────────────────┘    └─────────────────┘
```

## Core Components

### 1. User Authentication & Management

**Technology**: Supabase Auth + Database
- Separate user identity from integrations
- Users can connect multiple sources
- JWT-based auth for frontend/backend communication

**User Flow**:
1. User signs up/in via Supabase Auth
2. User connects integrations (Google Drive, OneDrive, etc.)
3. Background jobs index their connected sources
4. User searches across all connected sources

### 2. Integration Management

**Integration Types**:
- **Google Drive**: OAuth2, files, folders, permissions
- **OneDrive**: Microsoft Graph API
- **GitHub**: GitHub API, repositories, issues, PRs
- **Notion**: Notion API, pages, databases
- **Local Files**: File system indexing (future)

**Integration Schema**:
```sql
CREATE TABLE integrations (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  type TEXT NOT NULL, -- 'google_drive', 'onedrive', 'github'
  name TEXT NOT NULL, -- User-friendly name
  config JSONB NOT NULL, -- API tokens, settings
  status TEXT NOT NULL, -- 'active', 'error', 'indexing'
  last_sync_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### 3. File Index Database Design

**Core Tables**:

```sql
-- Main file index
CREATE TABLE files (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  integration_id UUID REFERENCES integrations(id),
  
  -- Universal file properties
  external_id TEXT NOT NULL, -- ID from source system
  name TEXT NOT NULL,
  path TEXT, -- Best-effort path reconstruction
  mime_type TEXT,
  size_bytes BIGINT,
  
  -- Timestamps
  created_at TIMESTAMP,
  modified_at TIMESTAMP,
  indexed_at TIMESTAMP DEFAULT NOW(),
  
  -- Source-specific data
  source_data JSONB, -- Store raw API response
  
  -- Search optimization
  content_text TEXT, -- Extracted text content
  search_vector tsvector, -- PostgreSQL full-text search
  
  -- Indexes
  UNIQUE(user_id, integration_id, external_id)
);

-- Search index for fast lookups
CREATE INDEX idx_files_search ON files USING GIN(search_vector);
CREATE INDEX idx_files_user_modified ON files(user_id, modified_at DESC);
CREATE INDEX idx_files_user_name ON files(user_id, name);

-- File hierarchy/relationships
CREATE TABLE file_relationships (
  id UUID PRIMARY KEY,
  parent_file_id UUID REFERENCES files(id),
  child_file_id UUID REFERENCES files(id),
  relationship_type TEXT -- 'parent', 'shortcut', 'share'
);
```

### 4. Indexing Jobs System

**Technology**: 
- **Queue**: Bull/BullMQ with Redis
- **Worker**: Node.js background processes
- **Scheduling**: Cron jobs for periodic sync

**Job Types**:

```typescript
// Job definitions
interface IndexJob {
  type: 'full_index' | 'incremental_sync' | 'single_file'
  userId: string
  integrationId: string
  options: {
    force?: boolean
    startTime?: Date
    fileId?: string
  }
}
```

**Job Workflows**:

1. **Full Index** (Initial or forced rebuild):
   ```
   1. Delete existing files for integration
   2. Recursively fetch all files from source
   3. Process and store each file
   4. Build search vectors
   5. Update integration status
   ```

2. **Incremental Sync** (Regular updates):
   ```
   1. Get last sync timestamp
   2. Fetch changes since last sync
   3. Process additions, updates, deletions
   4. Update search vectors for changed files
   5. Update last sync timestamp
   ```

3. **Content Extraction** (For searchable text):
   ```
   1. Download file content (if supported)
   2. Extract text using appropriate parser
   3. Store extracted content
   4. Update search vector
   ```

### 5. Search Engine - Practical Library-Based Approach

**The AI advice is spot-on but complex. Let's use proven libraries instead:**

#### Option 1: MiniSearch (Recommended for MVP)
**Technology**: In-memory JavaScript search with disk persistence
```bash
npm install minisearch
```

**Why MiniSearch**:
- Sub-10ms search responses
- Fuzzy search, prefix matching, and ranking built-in
- Auto-suggestion and typo tolerance
- Tiny bundle size (~20KB)
- Perfect for launcher-style UX

```typescript
import MiniSearch from 'minisearch'

const searchEngine = new MiniSearch({
  fields: ['name', 'path', 'content'], // fields to search
  storeFields: ['name', 'path', 'mimeType', 'modifiedTime'], // fields to return
  searchOptions: {
    boost: { name: 2 }, // boost filename matches
    fuzzy: 0.2, // allow typos
    prefix: true, // enable prefix search
    combineWith: 'AND'
  }
})
```

#### Option 2: Fuse.js (Great balance)
**Technology**: Lightweight fuzzy search
```bash
npm install fuse.js
```

**Perfect for launcher-style search**:
```typescript
import Fuse from 'fuse.js'

const fuse = new Fuse(files, {
  keys: [
    { name: 'name', weight: 0.7 },
    { name: 'path', weight: 0.2 },
    { name: 'content', weight: 0.1 }
  ],
  threshold: 0.3, // fuzzy matching sensitivity
  includeScore: true,
  includeMatches: true
})
```

#### Option 3: FlexSearch (Fastest)
**Technology**: Ultra-fast in-memory search
```bash
npm install flexsearch
```

**Blazing fast performance**:
```typescript
import { Index } from 'flexsearch'

const index = new Index({
  preset: 'match', // or 'score', 'speed', 'memory'
  tokenize: 'forward',
  resolution: 5,
  cache: true
})
```

#### Hybrid Approach (Recommended Architecture)

```typescript
class SearchService {
  private miniSearch: MiniSearch
  private fileMap: Map<string, FileMetadata>
  
  constructor() {
    this.miniSearch = new MiniSearch({
      fields: ['name', 'pathTokens', 'typeKeywords'],
      storeFields: ['id', 'name', 'path', 'mimeType', 'modifiedTime'],
      searchOptions: {
        boost: {
          name: 3,        // Boost filename matches most
          pathTokens: 1,  // Path components
          typeKeywords: 2 // File type keywords
        },
        fuzzy: 0.2,
        prefix: true,
        combineWith: 'AND'
      }
    })
  }
  
  addFiles(files: FileMetadata[]) {
    const searchableFiles = files.map(file => ({
      id: file.id,
      name: file.name,
      pathTokens: this.tokenizePath(file.path),
      typeKeywords: this.getTypeKeywords(file.mimeType),
      // Store in map for fast retrieval
    }))
    
    this.miniSearch.addAll(searchableFiles)
    files.forEach(file => this.fileMap.set(file.id, file))
  }
  
  search(query: string, options: SearchOptions = {}): SearchResult {
    const results = this.miniSearch.search(query, {
      ...options,
      // Apply ranking boosts
      boostDocument: (docId, term, storedFields) => {
        const file = this.fileMap.get(docId)
        if (!file) return 1
        
        // Recency boost (exponential decay)
        const daysSinceModified = (Date.now() - new Date(file.modifiedTime).getTime()) / (1000 * 60 * 60 * 24)
        const recencyBoost = Math.exp(-daysSinceModified / 30) // 30-day half-life
        
        // Frequency boost (if we track usage)
        const frequencyBoost = Math.log(1 + (file.openCount || 0))
        
        return 1 + (recencyBoost * 0.3) + (frequencyBoost * 0.2)
      }
    })
    
    return {
      files: results.map(r => this.fileMap.get(r.id)).filter(Boolean),
      total: results.length,
      query,
      took: performance.now() - start
    }
  }
  
  private tokenizePath(path: string): string {
    return path.split('/').filter(Boolean).join(' ')
  }
  
  private getTypeKeywords(mimeType: string): string {
    const keywords = []
    if (mimeType.includes('document')) keywords.push('doc', 'document', 'text')
    if (mimeType.includes('spreadsheet')) keywords.push('sheet', 'excel', 'csv')
    if (mimeType.includes('presentation')) keywords.push('slide', 'powerpoint')
    return keywords.join(' ')
  }
}
```

**Performance Targets with Libraries**:
- **Search Response**: < 10ms for 100K files
- **Index Build**: < 2s for 10K files
- **Memory Usage**: ~50MB for 100K files
- **Startup Time**: < 100ms index load

**Persistence Strategy**:
```typescript
// Save index to disk
JSON.stringify(miniSearch.toJSON()) // Serialize

// Load index from disk
const savedIndex = JSON.parse(indexData)
miniSearch = MiniSearch.loadJSON(savedIndex, options)
```

### 6. Source Adapters

**Abstract Interface**:
```typescript
interface SourceAdapter {
  // Connection management
  connect(config: IntegrationConfig): Promise<void>
  disconnect(): Promise<void>
  validateConnection(): Promise<boolean>

  // File operations
  listFiles(options: ListOptions): Promise<FileMetadata[]>
  getFileContent(fileId: string): Promise<FileContent>
  getFileMetadata(fileId: string): Promise<FileMetadata>
  
  // Change detection
  getChanges(since: Date): Promise<FileChange[]>
  
  // Pagination
  hasNextPage(): boolean
  getNextPage(): Promise<FileMetadata[]>
}
```

**Implementation per source**:
- `GoogleDriveAdapter`
- `OneDriveAdapter` 
- `GitHubAdapter`
- `NotionAdapter`

## Simplified Implementation Plan (Using Libraries)

### Phase 1: MVP with MiniSearch (Week 1-2)
- [ ] Set up Supabase project and auth
- [ ] Create user management system  
- [ ] Simple database schema (users, integrations, basic file metadata)
- [ ] Implement MiniSearch-based search service
- [ ] Migrate existing Google Drive code to new architecture
- [ ] Build launcher-style search UI

**Deliverable**: Fast search for Google Drive files with <10ms response time

### Phase 2: Background Indexing (Week 3-4)
- [ ] Add simple job queue (Redis + Bull)
- [ ] Build Google Drive indexing job
- [ ] Implement index persistence to disk
- [ ] Add incremental sync capability
- [ ] Error handling and retry logic

**Deliverable**: Reliable background indexing that stays in sync

### Phase 3: Polish & Scale (Week 5-6)
- [ ] Add usage tracking for ranking boosts
- [ ] Implement content extraction for searchable text
- [ ] Performance monitoring and optimization
- [ ] Better error states and loading indicators
- [ ] Index compression and memory optimization

**Deliverable**: Production-ready search with content search

### Phase 4: Multi-Source (Week 7+)
- [ ] Abstract the search service for multiple sources
- [ ] Add OneDrive/GitHub adapters
- [ ] Cross-source search and filtering
- [ ] Integration management UI

**Deliverable**: Universal search across multiple sources

### Alternative: Start Even Simpler (Weekend MVP)

If you want to validate the concept quickly:

```typescript
// Weekend prototype approach
class SimpleSearchService {
  private fuse: Fuse<FileMetadata>
  
  constructor() {
    this.fuse = new Fuse([], {
      keys: ['name', 'path'],
      threshold: 0.3,
      includeScore: true
    })
  }
  
  async indexGoogleDrive(userId: string) {
    // Fetch all files from Google Drive
    const files = await googleDriveService.getAllFiles()
    
    // Store in Supabase
    await supabase.from('files').upsert(files.map(f => ({
      user_id: userId,
      external_id: f.id,
      name: f.name,
      path: f.path,
      mime_type: f.mimeType,
      modified_at: f.modifiedTime
    })))
    
    // Update search index
    this.fuse.setCollection(files)
  }
  
  search(query: string) {
    return this.fuse.search(query, { limit: 20 })
  }
}
```

**This gives you**:
- Lightning-fast search in a weekend
- Proof of concept for the full architecture
- Something to show users for feedback
- Clear path to scale up

## Technical Considerations

### Performance
- **Database**: Use proper indexing, consider partitioning by user
- **Caching**: Redis for search results and file metadata
- **Content Extraction**: Queue heavy operations, cache results
- **API Rate Limits**: Respect source API limits, implement backoff

### Security
- **Token Storage**: Encrypt integration tokens in database
- **User Isolation**: Ensure users can only access their data
- **Content Security**: Hash sensitive content, consider encryption

### Scalability
- **Horizontal Scaling**: Stateless workers, database read replicas
- **Storage**: Consider blob storage for large file content
- **Queue Management**: Handle job failures, dead letter queues

### Data Consistency
- **Sync Conflicts**: Handle file moves, renames, permissions changes
- **Deletion Handling**: Soft deletes, cleanup jobs
- **Error Recovery**: Retry mechanisms, partial sync recovery

## Monitoring & Observability

### Metrics
- Index job success/failure rates
- Search performance and usage
- API quota usage per integration
- Storage growth per user

### Logging
- Structured logging with user/integration context
- Search query logging (anonymized)
- Error tracking and alerting

### Health Checks
- Integration connection status
- Job queue health
- Database performance
- Search index freshness

## Migration Strategy

1. **Parallel Implementation**: Build new system alongside existing direct API calls
2. **Feature Flag**: Toggle between old and new search
3. **Gradual Migration**: Move users to indexed search incrementally
4. **Fallback**: Keep direct API as backup during transition
5. **Cleanup**: Remove old code once migration is complete

## Future Enhancements

- **AI-Powered Search**: Semantic search with embeddings
- **Smart Categorization**: Auto-tag files with ML
- **Collaboration Features**: Share searches, team workspaces
- **Real-time Sync**: WebSocket updates for file changes
- **Mobile App**: Native mobile search experience

---

This architecture provides a solid foundation for a fast, scalable, multi-source search system that can grow with your product needs.