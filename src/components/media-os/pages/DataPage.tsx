'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { api } from '@/lib/client-api'
import { canManage } from '@/lib/permissions'
import { useAuth } from '../context/AuthContext'
import { useMediaCatalog } from '../context/MediaCatalogContext'

export function DataPage() {
  const { user } = useAuth()
  const canEdit = canManage(user?.role, 'content')
  const { gateway, projects, inventory, refresh, settings } = useMediaCatalog()
  const [json, setJson] = useState('')
  useEffect(() => {
    if (settings.importTemplate) setJson(JSON.stringify(settings.importTemplate, null, 2))
  }, [settings.importTemplate])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Data request failed.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="page">
      <div className="page-head">
        <div>
          <h1>Data Connections</h1>
          <p>
            Connect project metadata and import catalogs. SSP / DSP connections have their own
            programmatic workspace.
          </p>
        </div>
        <span className={`status ${gateway ? 'blue' : 'amber'}`}>
          {gateway ? 'Gateway connected' : 'Gateway unavailable'}
        </span>
      </div>

      <div className="panel connection-form">
        <h2>Public project metadata</h2>
        <Link className="btn" href="/programmatic/connections">
          Open SSP / DSP dashboard →
        </Link>
        <p className="demo-note">
          Sync reads the description from each public website. It does not import private users,
          transactions or music files. Website screenshots remain snapshots until replaced.
        </p>
        {projects.map((p) => (
          <div className="connection-source-row" key={p.id}>
            <div>
              <strong>{p.name}</strong>
              <a href={p.url} target="_blank" rel="noreferrer">
                {p.url}
              </a>
            </div>
            <button
              type="button"
              className="btn"
              disabled={!canEdit || busy || !gateway}
              onClick={() =>
                run(async () => {
                  await api(`/api/gateway/projects/${p.id}/sync`, {})
                  refresh()
                  setNotice(`${p.name} public description updated.`)
                })
              }
            >
              Sync public description
            </button>
          </div>
        ))}
      </div>
      <div className="panel connection-form">
        <h2>Import projects, inventory and creatives</h2>
        <p className="demo-note">
          Paste the JSON contract or use the gateway API from your existing backend. Projects and
          inventory upsert by ID; creatives are added as new items. Imports run in a transaction.
        </p>
        <label htmlFor="data-import">JSON data</label>
        <textarea
          id="data-import"
          className="control data-json"
          value={json}
          onChange={(e) => setJson(e.target.value)}
          spellCheck={false}
        />
        <div className="project-actions">
          <button
            type="button"
            className="btn primary"
            disabled={!canEdit || busy || !gateway}
            onClick={() =>
              run(async () => {
                const result = await api<{
                  imported: { projects: number; inventory: number; creatives: number }
                }>('/api/gateway/import', JSON.parse(json))
                refresh()
                setNotice(
                  `Imported ${result.imported.projects} projects, ${result.imported.inventory} placements and ${result.imported.creatives} creatives.`,
                )
              })
            }
          >
            Import data
          </button>
          <button
            type="button"
            className="btn"
            disabled={!canEdit || busy || !gateway}
            onClick={() =>
              run(async () => {
                const data = await api('/api/gateway/export')
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
                const url = URL.createObjectURL(blob)
                const link = document.createElement('a')
                link.href = url
                link.download = 'media-os-export.json'
                link.click()
                URL.revokeObjectURL(url)
                setNotice('Catalog export downloaded.')
              })
            }
          >
            Export catalogs
          </button>
        </div>
        <small>
          {projects.length} projects · {inventory.length} inventory placements currently available
        </small>
      </div>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="connection-notice" role="status">
          {notice}
        </p>
      ) : null}
    </section>
  )
}
