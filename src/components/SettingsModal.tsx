import { useState } from "react"
import { Settings, LogOut, Monitor, Sun, Moon, User } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useTheme } from "@/contexts/ThemeContext"

interface SettingsModalProps {
  onSignOut: () => Promise<void>
  userEmail?: string
}

export function SettingsModal({ onSignOut, userEmail }: SettingsModalProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const { theme, setTheme, actualTheme } = useTheme()

  const handleSignOut = async () => {
    setIsSigningOut(true)
    try {
      await onSignOut()
      setIsOpen(false)
    } catch (error) {
      console.error("Sign out failed:", error)
    } finally {
      setIsSigningOut(false)
    }
  }

  const getThemeIcon = (themeName: string) => {
    switch (themeName) {
      case "light":
        return <Sun className="h-4 w-4" />
      case "dark":
        return <Moon className="h-4 w-4" />
      case "system":
        return <Monitor className="h-4 w-4" />
      default:
        return <Monitor className="h-4 w-4" />
    }
  }

  const getThemeLabel = (themeName: string) => {
    switch (themeName) {
      case "light":
        return "Light"
      case "dark":
        return "Dark"
      case "system":
        return "System"
      default:
        return "System"
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-muted-foreground hover:text-foreground"
          title="Settings"
        >
          <Settings className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Customize your search experience and manage your account.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          {/* Theme Settings */}
          <div className="space-y-3">
            <div className="space-y-1">
              <h4 className="text-sm font-medium">Appearance</h4>
              <p className="text-xs text-muted-foreground">
                Choose your preferred color scheme.
              </p>
            </div>
            
            <Select value={theme} onValueChange={setTheme}>
              <SelectTrigger className="w-full">
                <SelectValue>
                  <div className="flex items-center gap-2">
                    {getThemeIcon(theme)}
                    <span>{getThemeLabel(theme)}</span>
                    {theme === "system" && (
                      <span className="text-xs text-muted-foreground">
                        ({actualTheme})
                      </span>
                    )}
                  </div>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="system">
                  <div className="flex items-center gap-2">
                    <Monitor className="h-4 w-4" />
                    <span>System</span>
                    <span className="text-xs text-muted-foreground">
                      (Currently {actualTheme})
                    </span>
                  </div>
                </SelectItem>
                <SelectItem value="light">
                  <div className="flex items-center gap-2">
                    <Sun className="h-4 w-4" />
                    <span>Light</span>
                  </div>
                </SelectItem>
                <SelectItem value="dark">
                  <div className="flex items-center gap-2">
                    <Moon className="h-4 w-4" />
                    <span>Dark</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Account Settings */}
          <div className="space-y-3">
            <div className="space-y-1">
              <h4 className="text-sm font-medium">Account</h4>
              {userEmail && (
                <p className="text-xs text-muted-foreground">
                  Signed in as {userEmail}
                </p>
              )}
            </div>
            
            <Button 
              variant="destructive" 
              onClick={handleSignOut}
              disabled={isSigningOut}
              className="w-full justify-start"
            >
              <LogOut className="h-4 w-4 mr-2" />
              {isSigningOut ? "Signing out..." : "Sign out"}
            </Button>
          </div>

          {/* App Info */}
          <div className="space-y-3">
            <div className="space-y-1">
              <h4 className="text-sm font-medium">About</h4>
              <div className="text-xs text-muted-foreground space-y-1">
                <p>Browser Spotlight Search</p>
                <p>Lightning-fast file search for Google Drive</p>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}