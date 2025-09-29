import { useState, useCallback, useRef, useEffect } from 'react'
import { 
  parseFilterInput, 
  insertFilter, 
  removeFilter,
  mapDisplayToRaw,
  mapRawToDisplay,
  shouldShowPopup,
  getMatchingFilters,
  FILTER_OPTIONS,
  type FilterOption,
  type ParsedInput
} from '@/lib/inputParser'
import type { FileTypeFilter } from '@/lib/persistentSearch'

export interface FilterableInputState {
  // Values
  rawValue: string
  displayValue: string
  cursorPosition: number
  
  // Parsed data
  parsedInput: ParsedInput
  
  // Popup state
  showPopup: boolean
  popupPosition: { x: number; y: number }
  popupOptions: FilterOption[]
  
  // Actions
  handleInputChange: (value: string, cursorPos: number) => void
  handleKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void
  selectFilter: (filterKey: FileTypeFilter) => void
  removeFilterByDisplay: (display: string) => void
  closePopup: () => void
  
  // Refs
  inputRef: React.RefObject<HTMLInputElement>
}

export function useFilterableInput(
  initialValue: string = '',
  onSearchChange?: (query: string, filters: FileTypeFilter[]) => void
): FilterableInputState {
  const [rawValue, setRawValue] = useState(initialValue)
  const [cursorPosition, setCursorPosition] = useState(0)
  const [showPopup, setShowPopup] = useState(false)
  const [popupPosition, setPopupPosition] = useState({ x: 0, y: 0 })
  const [popupTriggerPos, setPopupTriggerPos] = useState(0)
  const [popupSearch, setPopupSearch] = useState('')
  
  const inputRef = useRef<HTMLInputElement>(null)
  
  // Parse the current input
  const parsedInput = parseFilterInput(rawValue)
  const { displayValue } = parsedInput
  
  // Get matching filter options for popup
  const popupOptions = getMatchingFilters(popupSearch)
  
  // Update search callback when parsed input changes - but only when it actually changes
  const prevCleanQuery = useRef(parsedInput.cleanQuery)
  const prevFilters = useRef(parsedInput.filters)
  
  useEffect(() => {
    const filterKeys = parsedInput.filters.map(f => f.key)
    const filtersChanged = JSON.stringify(prevFilters.current.map(f => f.key)) !== JSON.stringify(filterKeys)
    const queryChanged = prevCleanQuery.current !== parsedInput.cleanQuery
    
    if (onSearchChange && (queryChanged || filtersChanged)) {
      prevCleanQuery.current = parsedInput.cleanQuery
      prevFilters.current = parsedInput.filters
      onSearchChange(parsedInput.cleanQuery, filterKeys)
    }
  }, [parsedInput.cleanQuery, parsedInput.filters, onSearchChange])
  
  // Calculate popup position when it should be shown
  useEffect(() => {
    if (showPopup && inputRef.current) {
      const calculatePosition = () => {
        const input = inputRef.current!
        const inputRect = input.getBoundingClientRect()
        
        // Position popup below the input, aligned to the left
        const newPosition = {
          x: Math.max(0, inputRect.left), // Ensure not negative
          y: Math.max(0, inputRect.bottom + 8) // Ensure not negative, no need for scrollY with fixed positioning
        }
        setPopupPosition(newPosition)
      }
      
      // Calculate immediately and also on scroll/resize
      calculatePosition()
      
      const handleResize = () => calculatePosition()
      window.addEventListener('resize', handleResize)
      window.addEventListener('scroll', handleResize)
      
      return () => {
        window.removeEventListener('resize', handleResize)
        window.removeEventListener('scroll', handleResize)
      }
    }
  }, [showPopup])
  
  const handleInputChange = useCallback((value: string, cursorPos: number) => {
    setCursorPosition(cursorPos)
    
    // Check if we should show popup (user typed @)
    if (value.length > displayValue.length && value[cursorPos - 1] === '@') {
      // User typed @, show popup
      setPopupTriggerPos(cursorPos - 1)
      setPopupSearch('')
      setShowPopup(true)
    } else if (showPopup) {
      // Handle popup behavior when it's open
      if (cursorPos <= popupTriggerPos || !value.slice(popupTriggerPos, popupTriggerPos + 1).includes('@')) {
        // Cursor moved before the @ or @ was deleted, close popup
        setShowPopup(false)
      } else {
        // Update popup search if we're typing after the @
        const afterAt = value.slice(popupTriggerPos + 1, cursorPos)
        if (afterAt.includes(' ') || afterAt.includes('@')) {
          // Space or another @ typed, close popup
          setShowPopup(false)
        } else {
          setPopupSearch(afterAt)
        }
      }
    }
    
    // Convert display value back to raw value by intelligently converting @filter patterns
    let newRawValue = value
    
    // Find all @word patterns in the new value
    const atPatterns = value.match(/@[a-zA-Z]+/g) || []
    
    for (const pattern of atPatterns) {
      const filterDisplay = pattern.substring(1) // Remove @
      const option = FILTER_OPTIONS.find(opt => opt.display === filterDisplay)
      
      if (option) {
        // Only replace complete @filter words (not partial ones during typing)
        const regex = new RegExp(`@${filterDisplay}(?=\\s|$)`, 'g')
        newRawValue = newRawValue.replace(regex, `<filter>${filterDisplay}</filter>`)
      }
    }
    
    setRawValue(newRawValue)
  }, [displayValue, showPopup, popupTriggerPos])
  
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showPopup) {
      // Handle keys that should close the popup
      if (e.key === 'Escape') {
        e.preventDefault()
        setShowPopup(false)
        return
      }
      // For navigation keys, let the popup handle them but prevent default input behavior
      if (['ArrowDown', 'ArrowUp', 'Enter', 'Tab'].includes(e.key)) {
        e.preventDefault() // Prevent default input behavior
        return
      }
    }
    
    // Handle other special keys if needed
    if (e.key === 'Escape') {
      setShowPopup(false)
    }
  }, [showPopup])
  
  const selectFilter = useCallback((filterKey: FileTypeFilter) => {
    if (!inputRef.current) {
      return
    }
    
    const input = inputRef.current
    const currentDisplayValue = input.value
    
    // Find the filter option
    const filterOption = FILTER_OPTIONS.find(opt => opt.key === filterKey)
    if (!filterOption) {
      return
    }
    
    // Replace the @ and any partial text with the complete filter
    const beforeAt = currentDisplayValue.slice(0, popupTriggerPos)
    const afterCursor = currentDisplayValue.slice(cursorPosition)
    
    // Create new display value with the complete filter
    const newDisplayValue = beforeAt + `@${filterOption.display}` + afterCursor
    const newCursorPos = beforeAt.length + filterOption.display.length + 1
    
    // Convert the entire new display value to raw value
    let newRawValue = newDisplayValue
    
    // Convert all valid @filter patterns to <filter> tags
    const atPatterns = newDisplayValue.match(/@[a-zA-Z]+/g) || []
    for (const pattern of atPatterns) {
      const filterDisplay = pattern.substring(1)
      const option = FILTER_OPTIONS.find(opt => opt.display === filterDisplay)
      if (option) {
        const regex = new RegExp(`@${filterDisplay}(?=\\s|$)`, 'g')
        newRawValue = newRawValue.replace(regex, `<filter>${filterDisplay}</filter>`)
      }
    }
    
    setRawValue(newRawValue)
    setCursorPosition(newCursorPos)
    setShowPopup(false)
    
    // Focus and set cursor position
    setTimeout(() => {
      input.focus()
      input.setSelectionRange(newCursorPos, newCursorPos)
    }, 0)
  }, [popupTriggerPos, cursorPosition])
  
  const removeFilterByDisplay = useCallback((display: string) => {
    const newRawValue = removeFilter(rawValue, display)
    setRawValue(newRawValue)
    setShowPopup(false)
  }, [rawValue])
  
  const closePopup = useCallback(() => {
    setShowPopup(false)
  }, [])
  
  return {
    rawValue,
    displayValue,
    cursorPosition,
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
  }
}