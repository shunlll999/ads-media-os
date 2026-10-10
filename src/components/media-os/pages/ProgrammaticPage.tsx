'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/client-api'
import { canManage, canViewRoute } from '@/lib/permissions'
import { useAuth } from '../context/AuthContext'
import { useMediaCatalog } from '../context/MediaCatalogContext'

type Deal = {
  id: string
  name: string
  type: string
  dsp: string
  ssp: string
  inventoryIds: string[]
  cpm: number
  floorCpm: number
  budget: number
  startDate: string
  endDate: string
  impressionTarget: number
  status: string
  source: string
  stage: string
  paymentStatus: string
  projectId?: string
}
type Metrics = {
  deal: Deal
  spend: number
  impressions: number
  sspFee: number
  cost: number
  revenue: number
  margin: number
  cpm: number | null
  delivery: number
  pacing: number | null
  fillRate: number | null
  winRate: number | null
  transactionCount: number
  asOf: string
  series: { time: string; impressions: number; spend: number }[]
}
type Profile = {
  venueId: string
  latitude: number
  longitude: number
  screenSize: string
  width: number
  height: number
  slotDuration: number
  loopDuration: number
  operatingStart: string
  operatingEnd: string
  cms: string
  ssp: string
  sspInventoryId: string
  floorCpm: number
  audiencePerPlay: number
  enabled?: boolean
  testStatus?: string
  testedAt?: string
}
type Screen = {
  id: string
  name: string
  inventoryId: string
  lastHeartbeat: string | null
  profile: Profile | null
}
type Connection = {
  id: string
  name: string
  mode: string
  status: string
  lastSync: string | null
  inventorySynced: number
  creativeSynced: number
  transactionsToday: number
  error?: string
}
type Issue = { id: string; title: string; action: string; href: string; source: string }
type Commercial = {
  target: number
  revenue: number
  month: string
  bySource: { mock: number; partner: number }
  groups: {
    dsp: Record<string, number>
    ssp: Record<string, number>
    inventory: Record<string, number>
  }
  deals: Metrics[]
}
type View = 'deals' | 'connections' | 'onboarding' | 'monitor' | 'operations' | 'commercial'
const money = (n: number) =>
  new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    maximumFractionDigits: 2,
  }).format(n)
