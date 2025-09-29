import { useEffect } from 'react'
import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { FilterPopup } from './FilterPopup'
import { useFilterableInput } from '@/hooks/useFilterableInput'
import type { FileTypeFilter } from '@/lib/persistentSearch'

interface FilterableSearchInputProps {
  placeholder?: string
  value?: string
  onSearchChange?: (query: string, filters: FileTypeFilter[]) => void
  onKeyDown?: (e: React.KeyboardEvent) => void
  className?: string
  autoFocus?: boolean
  rightSlot?: React.ReactNode
}

export function FilterableSearchInput({
  placeholder = "Search files...",
  value = "",
  onSearchChange,
  onKeyDown,
  className = "",
  autoFocus = false,
  rightSlot
}: FilterableSearchInputProps) {
  const {
    displayValue,
    parsedInput,
    showPopup,
    popupPosition,
    popupOptions,
    handleInputChange,
    handleKeyDown,
    selectFilter,
    removeFilterByDisplay,
    closePopup,
    inputRef
  } = useFilterableInput(value, onSearchChange)



  // Handle native input change events
  const handleNativeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const target = e.target as HTMLInputElement
    handleInputChange(target.value, target.selectionStart || 0)
  }

  // Sync cursor position on selection change
  const handleSelectionChange = () => {
    if (inputRef.current) {
      const cursorPos = inputRef.current.selectionStart || 0
      // Update cursor position if needed
    }
  }

  // Combine internal and external key handlers
  const handleCombinedKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // First, let the internal handler process filter-related keys
    handleKeyDown(e)
    
    // Then, if not prevented, let external handler process navigation
    if (!e.defaultPrevented && onKeyDown) {
      onKeyDown(e)
    }
  }

  return (
    <div className="relative">
      {/* Search Input Container */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        
        {/* Main Input */}
        <Input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          value={displayValue}
          onChange={handleNativeChange}
          onKeyDown={handleCombinedKeyDown}
          onSelect={handleSelectionChange}
          className={`pl-10 ${rightSlot ? 'pr-28' : 'pr-4'} ${className}`}
          autoFocus={autoFocus}
        />
        
        {/* Right slot for status indicators */}
        {rightSlot && (
          <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center gap-2">
            {rightSlot}
          </div>
        )}
      </div>

      {/* Filter Popup */}
      {showPopup && (
        <FilterPopup
          options={popupOptions}
          onSelect={selectFilter}
          onClose={closePopup}
          position={popupPosition}
        />
      )}

      {/* Active Filters as Styled Pills */}
      {parsedInput.filters.length > 0 && (
        <div className="mt-2 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Active filters:</span>
          <div className="flex items-center gap-1.5">
            {parsedInput.filters.map((filter, index) => (
              <span
                key={`${filter.key}-${index}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary rounded-full text-sm font-medium border border-primary/20 hover:bg-primary/20 transition-colors"
              >
                <span className="text-xs">{getFilterIcon(filter.key)}</span>
                <span>@{filter.display}</span>
                <button
                  onClick={() => removeFilterByDisplay(filter.display)}
                  className="ml-0.5 hover:bg-primary/30 rounded-full p-1 transition-colors flex items-center justify-center"
                  style={{ width: '16px', height: '16px' }}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// Helper functions for filter display
function getFilterIcon(filterKey: FileTypeFilter): string {
  const iconMap: Record<FileTypeFilter, string> = {
    'documents': '📄',
    'spreadsheets': '📊', 
    'presentations': '🎨',
    'folders': '📁',
    'pdfs': '📑',
    'images': '🖼️',
    'videos': '🎬',
    'audio': '🎵'
  }
  return iconMap[filterKey] || '📄'
}

function getFilterLabel(filterKey: FileTypeFilter): string {
  const labelMap: Record<FileTypeFilter, string> = {
    'documents': 'Documents',
    'spreadsheets': 'Spreadsheets',
    'presentations': 'Presentations', 
    'folders': 'Folders',
    'pdfs': 'PDFs',
    'images': 'Images',
    'videos': 'Videos',
    'audio': 'Audio'
  }
  return labelMap[filterKey] || 'Files'
}
