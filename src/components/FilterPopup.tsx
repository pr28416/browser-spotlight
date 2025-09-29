import { useState, useEffect, useRef } from 'react'
import type { FilterOption } from '@/lib/inputParser'

interface FilterPopupProps {
  options: FilterOption[]
  onSelect: (filterKey: string) => void
  onClose: () => void
  position: { x: number; y: number }
  className?: string
}

export function FilterPopup({ options, onSelect, onClose, position, className = '' }: FilterPopupProps) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const popupRef = useRef<HTMLDivElement>(null)

  // Reset selection when options change
  useEffect(() => {
    setSelectedIndex(0)
  }, [options])

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          e.stopPropagation()
          setSelectedIndex(prev => Math.min(prev + 1, options.length - 1))
          break
        case 'ArrowUp':
          e.preventDefault()
          e.stopPropagation()
          setSelectedIndex(prev => Math.max(prev - 1, 0))
          break
        case 'Enter':
          e.preventDefault()
          e.stopPropagation()
          if (options[selectedIndex]) {
            onSelect(options[selectedIndex].key)
          }
          break
        case 'Escape':
          e.preventDefault()
          e.stopPropagation()
          onClose()
          break
        case 'Tab':
          e.preventDefault()
          e.stopPropagation()
          if (options[selectedIndex]) {
            onSelect(options[selectedIndex].key)
          }
          break
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [options, selectedIndex, onSelect, onClose])

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  if (options.length === 0) {
    return null
  }

  return (
    <div
      ref={popupRef}
      className={`
        fixed z-[9999] bg-popover border border-border rounded-lg shadow-xl min-w-[240px] max-h-[300px] overflow-y-auto
        ${className}
      `}
      style={{
        left: position.x,
        top: position.y + 12, // More offset to avoid covering input
        transform: 'translateZ(0)', // Force hardware acceleration
      }}
    >
      <div className="p-1">
        {options.map((option, index) => (
          <div
            key={option.key}
            className={`
              flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer transition-colors
              ${index === selectedIndex 
                ? 'bg-accent text-accent-foreground' 
                : 'hover:bg-accent/50'
              }
            `}
            onClick={() => onSelect(option.key)}
            onMouseEnter={() => setSelectedIndex(index)}
          >
            <span className="text-lg" role="img" aria-label={option.label}>
              {option.icon}
            </span>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm">
                @{option.display}
              </div>
              <div className="text-xs text-muted-foreground">
                {option.description}
              </div>
            </div>
            {index === selectedIndex && (
              <div className="text-xs text-muted-foreground">
                ↵
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// Utility hook to calculate popup position relative to input cursor
export function usePopupPosition(
  inputRef: React.RefObject<HTMLInputElement>,
  cursorPosition: number
) {
  const [position, setPosition] = useState({ x: 0, y: 0 })

  useEffect(() => {
    if (!inputRef.current) return

    const input = inputRef.current
    const inputRect = input.getBoundingClientRect()
    
    // Create a temporary span to measure text width up to cursor
    const tempSpan = document.createElement('span')
    tempSpan.style.visibility = 'hidden'
    tempSpan.style.position = 'absolute'
    tempSpan.style.whiteSpace = 'pre'
    tempSpan.style.font = getComputedStyle(input).font
    tempSpan.textContent = input.value.slice(0, cursorPosition)
    
    document.body.appendChild(tempSpan)
    const textWidth = tempSpan.getBoundingClientRect().width
    document.body.removeChild(tempSpan)

    // Calculate position relative to input
    setPosition({
      x: inputRect.left + textWidth + 2, // Small offset from cursor
      y: inputRect.bottom + 2
    })
  }, [inputRef, cursorPosition])

  return position
}