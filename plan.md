# Browser Spotlight Search - Development Plan

## Project Setup & Google Drive Integration

### Phase 1: Project Foundation (Day 1)

#### 1.1 Initialize Plasmo + Next.js Project
- [ ] Run `pnpm create plasmo --with-nextjs browser-spotlight` or manual setup
- [ ] Set up project structure similar to the example we analyzed
- [ ] Configure TypeScript and path aliases (`~` imports)
- [ ] Set up Prettier with import sorting
- [ ] Test basic dual development (Next.js + extension)

#### 1.2 Basic Project Structure
```
browser-spotlight/
├── src/
│   ├── popup/
│   │   └── index.tsx           # Extension popup entry
│   ├── pages/
│   │   └── index.tsx           # Next.js web page for testing
│   ├── components/
│   │   ├── SearchInterface.tsx # Main search UI component
│   │   ├── SearchInput.tsx     # Search input with keyboard handling
│   │   ├── FileResults.tsx     # Search results display
│   │   └── FileItem.tsx        # Individual file result item
│   ├── lib/
│   │   ├── googleDrive.ts      # Google Drive API integration
│   │   ├── auth.ts             # OAuth authentication
│   │   └── storage.ts          # Chrome storage utilities
│   └── types/
│       └── index.ts            # TypeScript definitions
├── assets/
│   └── icon.png               # Extension icon
├── package.json
├── tsconfig.json
└── next.config.js
```

### Phase 2: Google Drive Authentication (Day 1-2)

#### 2.1 Google Cloud Console Setup
- [ ] Create new Google Cloud Project
- [ ] Enable Google Drive API
- [ ] Create OAuth 2.0 credentials (Web Application)
- [ ] Configure authorized domains for extension
- [ ] Get Client ID and Client Secret

#### 2.2 OAuth Implementation
- [ ] Install required dependencies:
  ```bash
  npm install @google-cloud/storage googleapis
  npm install --save-dev @types/chrome
  ```
- [ ] Implement Chrome extension OAuth flow using `chrome.identity`
- [ ] Create authentication service (`src/lib/auth.ts`)
- [ ] Handle token storage and refresh
- [ ] Add authentication UI components

#### 2.3 Extension Permissions
Update `package.json` manifest:
```json
"manifest": {
  "permissions": [
    "identity",
    "storage",
    "activeTab"
  ],
  "host_permissions": [
    "https://www.googleapis.com/*"
  ],
  "oauth2": {
    "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
    "scopes": [
      "https://www.googleapis.com/auth/drive.readonly"
    ]
  }
}
```

### Phase 3: Google Drive Integration (Day 2-3)

#### 3.1 Google Drive API Service
Create `src/lib/googleDrive.ts`:
- [ ] Initialize Google Drive API client
- [ ] Implement file listing with pagination
- [ ] File search functionality
- [ ] File metadata extraction
- [ ] Handle API rate limiting

#### 3.2 Core API Methods
```typescript
interface DriveService {
  authenticate(): Promise<boolean>
  listFiles(pageToken?: string): Promise<FileListResponse>
  searchFiles(query: string): Promise<FileSearchResponse>
  getFileMetadata(fileId: string): Promise<FileMetadata>
  openFile(fileId: string): Promise<void>
}
```

#### 3.3 File Indexing Strategy
- [ ] Implement incremental file indexing
- [ ] Cache file metadata in Chrome storage
- [ ] Handle file updates and deletions
- [ ] Optimize for performance (batch requests)

### Phase 4: Search Interface (Day 3-4)

#### 4.1 Core Search Components
- [ ] `SearchInput.tsx`: Input with keyboard shortcuts and autocomplete
- [ ] `FileResults.tsx`: Results list with virtualization for performance
- [ ] `FileItem.tsx`: Individual result with preview and actions
- [ ] `SearchInterface.tsx`: Main container component

#### 4.2 Search Features
- [ ] Real-time search as user types (debounced)
- [ ] Fuzzy search implementation
- [ ] File type filtering
- [ ] Recent files section
- [ ] Search history

#### 4.3 Keyboard Navigation
- [ ] Global shortcut (Cmd+K/Cmd+Space) to open search
- [ ] Arrow keys for result navigation
- [ ] Enter to open file
- [ ] Escape to close
- [ ] Tab for file type filtering

### Phase 5: UI/UX Implementation (Day 4-5)

#### 5.1 Design System
- [ ] Create consistent color scheme and typography
- [ ] Implement dark/light theme support
- [ ] Design file type icons and previews
- [ ] Responsive design for different screen sizes

#### 5.2 Search Overlay
- [ ] Modal overlay that doesn't interfere with current page
- [ ] Smooth animations and transitions
- [ ] Loading states and error handling
- [ ] File preview on hover/selection

#### 5.3 Performance Optimization
- [ ] Virtual scrolling for large result sets
- [ ] Lazy loading of file metadata
- [ ] Search result caching
- [ ] Optimize bundle size

### Phase 6: Testing & Polish (Day 5-6)

#### 6.1 Development Testing
- [ ] Test in Next.js web version for rapid iteration
- [ ] Test extension popup functionality
- [ ] Test with large Google Drive accounts
- [ ] Performance testing and optimization

#### 6.2 Error Handling
- [ ] Network connectivity issues
- [ ] API rate limiting
- [ ] Authentication failures
- [ ] Invalid/deleted files

#### 6.3 User Experience Polish
- [ ] Empty states and loading animations
- [ ] Helpful error messages
- [ ] Onboarding flow for first-time users
- [ ] Settings/preferences panel

## Technical Implementation Details

### Dependencies to Install
```json
{
  "dependencies": {
    "next": "^14.1.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "googleapis": "^126.0.1",
    "fuse.js": "^7.0.0",
    "plasmo": "latest"
  },
  "devDependencies": {
    "@types/chrome": "^0.0.258",
    "@types/node": "^20.11.5",
    "@types/react": "^18.2.48",
    "typescript": "^5.3.3",
    "prettier": "^3.2.4"
  }
}
```

### Key Configuration Files

#### `next.config.js`
```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    appDir: false
  }
}

module.exports = nextConfig
```

#### Chrome Extension Manifest (via package.json)
```json
"manifest": {
  "version": "0.1.0",
  "permissions": [
    "identity",
    "storage",
    "activeTab"
  ],
  "host_permissions": [
    "https://www.googleapis.com/*"
  ],
  "commands": {
    "open-search": {
      "suggested_key": {
        "default": "Ctrl+K",
        "mac": "Command+K"
      },
      "description": "Open browser spotlight search"
    }
  }
}
```

## Development Workflow

### Daily Development Process
1. **Start Development**: `pnpm dev` (runs both Next.js and Plasmo)
2. **Test in Browser**: Visit `localhost:1947` for web testing
3. **Test Extension**: Load `build/chrome-mv3-dev` in Chrome
4. **Iterate**: Make changes, test in both environments
5. **Build**: `pnpm build` for production testing

### Testing Strategy
- **Web Version**: Quick UI/UX testing and API development
- **Extension Version**: Real-world popup and overlay testing
- **Google Drive Integration**: Test with various file types and sizes
- **Performance**: Monitor API usage and response times

## Success Metrics for MVP
- [ ] Successfully authenticate with Google Drive
- [ ] Search and display files from Google Drive
- [ ] Sub-500ms search response time
- [ ] Keyboard navigation fully functional
- [ ] Extension popup works reliably
- [ ] Web version for easy development/testing

## Next Steps After MVP
- Content scripts for global overlay
- Additional cloud storage integrations
- Advanced search features (content search, AI)
- User preferences and customization
- Performance optimizations and caching strategies