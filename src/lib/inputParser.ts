import type { FileTypeFilter } from './persistentSearch'

export interface ParsedFilter {
  key: FileTypeFilter
  display: string
  startPos: number
  endPos: number
}

export interface ParsedInput {
  rawValue: string
  displayValue: string
  filters: ParsedFilter[]
  cleanQuery: string
}

export interface FilterOption {
  key: FileTypeFilter
  display: string
  label: string
  description: string
  icon: string
}

export const FILTER_OPTIONS: FilterOption[] = [
  {
    key: 'documents',
    display: 'docs',
    label: 'Documents',
    description: 'Google Docs files',
    icon: '📄'
  },
  {
    key: 'spreadsheets', 
    display: 'sheets',
    label: 'Spreadsheets',
    description: 'Google Sheets files',
    icon: '📊'
  },
  {
    key: 'presentations',
    display: 'slides', 
    label: 'Presentations',
    description: 'Google Slides files',
    icon: '🎨'
  },
  {
    key: 'folders',
    display: 'folders',
    label: 'Folders', 
    description: 'Folder directories',
    icon: '📁'
  },
  {
    key: 'pdfs',
    display: 'pdfs',
    label: 'PDFs',
    description: 'PDF documents',
    icon: '📑'
  },
  {
    key: 'images',
    display: 'images',
    label: 'Images',
    description: 'Image files',
    icon: '🖼️'
  },
  {
    key: 'videos',
    display: 'videos',
    label: 'Videos', 
    description: 'Video files',
    icon: '🎬'
  },
  {
    key: 'audio',
    display: 'audio',
    label: 'Audio',
    description: 'Audio files', 
    icon: '🎵'
  }
]

/**
 * Parse raw input containing filter tags into structured data
 * "hello <filter>docs</filter> world" -> { filters: ['documents'], cleanQuery: 'hello world', ... }
 */
export function parseFilterInput(rawValue: string): ParsedInput {
  const filterRegex = /<filter>([^<]+)<\/filter>/g
  const filters: ParsedFilter[] = []
  let displayValue = rawValue
  let match

  // Extract all filters and their positions
  while ((match = filterRegex.exec(rawValue)) !== null) {
    const filterDisplay = match[1]
    const filterOption = FILTER_OPTIONS.find(opt => opt.display === filterDisplay)
    
    if (filterOption) {
      filters.push({
        key: filterOption.key,
        display: filterDisplay,
        startPos: match.index,
        endPos: match.index + match[0].length
      })
    }
  }

  // Convert to display format: <filter>docs</filter> -> @docs
  displayValue = rawValue.replace(/<filter>([^<]+)<\/filter>/g, '@$1')

  // Extract clean query (remove all filter tags)
  const cleanQuery = rawValue
    .replace(/<filter>[^<]+<\/filter>/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  return {
    rawValue,
    displayValue,
    filters,
    cleanQuery
  }
}

/**
 * Insert a filter at a specific position in the raw input
 */
export function insertFilter(
  rawValue: string,
  filterKey: FileTypeFilter,
  position: number
): string {
  const filterOption = FILTER_OPTIONS.find(opt => opt.key === filterKey)
  if (!filterOption) return rawValue

  const filterTag = `<filter>${filterOption.display}</filter>`
  
  return rawValue.slice(0, position) + filterTag + rawValue.slice(position)
}

/**
 * Remove a filter from the raw input
 */
export function removeFilter(rawValue: string, filterDisplay: string): string {
  const filterTag = `<filter>${filterDisplay}</filter>`
  return rawValue.replace(filterTag, '').replace(/\s+/g, ' ').trim()
}

/**
 * Map cursor position from display text to raw text
 * Accounts for <filter></filter> tags being longer than @filter
 */
export function mapDisplayToRaw(displayPos: number, rawValue: string): number {
  let rawPos = 0
  let displayPos_current = 0
  let i = 0

  while (i < rawValue.length && displayPos_current < displayPos) {
    if (rawValue.slice(i).startsWith('<filter>')) {
      // Find the end of the filter tag
      const endTag = rawValue.indexOf('</filter>', i)
      if (endTag !== -1) {
        const filterContent = rawValue.slice(i + 8, endTag)
        
        // This filter contributes @filterContent to display (length + 1 for @)
        const displayLength = filterContent.length + 1
        
        if (displayPos_current + displayLength >= displayPos) {
          // Cursor is within this filter
          const offsetInFilter = displayPos - displayPos_current
          if (offsetInFilter === 0) {
            // Cursor is at the @ symbol
            return i
          } else {
            // Cursor is within the filter name
            return i + 8 + Math.min(offsetInFilter - 1, filterContent.length - 1)
          }
        }
        
        displayPos_current += displayLength
        i = endTag + 9 // Skip past </filter>
        rawPos = i
        continue
      }
    }
    
    // Regular character
    if (displayPos_current >= displayPos) {
      break
    }
    
    displayPos_current++
    rawPos = i
    i++
  }

  return rawPos
}

/**
 * Map cursor position from raw text to display text
 */
export function mapRawToDisplay(rawPos: number, rawValue: string): number {
  let displayPos = 0
  let i = 0

  while (i < rawValue.length && i < rawPos) {
    if (rawValue.slice(i).startsWith('<filter>')) {
      const endTag = rawValue.indexOf('</filter>', i)
      if (endTag !== -1) {
        const filterContent = rawValue.slice(i + 8, endTag)
        
        if (rawPos <= endTag + 9) {
          // Cursor is within the filter tag
          const offsetInTag = rawPos - i
          if (offsetInTag <= 8) {
            // Cursor is in <filter> part - map to start of @
            return displayPos
          } else if (offsetInTag <= 8 + filterContent.length) {
            // Cursor is in filter content - map to corresponding position in @content
            return displayPos + 1 + (offsetInTag - 8)
          } else {
            // Cursor is in </filter> part - map to end of @content
            return displayPos + 1 + filterContent.length
          }
        }
        
        // Skip past the entire filter tag
        displayPos += 1 + filterContent.length // @content
        i = endTag + 9
        continue
      }
    }
    
    // Regular character
    displayPos++
    i++
  }

  return displayPos
}

/**
 * Find if cursor is at a position where @ should trigger the filter popup
 */
export function shouldShowPopup(displayValue: string, cursorPos: number): boolean {
  // Check if we just typed @ and it's not part of an existing filter
  if (cursorPos > 0 && displayValue[cursorPos - 1] === '@') {
    // Make sure this @ is not part of an existing filter
    // Look backwards to see if there's already a complete @filter before this position
    const beforeCursor = displayValue.slice(0, cursorPos - 1)
    const afterCursor = displayValue.slice(cursorPos - 1)
    
    // Check if we're in the middle of typing a filter
    const incompleteFilter = afterCursor.match(/^@[a-zA-Z]*(?:\s|$)/)
    return Boolean(incompleteFilter)
  }
  
  return false
}

/**
 * Get filter options that match the current partial input
 */
export function getMatchingFilters(partialInput: string): FilterOption[] {
  const searchTerm = partialInput.toLowerCase()
  return FILTER_OPTIONS.filter(option => 
    option.display.toLowerCase().includes(searchTerm) ||
    option.label.toLowerCase().includes(searchTerm)
  )
}