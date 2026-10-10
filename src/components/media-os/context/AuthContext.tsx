'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createContext, type ReactNode, useContext, useEffect, useState } from 'react'
import { canViewRoute } from '@/lib/permissions'
export interface Account {
  id: string
  email: string
  name: string
  role: 'admin' | 'editor' | 'operator' | 'commercial' | 'viewer'
  active: boolean
}
const Context = createContext<{ user: Account | null; logout: () => Promise<void> }>({
  user: null,
  logout: async () => {},
})
export function AuthProvider({ children }: { children: ReactNode }) {
  const path = usePathname(),
    router = useRouter(),
    publicPage = path === '/login' || path.startsWith('/player/')
  const [user, setUser] = useState<Account | null>(null),
    [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // biome-ignore lint/correctness/useExhaustiveDependencies: revalidate session when navigating to catch account revocation.
  useEffect(() => {
    setError('')
    if (publicPage) {
      setLoading(false)
      return
    }
    const c = new AbortController()
    fetch('/api/auth/me', { signal: c.signal, cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) {
          setUser(null)
          if (r.status === 401) router.replace('/login')
          else setError((await r.json()).error ?? 'Account service unavailable.')
          return
        }
        setUser((await r.json()).user)
      })
      .catch(() => {
        if (!c.signal.aborted) {
          setUser(null)
          setError('Account service unavailable. Check the local gateway.')
        }
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false)
      })
    return () => c.abort()
  }, [publicPage, router, path])
  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    setUser(null)
    router.replace('/login')
  }
  return (
    <Context.Provider value={{ user, logout }}>
      {publicPage || (!loading && user) ? (
        publicPage || canViewRoute(user?.role, path) ? (
          children
        ) : (
          <section className="panel state-panel">
            <h1>Access denied</h1>
            <p>Your role cannot access this section.</p>
            <Link className="btn" href="/">
              Back to Overview
            </Link>
          </section>
        )
      ) : (
        <div className="panel state-panel">
          {error ? (
            <>
              <p role="alert">{error}</p>
              <button type="button" className="btn" onClick={() => window.location.reload()}>
                Retry
              </button>
            </>
          ) : (
            'Checking account…'
          )}
        </div>
      )}
    </Context.Provider>
  )
}
export const useAuth = () => useContext(Context)
