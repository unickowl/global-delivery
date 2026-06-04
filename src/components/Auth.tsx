import { useEffect, useState, type ReactNode } from "react"

const HARBOR_URL = import.meta.env.VITE_API_HARBOR_URL as string | undefined
const COOKIE_NAME = import.meta.env.VITE_AUTH_COOKIE_NAME as string | undefined

function getCookie(name: string): string | null {
  const value = `; ${document.cookie}`
  const parts = value.split(`; ${name}=`)
  if (parts.length === 2) return parts.pop()!.split(";").shift() ?? null
  return null
}

export function Auth({ children }: { children: ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!HARBOR_URL || !COOKIE_NAME) {
      setError("Missing VITE_API_HARBOR_URL or VITE_AUTH_COOKIE_NAME in environment")
      return
    }
    const token = getCookie(COOKIE_NAME)
    if (!token) {
      window.location.href = `${HARBOR_URL}/api/v1/auth/internal/login?redirect_to_global_delivery=true`
    } else {
      setAuthenticated(true)
    }
  }, [])

  if (error) {
    return <div style={{ color: "red", padding: "20px", fontFamily: "monospace" }}>{error}</div>
  }
  if (!authenticated) {
    return <div style={{ color: "#0cf", padding: "20px", fontFamily: "monospace" }}>Authenticating…</div>
  }
  return <>{children}</>
}
