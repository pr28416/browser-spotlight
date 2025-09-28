import type { AuthState } from "~types"

const SCOPES = [
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/drive.metadata.readonly"
]

class AuthService {
  private authState: AuthState = {
    isAuthenticated: false
  }

  async initialize(): Promise<boolean> {
    // Check if we already have stored auth
    if (typeof chrome !== "undefined" && chrome.storage) {
      // Extension context - use chrome storage
      try {
        const result = await chrome.storage.local.get(['authState'])
        if (result.authState) {
          this.authState = result.authState
          return this.isTokenValid()
        }
      } catch (error) {
        console.error("Failed to load auth state from extension storage:", error)
      }
    } else {
      // Web context - use localStorage  
      try {
        const stored = localStorage.getItem('authState')
        if (stored) {
          this.authState = JSON.parse(stored)
          return this.isTokenValid()
        }
      } catch (error) {
        console.error("Failed to load auth state from localStorage:", error)
      }
    }

    return false
  }

  async authenticate(): Promise<boolean> {
    if (typeof chrome !== "undefined" && chrome.identity) {
      // Chrome extension context - use chrome.identity
      return this.authenticateExtension()
    } else {
      // Web context - use Google OAuth flow
      return this.authenticateWeb()
    }
  }

  private async authenticateWeb(): Promise<boolean> {
    try {
      // Load Google API
      if (!window.google?.accounts) {
        await this.loadGoogleAPI()
      }

      return new Promise((resolve) => {
        const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID

        if (!clientId) {
          console.error("Google Client ID not found in environment variables")
          resolve(false)
          return
        }

        // Use OAuth 2.0 popup flow for drive scope
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: SCOPES.join(' '),
          callback: (response: any) => {
            if (response.access_token) {
              this.authState = {
                isAuthenticated: true,
                accessToken: response.access_token,
                expiresAt: Date.now() + (response.expires_in ? parseInt(response.expires_in) * 1000 : 3600 * 1000)
              }
              this.saveAuthState()
              resolve(true)
            } else {
              console.error("No access token received", response)
              resolve(false)
            }
          },
          error_callback: (error: any) => {
            console.error("OAuth error:", error)
            resolve(false)
          }
        })

        // Request access token - this opens a popup
        client.requestAccessToken({ prompt: 'consent' })
      })
    } catch (error) {
      console.error("Web authentication failed:", error)
      return false
    }
  }

  private async authenticateExtension(): Promise<boolean> {
    try {
      const clientId = process.env.CHROME_EXTENSION_CLIENT_ID

      if (!clientId) {
        console.error("Chrome Extension Client ID not configured")
        return false
      }

      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${clientId}&` +
        `response_type=token&` +
        `scope=${SCOPES.join(' ')}&` +
        `redirect_uri=${chrome.identity.getRedirectURL()}`

      const result = await new Promise<string>((resolve, reject) => {
        chrome.identity.launchWebAuthFlow(
          {
            url: authUrl,
            interactive: true
          },
          (responseUrl) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message))
            } else if (responseUrl) {
              resolve(responseUrl)
            } else {
              reject(new Error("Authentication was cancelled"))
            }
          }
        )
      })

      // Parse the access token from the response URL
      const urlParams = new URL(result).hash.substring(1)
      const params = new URLSearchParams(urlParams)
      const accessToken = params.get('access_token')
      const expiresIn = params.get('expires_in')

      if (accessToken) {
        this.authState = {
          isAuthenticated: true,
          accessToken,
          expiresAt: Date.now() + (parseInt(expiresIn || '3600') * 1000)
        }

        await this.saveAuthState()
        return true
      }

      return false
    } catch (error) {
      console.error("Extension authentication failed:", error)
      return false
    }
  }

  private async handleGoogleSignIn(response: any): Promise<boolean> {
    // This handles the ID token, but we need access token for Drive API
    // The OAuth2 flow above handles the access token
    return false
  }

  private async loadGoogleAPI(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (document.querySelector('script[src="https://accounts.google.com/gsi/client"]')) {
        resolve()
        return
      }

      const script = document.createElement('script')
      script.src = 'https://accounts.google.com/gsi/client'
      script.async = true
      script.defer = true
      script.onload = () => resolve()
      script.onerror = () => reject(new Error('Failed to load Google API'))
      document.head.appendChild(script)
    })
  }

  private async saveAuthState(): Promise<void> {
    if (typeof chrome !== "undefined" && chrome.storage) {
      await chrome.storage.local.set({ authState: this.authState })
    } else {
      localStorage.setItem('authState', JSON.stringify(this.authState))
    }
  }

  private isTokenValid(): boolean {
    return this.authState.isAuthenticated && 
           (!this.authState.expiresAt || this.authState.expiresAt > Date.now())
  }

  async signOut(): Promise<void> {
    this.authState = { isAuthenticated: false }

    if (typeof chrome !== "undefined" && chrome.storage) {
      await chrome.storage.local.remove(['authState'])
    } else {
      localStorage.removeItem('authState')
    }

    // Revoke token if we have one
    if (this.authState.accessToken && window.google?.accounts?.oauth2) {
      window.google.accounts.oauth2.revoke(this.authState.accessToken)
    }
  }

  isAuthenticated(): boolean {
    return this.isTokenValid()
  }

  getAccessToken(): string | undefined {
    return this.isAuthenticated() ? this.authState.accessToken : undefined
  }
}

// Extend window interface for Google API
declare global {
  interface Window {
    google: any
  }
}

// Export a singleton instance
export const authService = new AuthService()