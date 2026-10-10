'use client'
import { type FormEvent, useState } from 'react'
import { useAuth } from '@/components/media-os/context/AuthContext'
export default function AccountPage() {
  const { user, logout } = useAuth()
  const [currentPassword, setCurrent] = useState(''),
    [password, setPassword] = useState(''),
    [message, setMessage] = useState('')
  async function save(e: FormEvent) {
    e.preventDefault()
    const r = await fetch('/api/auth/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, password }),
    })
    const b = await r.json()
    if (r.ok) await logout()
    else setMessage(b.error)
  }
  return (
    <section className="page">
      <h1>Account</h1>
      <div className="panel cms-card">
        <h2>{user?.name}</h2>
        <p>
          {user?.email} · {user?.role}
        </p>
        <form onSubmit={save}>
          <label>
            Current password
            <input
              className="control"
              type="password"
              autoComplete="current-password"
              required
              value={currentPassword}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </label>
          <label>
            New password
            <input
              className="control"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button type="submit" className="btn primary">
            Change password and sign out
          </button>
          {message ? <p role="alert">{message}</p> : null}
        </form>
        <button className="btn" onClick={logout} type="button">
          Sign out
        </button>
      </div>
    </section>
  )
}
