'use client'
import Link from 'next/link'
import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/client-api'
import { canManage } from '@/lib/permissions'
import type { Campaign, Creative, DisplayScreen } from '@/types/media-os'
import { useAuth } from '../context/AuthContext'
import { useMediaCatalog } from '../context/MediaCatalogContext'

const formats = {
  landscape: [1920, 1080],
  portrait: [1080, 1920],
  square: [1080, 1080],
  ultrawide: [3840, 1080],
  classic: [1440, 1080],
  custom: [1920, 1080],
} as const
export function ScreensPage() {
  const { inventory, gateway } = useMediaCatalog()
  const { user } = useAuth()
  const canEdit = canManage(user?.role, 'operations')
  const [screens, setScreens] = useState<DisplayScreen[]>([])
  const [creatives, setCreatives] = useState<Creative[]>([])
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [name, setName] = useState('')
  const [inventoryId, setInventoryId] = useState('')
  const [location, setLocation] = useState('')
  const [latitude, setLatitude] = useState(0)
  const [longitude, setLongitude] = useState(0)
  const [format, setFormat] = useState<DisplayScreen['format']>('landscape')
  const [width, setWidth] = useState(1920)
  const [height, setHeight] = useState(1080)
  const [preview, setPreview] = useState(true)
  const [editing, setEditing] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [campaignId, setCampaignId] = useState('')
  const [tokens, setTokens] = useState<Record<string, string>>({})
  const [playlists, setPlaylists] = useState<Record<string, string[]>>({})
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const reload = useCallback(async () => {
    const [s, c, ca] = await Promise.all([
      api<{ data: DisplayScreen[] }>('/api/gateway/screens'),
      api<{ data: Creative[] }>('/api/creatives'),
      api<{ data: Campaign[] }>('/api/campaigns'),
    ])
    setScreens(s.data)
    setCreatives(c.data)
    setCampaigns(ca.data)
    const lists = await Promise.all(
      s.data.map(async (screen) => ({
        id: screen.id,
        data: (
          await api<{ data: { creativeId: string }[] }>(
            `/api/gateway/screens/${screen.id}/playlist`,
          )
        ).data.map((item) => item.creativeId),
      })),
    )
    setPlaylists(Object.fromEntries(lists.map((p) => [p.id, p.data])))
  }, [])
  useEffect(() => {
    if (!inventoryId && inventory[0]) {
      const i = inventory[0]
      setInventoryId(i.id)
      setLocation(i.area)
      setLatitude(i.latitude ?? 0)
      setLongitude(i.longitude ?? 0)
    }
  }, [inventory, inventoryId])
  useEffect(() => {
    if (!gateway) return
    reload().catch((e) => setError(e.message))
    const t = setInterval(
      () =>
        api<{ data: DisplayScreen[] }>('/api/gateway/screens')
          .then((data) => setScreens(data.data))
          .catch(() => {}),
      15000,
    )
    return () => clearInterval(t)
  }, [gateway, reload])
  async function action(fn: () => Promise<void>) {
    setError('')
    setNotice('')
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Screen request failed.')
    } finally {
      setBusy(false)
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault()
    await action(async () => {
      const body = {
        name,
        inventoryId,
        location,
        latitude,
        longitude,
        format,
        width,
        height,
        preview,
      }
      await api(
        editing ? `/api/gateway/screens/${editing}` : '/api/gateway/screens',
        body,
        editing ? 'PATCH' : 'POST',
      )
      setEditing('')
      setName('')
      await reload()
      setNotice(
        'Screen saved. Editing its configuration clears its playlist; assign content below.',
      )
    })
  }
  function edit(s: DisplayScreen) {
    setEditing(s.id)
    setName(s.name)
    setInventoryId(s.inventoryId)
    setLocation(s.location)
    setLatitude(s.latitude)
    setLongitude(s.longitude)
    setFormat(s.format)
    setWidth(s.width)
    setHeight(s.height)
    setPreview(s.preview)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  async function pair(s: DisplayScreen) {
    await action(async () => {
      const p = await api<{ token: string }>(`/api/gateway/screens/${s.id}/pair`, {})
      setTokens((t) => {
        const next = { ...t, [s.id]: p.token }
        return next
      })
      setNotice(
        'Player paired. Open its page below. Resetting pairing invalidates old player links.',
      )
    })
  }
  async function remove(s: DisplayScreen) {
    if (
      !window.confirm(
        `Remove screen "${s.name}"? Its unused onboarding profile and preview playlist will be removed. Playback history will be preserved by archiving the screen.`,
      )
    )
      return
    await action(async () => {
      const result = await api<{ archived: boolean }>(
        `/api/gateway/cms/records/screens/${s.id}`,
        {},
        'DELETE',
      )
      setSelected((values) => values.filter((value) => value !== s.id))
      setTokens((values) => {
        const next = { ...values }
        delete next[s.id]
        return next
      })
      if (editing === s.id) {
        setEditing('')
        setName('')
      }
      await reload()
      setNotice(
        result.archived
          ? `Screen "${s.name}" removed. Playback history preserved.`
          : `Screen "${s.name}" deleted.`,
      )
    })
  }
  const toggle = (values: string[], id: string) =>
    values.includes(id) ? values.filter((v) => v !== id) : [...values, id]
  return (
    <section className="page">
      <div className="page-head">
        <div>
          <h1>Screen Network</h1>
          <p>Independent player pages for every location, orientation and display size.</p>
        </div>
        <span className="status blue">
          {screens.filter((s) => s.online).length} online / {screens.length} screens
        </span>
      </div>
      <p>
        <Link className="btn" href="/onboarding">
          Programmatic onboarding →
        </Link>
      </p>
      {!gateway ? (
        <div className="panel state-panel">Start media-os-gateway to manage connected screens.</div>
      ) : null}
      {error ? (
        <p role="alert" className="form-error">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="connection-notice">
          {notice}
        </p>
      ) : null}
      <form className="panel connection-form" onSubmit={save}>
        <fieldset className="role-write-fieldset" disabled={!canEdit}>
          <h2>{editing ? 'Edit screen' : 'Register screen'}</h2>
          <div className="connection-fields">
            <div className="field">
              <label htmlFor="screen-name">Screen name</label>
              <input
                id="screen-name"
                className="control"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Siam LED — Screen 01"
              />
            </div>
            <div className="field">
              <label htmlFor="screen-inventory">Inventory placement</label>
              <select
                id="screen-inventory"
                className="control"
                value={inventoryId}
                onChange={(e) => {
                  setInventoryId(e.target.value)
                  const i = inventory.find((i) => i.id === e.target.value)
                  if (i) {
                    setLocation(i.area)
                    setLatitude(i.latitude ?? 0)
                    setLongitude(i.longitude ?? 0)
                  }
                }}
              >
                {inventory.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="screen-location">Display location</label>
              <input
                id="screen-location"
                className="control"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="screen-lat">Latitude</label>
              <input
                id="screen-lat"
                className="control"
                type="number"
                min={-90}
                max={90}
                step="any"
                value={latitude}
                onChange={(e) => setLatitude(Number(e.target.value))}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="screen-lng">Longitude</label>
              <input
                id="screen-lng"
                className="control"
                type="number"
                min={-180}
                max={180}
                step="any"
                value={longitude}
                onChange={(e) => setLongitude(Number(e.target.value))}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="screen-format">Display format</label>
              <select
                id="screen-format"
                className="control"
                value={format}
                onChange={(e) => {
                  const f = e.target.value as DisplayScreen['format']
                  setFormat(f)
                  setWidth(formats[f][0])
                  setHeight(formats[f][1])
                }}
              >
                {Object.keys(formats).map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="screen-width">Width (px)</label>
              <input
                id="screen-width"
                className="control"
                type="number"
                min={100}
                max={16000}
                value={width}
                onChange={(e) => setWidth(Number(e.target.value))}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="screen-height">Height (px)</label>
              <input
                id="screen-height"
                className="control"
                type="number"
                min={100}
                max={16000}
                value={height}
                onChange={(e) => setHeight(Number(e.target.value))}
                required
              />
            </div>
          </div>
          <label className="preview-checkbox">
            <input
              type="checkbox"
              checked={preview}
              onChange={(e) => setPreview(e.target.checked)}
            />
            Preview mode · ignore campaign dates; record preview plays separately
          </label>
          <div className="project-actions">
            <button className="btn primary" type="submit" disabled={!canEdit || busy || !gateway}>
              {editing ? 'Save configuration' : 'Register screen'}
            </button>
            {editing ? (
              <button
                className="btn"
                type="button"
                onClick={() => {
                  setEditing('')
                  setName('')
                }}
              >
                Cancel edit
              </button>
            ) : null}
          </div>
        </fieldset>
      </form>
      <div className="panel connection-form">
        <h2>Deploy a launched campaign</h2>
        <p className="demo-note">
          Select screens below. Every selected screen must belong to the campaign’s inventory. Live
          mode respects flight dates in Asia/Bangkok.
        </p>
        <div className="deploy-controls">
          <select
            className="control"
            aria-label="Campaign to deploy"
            value={campaignId}
            onChange={(e) => setCampaignId(e.target.value)}
          >
            <option value="">Choose a live campaign</option>
            {campaigns
              .filter((c) => c.status === 'Live')
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
          <button
            type="button"
            className="btn primary"
            disabled={!canEdit || busy || !campaignId || !selected.length}
            onClick={() =>
              action(async () => {
                await api('/api/gateway/deploy', { campaignId, screenIds: selected })
                await reload()
                setNotice('Campaign deployed to selected screens.')
              })
            }
          >
            Deploy to {selected.length} screens
          </button>
        </div>
      </div>
      <div className="screen-grid">
        {screens.map((s) => (
          <article className="panel screen-card" key={s.id}>
            <div className="screen-card-head">
              <label>
                <input
                  type="checkbox"
                  disabled={!canEdit}
                  checked={selected.includes(s.id)}
                  onChange={() => setSelected((v) => toggle(v, s.id))}
                />
                {s.name}
              </label>
              <span className={`status ${s.online ? '' : 'amber'}`}>
                {s.online ? 'Online' : 'Offline'}
              </span>
            </div>
            <div className="screen-format-visual">
              <div style={{ aspectRatio: `${s.width}/${s.height}` }}>
                <span>{s.format}</span>
                <strong>
                  {s.width} × {s.height}
                </strong>
              </div>
            </div>
            <p>
              {s.location} · {s.latitude.toFixed(4)}, {s.longitude.toFixed(4)}
            </p>
            <small>
              {s.preview ? 'Preview mode' : 'Scheduled live mode'} · Last seen:{' '}
              {s.lastSeenAt ? new Date(s.lastSeenAt).toLocaleString() : 'Never'}
            </small>
            <div className="project-actions">
              {user?.role === 'admin' || user?.role === 'editor' || user?.role === 'operator' ? (
                <button type="button" className="btn" disabled={busy} onClick={() => remove(s)}>
                  Delete screen
                </button>
              ) : null}
              <button type="button" className="btn" disabled={!canEdit} onClick={() => edit(s)}>
                Configure
              </button>
              <button
                type="button"
                className="btn"
                disabled={!canEdit || busy}
                onClick={() => pair(s)}
              >
                {tokens[s.id] ? 'Reset pairing' : 'Pair player'}
              </button>
              {tokens[s.id] ? (
                <a
                  className="btn primary"
                  href={`/player/${s.id}?token=${encodeURIComponent(tokens[s.id])}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open player ↗
                </a>
              ) : null}
            </div>
            {s.preview ? (
              <details className="screen-playlist">
                <summary>Preview playlist ({playlists[s.id]?.length ?? 0} items)</summary>
                <div className="playlist-options">
                  {creatives.map((c) => (
                    <label key={c.id}>
                      <input
                        type="checkbox"
                        disabled={!canEdit}
                        checked={playlists[s.id]?.includes(c.id) ?? false}
                        onChange={() =>
                          setPlaylists((p) => ({ ...p, [s.id]: toggle(p[s.id] ?? [], c.id) }))
                        }
                      />
                      {c.name}
                    </label>
                  ))}
                </div>
                <button
                  type="button"
                  className="btn primary"
                  disabled={!canEdit || busy}
                  onClick={() =>
                    action(async () => {
                      await api(
                        `/api/gateway/screens/${s.id}/playlist`,
                        { creativeIds: playlists[s.id] ?? [] },
                        'PUT',
                      )
                      setNotice('Preview playlist saved. Player refreshes within 5 seconds.')
                    })
                  }
                >
                  Save preview playlist
                </button>
              </details>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  )
}