const number = (n: number) => new Intl.NumberFormat('en-US').format(n)
const pct = (n: number | null) => (n === null ? '—' : `${n.toFixed(1)}%`)
const endpoint = '/api/gateway/programmatic'
const titles: Record<View, string> = {
  deals: 'Programmatic Deal Center',
  connections: 'SSP / DSP Connection Dashboard',
  onboarding: 'Screen & Inventory Onboarding',
  monitor: 'Programmatic Campaign Monitor',
  operations: 'Operations & Troubleshooting',
  commercial: 'Commercial & Revenue',
}
function Badge({ children }: { children: React.ReactNode }) {
  return <span className="pg-badge">{children}</span>
}
function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="panel pg-stat">
      <small>{label}</small>
      <strong>{value}</strong>
      {hint ? <span>{hint}</span> : null}
    </div>
  )
}
function DeliveryChart({ series, period }: { series: Metrics['series']; period: string }) {
  const max = Math.max(1, ...series.map((s) => s.impressions))
  return (
    <div className="panel pg-chart">
      <h2>
        Delivery by {period} <small>UTC</small>
      </h2>
      {series.length ? (
        <>
          <div
            className="pg-bars"
            role="img"
            aria-label={`Delivered impressions: ${series.map((s) => `${s.time}: ${s.impressions}`).join(', ')}`}
          >
            {series.map((s) => (
              <div className="pg-bar" key={s.time}>
                <span
                  title={`${s.time} UTC · ${number(s.impressions)} impressions · ${money(s.spend)}`}
                  style={{ height: `${Math.max(2, (s.impressions / max) * 100)}%` }}
                />
                <small>
                  {period === 'hour' ? s.time.slice(5).replace('T', ' ') : s.time.slice(5)}
                </small>
              </div>
            ))}
          </div>
          <details>
            <summary>View delivery data</summary>
            <div className="pg-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Time (UTC)</th>
                    <th>Impressions</th>
                    <th>Spend</th>
                  </tr>
                </thead>
                <tbody>
                  {series.map((s) => (
                    <tr key={s.time}>
                      <td>{s.time}</td>
                      <td>{number(s.impressions)}</td>
                      <td>{money(s.spend)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      ) : (
        <p className="pg-empty">
          No transactions yet. Run a mock batch for a mock deal, or import validated partner
          transactions.
        </p>
      )}
    </div>
  )
}
export function ProgrammaticPage({
  view,
  embedded = false,
  commercialMode = 'all',
}: {
  view: View
  embedded?: boolean
  commercialMode?: 'all' | 'proposals' | 'billing'
}) {
  const { inventory, projects, settings } = useMediaCatalog()
  const { user } = useAuth()
  const canEdit = canManage(user?.role, view === 'commercial' ? 'commercial' : 'operations')
  const [deals, setDeals] = useState<Deal[]>([])
  const [screens, setScreens] = useState<Screen[]>([])
  const [connections, setConnections] = useState<Connection[]>([])
  const [syncingConnection, setSyncingConnection] = useState('')
  const [issues, setIssues] = useState<Issue[]>([])
  const [commercial, setCommercial] = useState<Commercial | null>(null)
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [selected, setSelected] = useState('')
  const [period, setPeriod] = useState('day')
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7))
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [revision, setRevision] = useState(0)
  const [transactionJson, setTransactionJson] = useState('')
  const [editingScreen, setEditingScreen] = useState('')
  const [profile, setProfile] = useState<Profile>({
    venueId: '',
    latitude: 0,
    longitude: 0,
    screenSize: '',
    width: 0,
    height: 0,
    slotDuration: 0,
    loopDuration: 0,
    operatingStart: '',
    operatingEnd: '',
    cms: '',
    ssp: '',
    sspInventoryId: '',
    floorCpm: 0,
    audiencePerPlay: 0,
  })
  useEffect(() => {
    if (!editingScreen && settings.programmatic) setProfile(settings.programmatic.profile)
  }, [settings.programmatic, editingScreen])
  const refresh = useCallback(() => setRevision((v) => v + 1), [])
  useEffect(() => {
    const controller = new AbortController()
    let live = true
    setLoading(true)
    const path =
      view === 'onboarding'
        ? '/screens'
        : view === 'operations'
          ? '/operations'
          : view === 'commercial'
            ? `/commercial?month=${month}`
            : view === 'connections'
              ? '/connections'
              : '/deals'
    fetch(`${endpoint}${path}${path.includes('?') ? '&' : '?'}refresh=${revision}`, {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(async (r) => {
        const data = await r.json()
        if (!r.ok) throw new Error(data.error ?? 'Unable to load data.')
        return data
      })
      .then((data) => {
        if (!live) return
        setError('')
        if (view === 'onboarding') setScreens(data)
        else if (view === 'operations') setIssues(data)
        else if (view === 'connections') setConnections(data)
        else if (view === 'commercial') setCommercial(data)
        else {
          setDeals(data)
          setSelected((old) => (data.some((d: Deal) => d.id === old) ? old : (data[0]?.id ?? '')))
        }
      })
      .catch((e) => {
        if (live && e.name !== 'AbortError') setError(e.message)
      })
      .finally(() => {
        if (live) setLoading(false)
      })
    return () => {
      live = false
      controller.abort()
    }
  }, [view, month, revision])
  useEffect(() => {
    if (view !== 'monitor' || !selected) return
    const controller = new AbortController()
    let live = true
    setMetrics(null)
    fetch(`${endpoint}/deals/${selected}/metrics?period=${period}&refresh=${revision}`, {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(async (r) => {
        const data = await r.json()
        if (!r.ok) throw new Error(data.error)
        return data
      })
      .then((data) => {
        if (live) {
          setMetrics(data)
          setError('')
        }
      })
      .catch((e) => {
        if (live && e.name !== 'AbortError') setError(e.message)
      })
    return () => {
      live = false
      controller.abort()
    }
  }, [view, selected, period, revision])
  // Read-only polling. Generating transactions always requires an explicit button press.
  useEffect(() => {
    if (view !== 'monitor') return
    const timer = window.setInterval(refresh, 30000)
    return () => window.clearInterval(timer)
  }, [view, refresh])
  async function run(
    path: string,
    body: unknown = {},
    method: 'POST' | 'PATCH' | 'DELETE' = 'POST',
  ) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await api<unknown>(
        `${endpoint}${path}${path.includes('?') ? '&' : '?'}refresh=${revision}`,
        body,
        method,
      )
      setNotice('Saved successfully.')
      refresh()
      return result
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed.')
      return null
    } finally {
      setBusy(false)
    }
  }
  function beginProfile(s: Screen) {
    setEditingScreen(s.id)
    setProfile(s.profile ?? { ...profile, venueId: s.inventoryId, sspInventoryId: `mock-${s.id}` })
  }
  return (
    <section className={`page pg-page ${embedded ? 'pg-embedded' : ''} pg-${commercialMode}`}>
      <div className="page-head">
        <div>
          <p className="pg-eyebrow">
            {view === 'commercial'
              ? 'COMMERCIAL'
              : ['onboarding', 'operations'].includes(view)
                ? 'OPERATIONS'
                : 'PROGRAMMATIC'}
          </p>
          <h1>
            {view === 'commercial' && commercialMode !== 'all'
              ? commercialMode === 'billing'
                ? 'Billing'
                : 'Proposals'
              : titles[view]}
          </h1>
          <p>Real project context · Persisted transactions · Explicit mock partner adapters</p>
        </div>
        <button type="button" className="btn" disabled={busy || loading} onClick={refresh}>
          Refresh
        </button>
      </div>

      <p className="pg-source">
        <Badge>Mock SSP / DSP adapter</Badge> Demo sync and traffic use mock partners. Imported
        partner transactions stay in separate deals.
      </p>
      {error ? (
        <p className="form-error" role="alert">
          {error}{' '}
          <button type="button" className="btn" onClick={refresh}>
            Retry loading
          </button>
        </p>
      ) : null}
      {notice ? (
        <p className="connection-notice" role="status">
          {notice}
        </p>
      ) : null}
      {loading ? <p role="status">Loading programmatic data…</p> : null}
      {(view === 'deals' || view === 'monitor') && !loading && !deals.length ? (
        <div className="panel pg-empty">
          <h2>Start with your project</h2>
          <p>
            Create a deal below, or load a mock scenario using an existing project and placement.
            This creates a separate demo screen and persisted demo transactions.
          </p>
          <button
            type="button"
            className="btn primary"
            disabled={!canEdit || busy}
            onClick={() => run('/demo')}
          >
            Create mock scenario
          </button>
        </div>
      ) : null}
      {view === 'deals' ? (
        <>
          <div className="panel pg-form">
            <h2>Create a deal</h2>
            <form
              onSubmit={async (e) => {
                e.preventDefault()
                const f = new FormData(e.currentTarget)
                const body = {
                  name: f.get('name'),
                  type: f.get('type'),
                  source: f.get('source'),
                  dsp: f.get('dsp'),
                  ssp: f.get('ssp'),
                  inventoryIds: f.getAll('inventoryIds'),
                  ...(f.get('projectId') ? { projectId: f.get('projectId') } : {}),
                  cpm: Number(f.get('cpm')),
                  floorCpm: Number(f.get('floorCpm')),
                  budget: Number(f.get('budget')),
                  startDate: f.get('startDate'),
                  endDate: f.get('endDate'),
                  impressionTarget: Number(f.get('impressionTarget')),
                  sspFeePercent: Number(f.get('sspFeePercent')),
                }
                const form = e.currentTarget
                if (await run('/deals', body)) form.reset()
              }}
            >
              <fieldset className="role-write-fieldset" disabled={!canEdit}>
                <div className="pg-fields">
                  <label>
                    Deal name
                    <input
                      className="control"
                      name="name"
                      required
                      maxLength={150}
                      placeholder="Project launch • Bangkok"
                    />
                  </label>
                  <label>
                    Deal type
                    <select className="control" name="type">
                      <option>PMP</option>
                      <option>PG</option>
                      <option>Open Auction</option>
                    </select>
                  </label>
                  <label>
                    Real project
                    <select className="control" name="projectId">
                      <option value="">Standalone deal</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Transaction source
                    <select className="control" name="source">
                      <option value="mock">Mock simulation</option>
                      <option value="partner">Imported partner data (API)</option>
                    </select>
                  </label>
                  <label>
                    DSP
                    <input
                      className="control"
                      name="dsp"
                      defaultValue={settings.programmatic?.deal.dsp ?? ''}
                      required
                    />
                  </label>
                  <label>
                    SSP
                    <input
                      className="control"
                      name="ssp"
                      defaultValue={settings.programmatic?.deal.ssp ?? ''}
                      required
                    />
                  </label>
                  {(
                    [
                      ['cpm', 'CPM (THB)', settings.programmatic?.deal.cpm],
                      ['floorCpm', 'Floor CPM (THB)', settings.programmatic?.deal.floorCpm],
                      ['budget', 'Budget (THB)', settings.programmatic?.deal.budget],
                      [
                        'impressionTarget',
                        'Impression target',
                        settings.programmatic?.deal.impressionTarget,
                      ],
                      ['sspFeePercent', 'SSP fee (%)', settings.programmatic?.deal.sspFeePercent],
                    ] as const
                  ).map(([name, label, value]) => (
                    <label key={name}>
                      {label}
                      <input
                        className="control"
                        name={name}
                        type="number"
                        min={name === 'floorCpm' || name === 'sspFeePercent' ? 0 : 1}
                        max={name === 'sspFeePercent' ? 50 : undefined}
                        step={name === 'impressionTarget' ? 1 : '.01'}
                        defaultValue={value}
                        required
                      />
                    </label>
                  ))}
                  <label>
                    Start date
                    <input
                      className="control"
                      type="date"
                      name="startDate"
                      defaultValue={settings.planning?.startDate ?? ''}
                      required
                    />
                  </label>
                  <label>
                    End date
                    <input
                      className="control"
                      type="date"
                      name="endDate"
                      defaultValue={settings.planning?.endDate ?? ''}
                      required
                    />
                  </label>
                </div>
                <fieldset className="pg-inventory">
                  <legend>Inventory</legend>
                  {inventory.map((i) => (
                    <label key={i.id}>
                      <input type="checkbox" name="inventoryIds" value={i.id} />
                      <span>
                        {i.name}
                        <small>
                          {i.area} · {i.availableFrom} → {i.availableTo}
                        </small>
                      </span>
                    </label>
                  ))}
                </fieldset>
                <p className="demo-note">
                  Activation requires a tested, enabled screen for every placement. PG also checks
                  modeled capacity and guaranteed impression cost. Deal ID is generated on save.
                </p>
                <button
                  className="btn primary"
                  type="submit"
                  disabled={!canEdit || busy || !inventory.length}
                >
                  Create draft deal
                </button>
              </fieldset>
            </form>
          </div>
          <div className="panel pg-table-wrap">
            <h2>
              Deals <small>{deals.length}</small>
            </h2>
            <table>
              <thead>
                <tr>
                  <th>Deal / Project</th>
                  <th>Partners / Inventory</th>
                  <th>Commercial terms</th>
                  <th>Flight / Target</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {deals.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <strong>{d.name}</strong>
                      <small>{d.id}</small>
                      <Badge>
                        {d.type} · {d.source}
                      </Badge>
                      {d.projectId ? (
                        <Link href={`/projects`}>
                          {projects.find((p) => p.id === d.projectId)?.name ?? d.projectId}
                        </Link>
                      ) : null}
                    </td>
                    <td>
                      {d.dsp} → {d.ssp}
                      <small>
                        {d.inventoryIds
                          .map((id) => inventory.find((i) => i.id === id)?.name ?? id)
                          .join(', ')}
                      </small>
                    </td>
                    <td>
                      {money(d.budget)}
                      <small>
                        CPM {money(d.cpm)} · floor {money(d.floorCpm)}
                      </small>
                    </td>
                    <td>
                      {d.startDate} → {d.endDate}
                      <small>{number(d.impressionTarget)} impressions</small>
                    </td>
                    <td>
                      <Badge>{d.status}</Badge>
                      <div className="pg-actions">
                        <button
                          type="button"
                          className="btn"
                          disabled={!canEdit || busy || !['Draft', 'Paused'].includes(d.status)}
                          onClick={() =>
                            window.dispatchEvent(
                              new CustomEvent('workspace-edit-record', {
                                detail: { type: 'deals', id: d.id },
                              }),
                            )
                          }
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn"
                          disabled={!canEdit || busy || d.status === 'Active'}
                          onClick={async () => {
                            if (
                              window.confirm(
                                `Remove deal ${d.name}? Its mock transactions will also be removed. Partner history is preserved.`,
                              ) &&
                              (await run(`/deals/${d.id}`, {}, 'DELETE'))
                            )
                              window.location.reload()
                          }}
                        >
                          Delete
                        </button>
                        {d.status === 'Draft' || d.status === 'Paused' ? (
                          <button
                            className="btn"
                            type="button"
                            disabled={!canEdit || busy}
                            onClick={() => run(`/deals/${d.id}/status`, { status: 'Active' })}
                          >
                            Activate
                          </button>
                        ) : null}
                        {d.status === 'Active' ? (
                          <button
                            type="button"
                            className="btn"
                            disabled={!canEdit || busy}
                            onClick={() => run(`/deals/${d.id}/status`, { status: 'Paused' })}
                          >
                            Pause
                          </button>
                        ) : null}
                        {['Active', 'Paused'].includes(d.status) ? (
                          <button
                            type="button"
                            className="btn"
                            disabled={!canEdit || busy}
                            onClick={() => run(`/deals/${d.id}/status`, { status: 'Completed' })}
                          >
                            Complete
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
      {view === 'connections' ? (
        <>
          <div className="pg-flow">
            {connections.map((c, i) => (
              <div className="panel pg-node" key={c.id}>
                <small>0{i + 1}</small>
                <h2>{c.name}</h2>
                <Badge>{syncingConnection === c.name ? 'Syncing…' : c.status}</Badge>
                <dl>
                  <dt>Last sync</dt>
                  <dd>{c.lastSync ? new Date(c.lastSync).toLocaleString() : 'Never'}</dd>
                  <dt>Inventory synced</dt>
                  <dd>{number(c.inventorySynced)}</dd>
                  <dt>Creative synced</dt>
                  <dd>{number(c.creativeSynced)}</dd>
                  <dt>Transactions today (UTC)</dt>
                  <dd>{number(c.transactionsToday)}</dd>
                </dl>
                {c.error ? <p className="form-error">{c.error}</p> : null}
                <button
                  type="button"
                  className="btn"
                  disabled={!canEdit || busy}
                  onClick={async () => {
                    setSyncingConnection(c.name)
                    await run('/connections/sync', { name: c.name })
                    setSyncingConnection('')
                  }}
                >
                  {c.status === 'Disconnected' ? 'Connect & sync mock' : 'Sync mock'} {c.name}
                </button>
                {c.status !== 'Disconnected' ? (
                  <button
                    type="button"
                    className="btn"
                    disabled={!canEdit || busy}
                    onClick={() => run('/connections/disconnect', { name: c.name })}
                  >
                    Disconnect {c.name}
                  </button>
                ) : null}
                {c.name === 'SSP' ? (
                  <button
                    type="button"
                    className="btn"
                    disabled={!canEdit || busy}
                    onClick={() => run('/connections/sync', { name: c.name, simulateError: true })}
                  >
                    Test error scenario
                  </button>
                ) : null}
              </div>
            ))}
          </div>
          <p className="demo-note">
            Flow follows Advertiser → Agency → DSP → Ad Exchange → SSP → CMS → Screen. Sync counters
            describe the last local catalog snapshot accepted by the mock adapter. Disconnect saves
            the disconnected state without deleting sync history or transactions. These controls
            simulate partner connections; screen playback continues independently.
          </p>
        </>
      ) : null}
      {view === 'onboarding' ? (
        <>
          <p>
            <Link className="btn" href="/screens">
              Register screen / Open player
            </Link>
          </p>
          {editingScreen ? (
            <div className="panel pg-form">
              <h2>Onboard screen</h2>
              <small>{editingScreen}</small>
              <form
                onSubmit={async (e) => {
                  e.preventDefault()
                  if (await run(`/screens/${editingScreen}/profile`, profile)) setEditingScreen('')
                }}
              >
                <fieldset className="role-write-fieldset" disabled={!canEdit}>
                  <div className="pg-fields">
                    {(['venueId', 'screenSize', 'cms', 'ssp', 'sspInventoryId'] as const).map(
                      (key) => (
                        <label key={key}>
                          {key}
                          <input
                            className="control"
                            required
                            value={profile[key]}
                            onChange={(e) => setProfile({ ...profile, [key]: e.target.value })}
                          />
                        </label>
                      ),
                    )}
                    {(
                      [
                        'latitude',
                        'longitude',
                        'width',
                        'height',
                        'slotDuration',
                        'loopDuration',
                        'floorCpm',
                        'audiencePerPlay',
                      ] as const
                    ).map((key) => (
                      <label key={key}>
                        {key}
                        <input
                          className="control"
                          type="number"
                          step={['latitude', 'longitude', 'floorCpm'].includes(key) ? 'any' : '1'}
                          required
                          value={profile[key]}
                          onChange={(e) =>
                            setProfile({ ...profile, [key]: Number(e.target.value) })
                          }
                        />
                      </label>
                    ))}
                    {(['operatingStart', 'operatingEnd'] as const).map((key) => (
                      <label key={key}>
                        {key}
                        <input
                          className="control"
                          type="time"
                          required
                          value={profile[key]}
                          onChange={(e) => setProfile({ ...profile, [key]: e.target.value })}
                        />
                      </label>
                    ))}
                  </div>
                  <p className="demo-note">
                    Audience per play is an explicit capacity assumption, not a measured audience.
                    Saving changes disables programmatic and requires a new test.
                  </p>
                  <div className="pg-actions">
                    <button className="btn primary" disabled={!canEdit || busy} type="submit">
                      Save onboarding
                    </button>
                    <button className="btn" type="button" onClick={() => setEditingScreen('')}>
                      Cancel
                    </button>
                  </div>
                </fieldset>
              </form>
            </div>
          ) : null}
          <div className="pg-screen-grid">
            {screens.map((s) => (
              <article className="panel pg-screen" key={s.id}>
                <div className="pg-card-head">
                  <h2>{s.name}</h2>
                  <Badge>{s.profile?.enabled ? 'Programmatic enabled' : 'Not enabled'}</Badge>
                </div>
                <small>{s.id}</small>
                {s.profile ? (
                  <dl>
                    <dt>Venue ID</dt>
                    <dd>{s.profile.venueId}</dd>
                    <dt>Lat / Lng</dt>
                    <dd>
                      {s.profile.latitude}, {s.profile.longitude}
                    </dd>
                    <dt>Size / Resolution</dt>
                    <dd>
                      {s.profile.screenSize} · {s.profile.width} × {s.profile.height}
                    </dd>
                    <dt>Aspect ratio</dt>
                    <dd>{(s.profile.width / s.profile.height).toFixed(3)} : 1</dd>
                    <dt>Slot / Loop</dt>
                    <dd>
                      {s.profile.slotDuration}s / {s.profile.loopDuration}s
                    </dd>
                    <dt>Operating hours</dt>
                    <dd>
                      {s.profile.operatingStart}–{s.profile.operatingEnd} UTC
                    </dd>
                    <dt>CMS / SSP</dt>
                    <dd>
                      {s.profile.cms} / {s.profile.ssp}
                    </dd>
                    <dt>SSP inventory ID</dt>
                    <dd>{s.profile.sspInventoryId}</dd>
                    <dt>Floor CPM</dt>
                    <dd>{money(s.profile.floorCpm)}</dd>
                    <dt>Test status</dt>
                    <dd>{s.profile.testStatus} · mock contract</dd>
                    <dt>Tested at</dt>
                    <dd>{s.profile.testedAt ?? 'Never'}</dd>
                  </dl>
                ) : (
                  <p>Onboarding information has not been saved.</p>
                )}
                <p className="demo-note">
                  Last heartbeat (measured):{' '}
                  {s.lastHeartbeat ? new Date(s.lastHeartbeat).toLocaleString() : 'Not received'}
                </p>
                <div className="pg-actions">
                  <button
                    className="btn"
                    type="button"
                    disabled={!canEdit || busy}
                    onClick={() => beginProfile(s)}
                  >
                    Edit onboarding
                  </button>
                  <button
                    className="btn"
                    type="button"
                    disabled={!canEdit || busy || !s.profile}
                    onClick={() => run(`/screens/${s.id}/test`)}
                  >
                    Test SSP Sync
                  </button>
                  <button
                    className="btn primary"
                    type="button"
                    disabled={!canEdit || busy || !s.profile || s.profile.testStatus !== 'Passed'}
                    onClick={() => run(`/screens/${s.id}/enable`, { enabled: !s.profile?.enabled })}
                  >
                    {s.profile?.enabled ? 'Disable Programmatic' : 'Enable for Programmatic'}
                  </button>
                  {s.profile ? (
                    <button
                      type="button"
                      className="btn"
                      disabled={!canEdit || busy || s.profile.enabled}
                      onClick={() => {
                        if (window.confirm('Remove this onboarding profile?'))
                          run(`/screens/${s.id}/profile`, {}, 'DELETE')
                      }}
                    >
                      Remove profile
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </>
      ) : null}
      {view === 'monitor' ? (
        <>
          <div className="panel pg-monitor-toolbar">
            <label>
              Campaign / Deal
              <select
                className="control"
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
              >
                <option value="">Select a deal</option>
                {deals.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} · {d.status} · {d.source}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Delivery interval
              <select
                className="control"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
              >
                <option value="day">Daily</option>
                <option value="hour">Hourly</option>
              </select>
            </label>
            <button
              type="button"
              className="btn primary"
              disabled={
                !canEdit ||
                busy ||
                !metrics ||
                metrics.deal.source !== 'mock' ||
                metrics.deal.status !== 'Active'
              }
              onClick={() => run(`/deals/${selected}/simulate`)}
            >
              Run mock transaction batch
            </button>
          </div>
          {metrics ? (
            <>
              <div className="pg-card-head">
                <h2>{metrics.deal.name}</h2>
                <Badge>
                  {metrics.deal.status} · {metrics.deal.source} transactions
                </Badge>
              </div>
              <p className="demo-note">
                {metrics.transactionCount} recorded transactions · 30s read-only refresh · As of{' '}
                {metrics.asOf} UTC
                {metrics.deal.source === 'mock' ? ' (simulation clock can be ahead of today)' : ''}
              </p>
              <div className="pg-stats">
                <Stat label="Budget" value={money(metrics.deal.budget)} />
                <Stat
                  label="Spend"
                  value={money(metrics.spend)}
                  hint={`${money(Math.max(0, metrics.deal.budget - metrics.spend))} remaining`}
                />
                <Stat
                  label="Delivered impressions"
                  value={number(metrics.impressions)}
                  hint={`Target ${number(metrics.deal.impressionTarget)}`}
                />
                <Stat
                  label="Effective CPM"
                  value={metrics.cpm === null ? '—' : money(metrics.cpm)}
                />
                <Stat label="Delivery" value={pct(metrics.delivery)} />
                <Stat
                  label="Pacing"
                  value={pct(metrics.pacing)}
                  hint="Delivery ÷ elapsed flight fraction"
                />
                <Stat label="Fill rate" value={pct(metrics.fillRate)} hint="Wins ÷ ad requests" />
                <Stat label="Win rate" value={pct(metrics.winRate)} hint="Wins ÷ bids" />
                <Stat
                  label="Media revenue"
                  value={money(metrics.revenue)}
                  hint="Gross spend − SSP fee"
                />
              </div>
              <DeliveryChart series={metrics.series} period={period} />
              <div className="panel pg-form">
                <h2>Import a transaction</h2>
                <p className="demo-note">
                  Authenticated operator import. The source, deal, placement and flight must match.
                  Use the same event ID when retrying; identical retries do not increase totals.
                </p>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault()
                    try {
                      const parsed = JSON.parse(transactionJson)
                      await run('/transactions', parsed)
                    } catch {
                      setError('Enter valid transaction JSON.')
                    }
                  }}
                >
                  <fieldset className="role-write-fieldset" disabled={!canEdit}>
                    <label>
                      Transaction JSON
                      <textarea
                        className="control data-json"
                        required
                        value={transactionJson}
                        onChange={(e) => setTransactionJson(e.target.value)}
                        placeholder={JSON.stringify(
                          {
                            id: 'partner-event-001',
                            dealId: selected,
                            inventoryId: metrics.deal.inventoryIds[0],
                            source: metrics.deal.source,
                            occurredAt: new Date().toISOString(),
                            impressions: 1000,
                            requests: 100,
                            bids: 50,
                            wins: 20,
                            spend: 191,
                            sspFee: 28.65,
                            cost: 95.5,
                          },
                          null,
                          2,
                        )}
                      />
                    </label>
                    <button className="btn" type="submit" disabled={!canEdit || busy}>
                      Import validated transaction
                    </button>
                  </fieldset>
                </form>
                <h2 style={{ marginTop: 24 }}>Optimization checkpoints</h2>
                <p>
                  {metrics.pacing !== null && metrics.pacing < 80
                    ? 'Under-pacing: review inventory eligibility, floors and impression target.'
                    : 'Check performance against the flight plan before changing prices or targeting.'}
                </p>
                <div className="pg-actions">
                  <Link className="btn" href="/operations">
                    Investigate issues
                  </Link>
                  <Link className="btn" href="/deals">
                    Manage deal / Pause
                  </Link>
                  {canViewRoute(user?.role, '/commercial') ? (
                    <Link className="btn" href="/commercial">
                      Review revenue
                    </Link>
                  ) : null}
                </div>
              </div>
            </>
          ) : selected ? (
            <p role="status">Loading metrics…</p>
          ) : null}
        </>
      ) : null}
      {view === 'operations' ? (
        <div className="pg-issues">
          {issues.length ? (
            issues.map((i) => (
              <article className="panel pg-issue" key={i.id}>
                <Badge>{i.source}</Badge>
                <h2>{i.title}</h2>
                <p>
                  <strong>Suggested action</strong>
                  <br />
                  {i.action}
                </p>
                <Link className="btn" href={i.href}>
                  Open relevant workspace →
                </Link>
              </article>
            ))
          ) : !loading ? (
            <div className="panel pg-empty">
              <h2>No detected issues</h2>
              <p>
                Diagnostics use onboarding configuration, recorded transactions, connection errors
                and actual screen heartbeats. A screen without heartbeat is unverified, rather than
                assumed offline.
              </p>
              <Link className="btn" href="/data">
                Test a mock SSP sync error
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}
      {view === 'commercial' ? (
        <>
          <div className="panel pg-monitor-toolbar">
            <label>
              Revenue month (UTC)
              <input
                className="control"
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="btn"
              disabled={!canEdit || busy}
              onClick={() => run(`/commercial/target?month=${month}`, {}, 'DELETE')}
            >
              Reset target to CMS default
            </button>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                const f = new FormData(e.currentTarget)
                run('/commercial/target', { target: Number(f.get('target')), month })
              }}
            >
              <fieldset className="role-write-fieldset" disabled={!canEdit}>
                <label>
                  Monthly target (THB)
                  <input
                    className="control"
                    name="target"
                    type="number"
                    min={1}
                    required
                    defaultValue={commercial?.target ?? settings.programmatic?.revenueTarget ?? 0}
                    key={commercial?.target}
                  />
                </label>
                <button className="btn" type="submit" disabled={!canEdit || busy}>
                  Save target
                </button>
              </fieldset>
            </form>
          </div>
          {commercial ? (
            <>
              <div className="pg-stats">
                <Stat
                  label="Programmatic media revenue"
                  value={money(commercial.revenue)}
                  hint={`${commercial.month} · mock ${money(commercial.bySource.mock)} / partner ${money(commercial.bySource.partner)}`}
                />
                <Stat label="This month target" value={money(commercial.target)} />
                <Stat
                  label="Target achievement"
                  value={pct((commercial.revenue / commercial.target) * 100)}
                />
              </div>
              <div className="pg-revenue-groups">
                {(['dsp', 'ssp', 'inventory'] as const).map((group) => (
                  <div className="panel pg-form" key={group}>
                    <h2>Revenue by {group.toUpperCase()}</h2>
                    {Object.entries(commercial.groups[group]).length ? (
                      Object.entries(commercial.groups[group]).map(([key, value]) => (
                        <div className="pg-revenue-row" key={key}>
                          <span>
                            {group === 'inventory'
                              ? (inventory.find((i) => i.id === key)?.name ?? key)
                              : key}
                          </span>
                          <strong>{money(value)}</strong>
                        </div>
                      ))
                    ) : (
                      <p>No transactions in this month.</p>
                    )}
                  </div>
                ))}
              </div>
              <div className="panel pg-table-wrap">
                <h2>
                  {commercialMode === 'billing'
                    ? 'Invoices & payment collection'
                    : commercialMode === 'proposals'
                      ? 'Proposal & quotation pipeline'
                      : 'Deal economics & collection'}
                </h2>
                <p className="demo-note">
                  Economics below cover each deal's full flight. Stages and payment status are
                  manual prototype records; no quotation is sent or bank payment collected.
                </p>
                {commercial.deals.filter(
                  (m) =>
                    commercialMode === 'all' ||
                    (commercialMode === 'billing'
                      ? ['Invoice', 'Paid'].includes(m.deal.stage)
                      : ['Proposal', 'Quotation', 'Campaign'].includes(m.deal.stage)),
                ).length === 0 ? (
                  <p className="pg-empty">
                    {commercialMode === 'billing'
                      ? 'No invoices yet. Advance a proposal to Invoice to start collection.'
                      : 'No proposals or deals yet. Create a deal to start the commercial workflow.'}{' '}
                    <Link href={commercialMode === 'billing' ? '/commercial/proposals' : '/deals'}>
                      {commercialMode === 'billing' ? 'Open proposals →' : 'Open Deals →'}
                    </Link>
                  </p>
                ) : null}
                <table>
                  <thead>
                    <tr>
                      <th>Deal</th>
                      <th>Gross spend</th>
                      <th>SSP fee</th>
                      <th>Media revenue</th>
                      <th>Media cost / Margin</th>
                      <th>Workflow / Payment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {commercial.deals
                      .filter(
                        (m) =>
                          commercialMode === 'all' ||
                          (commercialMode === 'billing'
                            ? ['Invoice', 'Paid'].includes(m.deal.stage)
                            : ['Proposal', 'Quotation', 'Campaign'].includes(m.deal.stage)),
                      )
                      .map((m) => {
                        const steps = ['Proposal', 'Quotation', 'Campaign', 'Invoice', 'Paid']
                        const next = steps[steps.indexOf(m.deal.stage) + 1]
                        return (
                          <tr key={m.deal.id}>
                            <td>
                              <strong>{m.deal.name}</strong>
                              <Badge>{m.deal.source}</Badge>
                            </td>
                            <td>{money(m.spend)}</td>
                            <td>{money(m.sspFee)}</td>
                            <td>{money(m.revenue)}</td>
                            <td>
                              {money(m.cost)} / {money(m.margin)}
                            </td>
                            <td>
                              <Badge>
                                {m.deal.stage} · {m.deal.paymentStatus}
                              </Badge>
                              {next ? (
                                <form
                                  onSubmit={(e) => {
                                    e.preventDefault()
                                    const f = new FormData(e.currentTarget)
                                    run(`/deals/${m.deal.id}/commercial`, {
                                      stage: next,
                                      reference: f.get('reference'),
                                    })
                                  }}
                                >
                                  <fieldset className="role-write-fieldset" disabled={!canEdit}>
                                    <label className="pg-reference">
                                      Document / payment reference
                                      <input
                                        className="control"
                                        name="reference"
                                        required
                                        minLength={3}
                                        placeholder={`${next} reference`}
                                      />
                                    </label>
                                    <button
                                      type="submit"
                                      className="btn"
                                      disabled={!canEdit || busy}
                                    >
                                      Record {next}
                                    </button>
                                  </fieldset>
                                </form>
                              ) : null}
                            </td>
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
              </div>
              <p className="demo-note">
                Proposal → Quotation → Campaign → Invoice → Paid. Net revenue = spend − SSP fee;
                margin = net revenue − recorded media cost.
              </p>
            </>
          ) : null}
        </>
      ) : null}
    </section>
  )
}
