'use client'
import Link from 'next/link'
import { type FormEvent, useEffect, useState } from 'react'
import { type Account, useAuth } from '@/components/media-os/context/AuthContext'
import { useMediaCatalog } from '@/components/media-os/context/MediaCatalogContext'

const collections = [
  'projects',
  'inventory',
  'creatives',
  'screens',
  'campaigns',
  'settings',
  'users',
  'audit',
]
export default function Cms() {
  const { user } = useAuth(),
    catalog = useMediaCatalog()
  const [kind, setKind] = useState('projects'),
    [rows, setRows] = useState<Record<string, unknown>[]>([]),
    [selected, setSelected] = useState(''),
    [content, setContent] = useState(''),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [revision, setRevision] = useState(0),
    [busy, setBusy] = useState(false)
  const canEdit = user?.role === 'admin' || user?.role === 'editor'
  const endpoint =
    kind === 'users'
      ? '/api/gateway/auth/users'
      : kind === 'settings' || kind === 'audit'
        ? `/api/gateway/cms/${kind}`
        : `/api/gateway/cms/records/${kind}`
  // biome-ignore lint/correctness/useExhaustiveDependencies: revision reloads records after CMS mutations.
  useEffect(() => {
    const c = new AbortController()
    setError('')
    setSelected('')
    setContent('')
    fetch(endpoint, { signal: c.signal, cache: 'no-store' })
      .then(async (r) => {
        const b = await r.json()
        if (!r.ok) throw Error(b.error)
        setRows(
          kind === 'settings'
            ? Object.entries(b.data)
                .filter(([k]) => k !== 'seedTombstones')
                .map(([key, payload]) => ({ id: key, payload }))
            : b.data,
        )
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message)
      })
    return () => c.abort()
  }, [endpoint, kind, revision])
  async function save(e: FormEvent) {
    e.preventDefault()
    setError('')
    setNotice('')
    setBusy(true)
    try {
      const payload = JSON.parse(content)
      const url =
        kind === 'settings'
          ? `/api/gateway/cms/settings/${encodeURIComponent(selected)}`
          : `/api/gateway/cms/records/${kind}/${encodeURIComponent(selected)}`
      const r = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const b = await r.json()
      if (!r.ok) throw Error(b.error)
      setNotice('Saved to PostgreSQL.')
      setRevision((v) => v + 1)
      catalog.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save.')
    } finally {
      setBusy(false)
    }
  }
  async function remove() {
    if (!window.confirm(`Delete ${kind}/${selected}? Linked records can prevent deletion.`)) return
    setBusy(true)
    setError('')
    try {
      const r = await fetch(`/api/gateway/cms/records/${kind}/${encodeURIComponent(selected)}`, {
        method: 'DELETE',
      })
      const b = await r.json()
      if (!r.ok) throw Error(b.error)
      setRevision((v) => v + 1)
      catalog.refresh()
      setNotice(b.archived ? 'Record removed. Historical references preserved.' : 'Deleted.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="page">
      <div className="page-head">
        <div>
          <h1>Content Management</h1>
          <p>Manage real projects, mock data and workspace configuration in PostgreSQL.</p>
        </div>
        <Link className="btn" href="/account">
          Account
        </Link>
      </div>
      <nav className="pg-tabs" aria-label="CMS collections">
        {collections
          .filter((k) => !['users', 'audit'].includes(k) || user?.role === 'admin')
          .map((k) => (
            <button
              type="button"
              className={`btn ${kind === k ? 'primary' : ''}`}
              key={k}
              onClick={() => {
                setKind(k)
                setNotice('')
              }}
            >
              {k}
            </button>
          ))}
      </nav>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? <p role="status">{notice}</p> : null}
      {kind === 'users' ? (
        <Users
          users={rows as unknown as Account[]}
          refresh={() => setRevision((v) => v + 1)}
          onError={setError}
        />
      ) : kind === 'audit' ? (
        <div className="panel table-wrap">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Resource</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={String(r.id)}>
                  <td>{String(r.createdAt)}</td>
                  <td>{String(r.userId)}</td>
                  <td>{String(r.action)}</td>
                  <td>{String(r.resource)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="cms-grid">
          <div className="panel cms-card">
            <h2>{kind}</h2>
            {canEdit && !['settings', 'campaigns'].includes(kind) ? (
              <button
                className="btn"
                type="button"
                onClick={() => {
                  setSelected('')
                  setContent('{}')
                }}
              >
                New record
              </button>
            ) : null}
            <div className="cms-records">
              {rows.map((r) => (
                <button
                  type="button"
                  className={`btn ${selected === String(r.id) ? 'primary' : ''}`}
                  key={String(r.id)}
                  onClick={() => {
                    setSelected(String(r.id))
                    setContent(JSON.stringify(kind === 'settings' ? r.payload : r, null, 2))
                  }}
                >
                  {String(r.name ?? r.id)}
                  {typeof r.dataSource === 'string' ? ` · ${r.dataSource}` : ''}
                </button>
              ))}
            </div>
          </div>
          <form className="panel cms-card" onSubmit={save}>
            <h2>{selected ? 'Edit record' : 'Choose or create a record'}</h2>
            <label>
              Record ID
              <input
                className="control"
                required
                pattern="[a-zA-Z0-9_-]{1,100}"
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                readOnly={kind === 'settings' || !canEdit}
              />
            </label>
            <label>
              Content JSON
              <textarea
                className="control cms-json"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                spellCheck={false}
                readOnly={!canEdit || kind === 'campaigns'}
                required
              />
            </label>
            <p>
              Schema validation runs on the backend. Referenced records cannot be deleted. Campaign
              status stays in the approval/launch workflow.
            </p>
            {canEdit && kind !== 'campaigns' ? (
              <div className="page-actions">
                <button type="submit" disabled={busy} className="btn primary">
                  Save content
                </button>
                {selected && kind !== 'settings' ? (
                  <button type="button" disabled={busy} className="btn" onClick={remove}>
                    Delete record
                  </button>
                ) : null}
              </div>
            ) : (
              <p>Read-only for this collection or account.</p>
            )}
          </form>
        </div>
      )}
    </section>
  )
}
function Users({
  users,
  refresh,
  onError,
}: {
  users: Account[]
  refresh: () => void
  onError: (s: string) => void
}) {
  const [busy, setBusy] = useState(false)
  async function send(path: string, body: unknown, method: string) {
    setBusy(true)
    onError('')
    try {
      const r = await fetch(`/api/gateway/auth/users${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const b = await r.json()
      if (!r.ok) throw Error(b.error)
      refresh()
      return true
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Account update failed.')
      return false
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <form
        className="panel cms-card"
        onSubmit={async (e) => {
          e.preventDefault()
          const form = e.currentTarget,
            f = new FormData(form)
          if (
            await send(
              '',
              {
                email: f.get('email'),
                name: f.get('name'),
                password: f.get('password'),
                role: f.get('role'),
              },
              'POST',
            )
          )
            form.reset()
        }}
      >
        <h2>Create account</h2>
        <label>
          Name
          <input className="control" name="name" required maxLength={100} />
        </label>
        <label>
          Email
          <input className="control" name="email" type="email" required />
        </label>
        <label>
          Initial password
          <input
            className="control"
            name="password"
            type="password"
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
            required
          />
        </label>
        <label>
          Role
          <select className="control" name="role" defaultValue="viewer">
            {['admin', 'editor', 'operator', 'commercial', 'viewer'].map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn primary" disabled={busy}>
          Create account
        </button>
      </form>
      <div className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th>Account</th>
              <th>Role</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  {u.name}
                  <br />
                  {u.email}
                </td>
                <td>
                  <select
                    aria-label={`Role for ${u.email}`}
                    className="control"
                    value={u.role}
                    disabled={busy}
                    onChange={(e) => send(`/${u.id}`, { role: e.target.value }, 'PATCH')}
                  >
                    {['admin', 'editor', 'operator', 'commercial', 'viewer'].map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                </td>
                <td>{u.active ? 'Active' : 'Disabled'}</td>
                <td>
                  <button
                    className="btn"
                    disabled={busy}
                    onClick={() => send(`/${u.id}`, { active: !u.active }, 'PATCH')}
                    type="button"
                  >
                    {u.active ? 'Disable' : 'Enable'}
                  </button>
                  <button
                    className="btn"
                    disabled={busy}
                    type="button"
                    onClick={() => {
                      const password = window.prompt('Set a new password (at least 12 characters)')
                      if (password) send(`/${u.id}`, { password }, 'PATCH')
                    }}
                  >
                    Reset password
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
