'use client'
import { useRouter } from 'next/navigation'
import { type FormEvent, useEffect, useState } from 'react'
export default function Login() {
  const router = useRouter()
  const [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(false)
  useEffect(() => setReady(true), [])
  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const b = await r.json()
      if (!r.ok) throw Error(b.error)
      setPassword('')
      router.replace('/')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <main className="login-page">
      <form className="panel cms-card" onSubmit={submit}>
        <span className="eyebrow">
          MEDIA OS · {process.env.NEXT_PUBLIC_WORKSPACE_BYLINE || 'WORKSPACE'}
        </span>
        <h1>Welcome to your workspace</h1>
        <p>Sign in with your Media OS account.</p>
        <label>
          Email
          <input
            className="control"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          Password
          <input
            className="control"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error ? (
          <p role="alert" className="form-error">
            {error}
          </p>
        ) : null}
        <button type="submit" className="btn primary" disabled={busy || !ready}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  )
}
