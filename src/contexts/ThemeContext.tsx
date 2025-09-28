"use client"

import { createContext, useContext, useEffect, useState, ReactNode } from "react"

type Theme = "system" | "light" | "dark"

type ThemeProviderProps = {
  children: ReactNode
  defaultTheme?: Theme
  storageKey?: string
}

type ThemeProviderState = {
  theme: Theme
  setTheme: (theme: Theme) => void
  actualTheme: "light" | "dark" // The resolved theme (system -> light/dark)
}

const initialState: ThemeProviderState = {
  theme: "system",
  setTheme: () => null,
  actualTheme: "light",
}

const ThemeProviderContext = createContext<ThemeProviderState>(initialState)

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "vite-ui-theme",
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(() => {
    // Try to get theme from localStorage first
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(storageKey) as Theme
      return stored || defaultTheme
    }
    return defaultTheme
  })

  const [actualTheme, setActualTheme] = useState<"light" | "dark">("light")

  useEffect(() => {
    const root = window.document.documentElement

    // Remove previous theme classes
    root.classList.remove("light", "dark")

    let resolvedTheme: "light" | "dark"

    if (theme === "system") {
      // Use system preference
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      resolvedTheme = systemTheme
    } else {
      resolvedTheme = theme
    }

    // Apply the theme
    root.classList.add(resolvedTheme)
    setActualTheme(resolvedTheme)
  }, [theme])

  // Listen to system theme changes when using system theme
  useEffect(() => {
    if (theme !== "system") return

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
    
    const handleChange = () => {
      const systemTheme = mediaQuery.matches ? "dark" : "light"
      const root = window.document.documentElement
      root.classList.remove("light", "dark")
      root.classList.add(systemTheme)
      setActualTheme(systemTheme)
    }

    mediaQuery.addEventListener("change", handleChange)
    return () => mediaQuery.removeEventListener("change", handleChange)
  }, [theme])

  const value = {
    theme,
    setTheme: (theme: Theme) => {
      localStorage.setItem(storageKey, theme)
      setTheme(theme)
    },
    actualTheme,
  }

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext)

  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider")

  return context
}