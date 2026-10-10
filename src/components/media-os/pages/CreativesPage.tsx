'use client'
import Link from 'next/link'
import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/client-api'
import { canManage } from '@/lib/permissions'
import type { Creative } from '@/types/media-os'
import { CreativeRenderer } from '../CreativeRenderer'
import { useAuth } from '../context/AuthContext'
import { useCampaignDraft } from '../context/CampaignDraftContext'
import { useMediaCatalog } from '../context/MediaCatalogContext'
export function CreativesPage() {
  const { user } = useAuth()
  const canEdit = canManage(user?.role, 'content')
  const { projects, gateway } = useMediaCatalog()
  const draft = useCampaignDraft()
  const [creatives, setCreatives] = useState<Creative[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<Creative['kind']>('project')
  const [url, setUrl] = useState('')
  const [projectId, setProjectId] = useState('')
  const [duration, setDuration] = useState(15)
  const [fit, setFit] = useState<'contain' | 'cover'>('contain')
  const reload = useCallback(async () => {
    const response = await api<{ data: Creative[] }>('/api/creatives')
    setCreatives(response.data)
  }, [])
  useEffect(() => {
    reload().catch((e) => setError(e.message))
  }, [reload])
  async function create(event: FormEvent) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      await api('/api/gateway/creatives', {
        name,
        kind,
        ...(kind === 'project' ? { projectId: projectId || projects[0]?.id } : { url }),
        durationSeconds: duration,
        fit,
      })
      await reload()
      setName('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to create creative.')
    } finally {
      setBusy(false)
    }
  }
  async function upload(file?: File) {
    if (!file) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/gateway/creatives/upload', {
        method: 'POST',
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
          'x-file-name': encodeURIComponent(file.name),
        },
        body: file,
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="page">
      <div className="page-head">
        <div>
          <h1>Creative Library</h1>
          <p>Real project cards, images, videos and web content for campaign playback.</p>
        </div>
        <Link href="/campaigns/new" className="btn primary">
          Open campaign builder
        </Link>
      </div>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <form className="panel connection-form" onSubmit={create}>
        <fieldset className="role-write-fieldset" disabled={!canEdit}>
          <h2>Add content</h2>
          <div className="connection-fields">
            <div className="field">
              <label htmlFor="creative-library-name">Name</label>
              <input
                className="control"
                id="creative-library-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="creative-library-kind">Content type</label>
              <select
                className="control"
                id="creative-library-kind"
                value={kind}
                onChange={(e) => setKind(e.target.value as Creative['kind'])}
              >
                <option value="project">Live project card</option>
                <option value="image">Image URL</option>
                <option value="video">Video URL</option>
                <option value="web">Web page / iframe</option>
              </select>
            </div>
            {kind === 'project' ? (
              <div className="field">
                <label htmlFor="creative-library-project">Source project</label>
                <select
                  className="control"
                  id="creative-library-project"
                  value={projectId || projects[0]?.id || ''}
                  onChange={(e) => setProjectId(e.target.value)}
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="field">
                <label htmlFor="creative-library-url">Content URL</label>
                <input
                  className="control"
                  id="creative-library-url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://…"
                  required
                />
              </div>
            )}
            <div className="field">
              <label htmlFor="creative-library-duration">Slot duration (seconds)</label>
              <input
                id="creative-library-duration"
                className="control"
                type="number"
                min={2}
                max={3600}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="creative-library-fit">Image / video fit</label>
              <select
                id="creative-library-fit"
                className="control"
                value={fit}
                onChange={(e) => setFit(e.target.value as 'contain' | 'cover')}
              >
                <option value="contain">Contain · show full content</option>
                <option value="cover">Cover · fill and crop</option>
              </select>
            </div>
          </div>
          <div className="project-actions">
            <button type="submit" className="btn primary" disabled={!canEdit || busy || !gateway}>
              Create creative
            </button>
            <label className="btn upload-file-label">
              Upload image / video
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm"
                disabled={!canEdit || busy || !gateway}
                onChange={(e) => upload(e.target.files?.[0])}
              />
            </label>
          </div>
          <p className="demo-note">
            Uploads are stored in Docker’s persistent volume (maximum 100MB). External websites may
            block iframe embedding; use a project card or image instead. Video plays muted.
          </p>
        </fieldset>
      </form>
      <div className="creative-library-grid">
        {creatives.map((creative) => (
          <article key={creative.id} className="panel creative-library-card">
            <div className="creative-library-preview">
              <CreativeRenderer
                creative={{
                  ...creative,
                  project: projects.find((p) => p.id === creative.projectId),
                }}
              />
            </div>
            <div className="project-body">
              <h3>{creative.name}</h3>
              <p>
                {creative.kind} · {creative.durationSeconds}s · {creative.fit}
              </p>
              <button
                type="button"
                className={`btn ${draft.creativeId === creative.id ? 'success' : 'primary'}`}
                disabled={!draft.ready}
                onClick={() => draft.setCreative(creative.id, creative.name)}
              >
                {draft.creativeId === creative.id ? 'Selected for draft ✓' : 'Use in campaign'}
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
