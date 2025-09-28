import type { AppProps } from "next/app"
import "../styles/globals.css"
import { ThemeProvider } from "../contexts/ThemeContext"

export default function App({ Component, pageProps }: AppProps) {
  return (
    <ThemeProvider
      defaultTheme="system"
      storageKey="browser-spotlight-theme"
    >
      <Component {...pageProps} />
    </ThemeProvider>
  )
}
