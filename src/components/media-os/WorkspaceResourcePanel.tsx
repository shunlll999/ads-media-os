'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/client-api'
import { type Capability, canManage } from '@/lib/permissions'
import { useAuth } from './context/AuthContext'
import { useMediaCatalog } from './context/MediaCatalogContext'

type Row = Record<string, unknown> & { id: string; name?: string }
type Config = {
  title: string
  capability: Capability
  list: string
  create: string
  update: string
  remove: string
  method?: 'PUT' | 'PATCH'
  type: string
}
const resource = (type: string, title: string, capability: Capability): Config => ({
  type,
  title,
  capability,
  list: `/api/gateway/workspace/${type}`,
  create: `/api/gateway/workspace/${type}`,
  update: `/api/gateway/workspace/${type}`,
  remove: `/api/gateway/workspace/${type}`,
})
function configFor(path: string): Config | null {
  if (path === '/deals' || path === '/monitor')
    return {
      type: 'deals',
      title: 'Deals',
      capability: 'operations',
      list: '/api/gateway/programmatic/deals',
      create: '/api/gateway/programmatic/deals',
      update: '/api/gateway/programmatic/deals',
      remove: '/api/gateway/programmatic/deals',
    }
  if (path === '/programmatic/transactions')
    return {
      type: 'transactions',
      title: 'Mock transactions',
      capability: 'operations',
      list: '/api/gateway/programmatic/transactions',
      create: '/api/gateway/programmatic/transactions',
      update: '/api/gateway/programmatic/transactions',
      remove: '/api/gateway/programmatic/transactions',
    }
  if (path === '/programmatic/connections')
    return {
      type: 'connections',
      title: 'Partner connections',
      capability: 'operations',
      list: '/api/gateway/programmatic/connections',
      create: '/api/gateway/programmatic/connections',
      update: '/api/gateway/programmatic/connections',
      remove: '/api/gateway/programmatic/connections',
    }
  if (path === '/inventory' || path.startsWith('/inventory/'))
    return {
      type: 'inventory',
      title: 'Inventory',
      capability: 'content',
      list: '/api/gateway/media',
      create: '/api/gateway/media',
      update: '/api/gateway/cms/records/inventory',
      remove: '/api/gateway/cms/records/inventory',
      method: 'PUT',
    }
  if (path === '/projects')
    return {
      type: 'projects',
      title: 'Real projects',
      capability: 'content',
      list: '/api/projects',
      create: '/api/gateway/projects',
      update: '/api/gateway/cms/records/projects',
      remove: '/api/gateway/cms/records/projects',
      method: 'PUT',
    }
  if (path === '/creatives')
    return {
      type: 'creatives',
      title: 'Creatives',
      capability: 'content',
      list: '/api/creatives',
      create: '/api/creatives',
      update: '/api/gateway/cms/records/creatives',
      remove: '/api/gateway/cms/records/creatives',
      method: 'PUT',
    }
  if (
    path === '/campaigns' ||
    (path.startsWith('/campaigns/') && path !== '/campaigns/new') ||
    path === '/approvals' ||
    path === '/analytics' ||
    path.startsWith('/analytics/')
  )
    return {
      type: 'campaigns',
      title: 'Source campaigns',
      capability: 'operations',
      list: '/api/campaigns',
      create: '/api/campaigns',
      update: '/api/gateway/campaigns',
      remove: '/api/gateway/campaigns',
    }
  if (path === '/audience') return resource('audience', 'Audience segments', 'content')
  if (path === '/data') return resource('sources', 'Data sources', 'content')
  if (path === '/operations') return resource('issues', 'Operational issues', 'operations')
  if (path === '/commercial/proposals' || path === '/commercial')
    return resource('proposals', 'Proposals and quotations', 'commercial')
  if (path === '/commercial/billing') return resource('invoices', 'Invoices', 'commercial')
  if (path === '/reports') return resource('reports', 'Saved revenue reports', 'commercial')
  return null
}
export function WorkspaceResourcePanel({ pathname }: { pathname: string }) {
  const config = configFor(pathname)
  return config ? <ResourcePanel key={pathname} config={config} /> : null
}
function ResourcePanel({ config }: { config: Config }) {
  const { user } = useAuth(),
    { inventory, projects, settings } = useMediaCatalog()
  const writable = canManage(user?.role, config.capability)
  const [rows, setRows] = useState<Row[]>([]),
    [relatedDeals, setRelatedDeals] = useState<Row[]>([]),
    [creatives, setCreatives] = useState<Row[]>([])
  const [selected, setSelected] = useState(''),
    [content, setContent] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [page, setPage] = useState(1),
    [total, setTotal] = useState(0)
  useEffect(() => {
    const abort = new AbortController()
    Promise.all(
      [config.list, '/api/gateway/programmatic/deals', '/api/creatives'].map(
        async (path, index) => {
          const response = await fetch(path, { cache: 'no-store', signal: abort.signal })
          const body = await response.json()
          if (!response.ok) throw Error(body.error)
          const data = body.data ?? body
          return index === 0 ? { rows: data, total: body.total ?? data.length } : data
        },
      ),
    )
      .then(([data, deals, assets]) => {
        setRows(data.rows)
        setTotal(data.total)
        setPage(1)
        setRelatedDeals(deals)
        setCreatives(assets)
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(e.message)
      })
    return () => abort.abort()
  }, [config.list])
  useEffect(() => {
    function selectRecord(event: Event) {
      const detail = (event as CustomEvent<{ type: string; id: string }>).detail
      if (detail.type !== config.type) return
      const row = rows.find((r) => r.id === detail.id)
      if (!row) return
      setSelected(row.id)
      setContent(JSON.stringify(row, null, 2))
      setError('')
      document
        .getElementById('workspace-resource-manager')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    window.addEventListener('workspace-edit-record', selectRecord)
    return () => window.removeEventListener('workspace-edit-record', selectRecord)
  }, [rows, config.type])
  function template(): Record<string, unknown> {
    const planning = settings.planning,
      placement = inventory[0]?.id ?? '',
      deal = relatedDeals[0]?.id ?? ''
    const dates = { startDate: planning?.startDate ?? '', endDate: planning?.endDate ?? '' }
    switch (config.type) {
      case 'deals':
        return {
          ...settings.programmatic?.deal,
          name: 'New deal',
          source: 'mock',
          inventoryIds: [placement],
          ...dates,
        }
      case 'connections':
        return { name: 'New DSP', mode: 'mock', node: 'DSP', notes: '' }
      case 'inventory':
        return {
          ...inventory[0],
          id: `inventory-${crypto.randomUUID()}`,
          name: 'New placement',
          dataSource: 'mock',
        }
      case 'projects':
        return { ...projects[0], id: `project-${crypto.randomUUID()}`, name: 'New project' }
      case 'transactions':
        return {
          id: `tx-${crypto.randomUUID()}`,
          dealId: deal,
          inventoryId: placement,
          occurredAt: `${dates.startDate}T12:00:00Z`,
          source: 'mock',
          impressions: 1000,
          requests: 2000,
          bids: 1000,
          wins: 500,
          spend: 100,
          sspFee: 15,
          cost: 20,
        }
      case 'creatives':
        return {
          name: 'New creative',
          kind: 'project',
          projectId: projects[0]?.id ?? '',
          durationSeconds: 15,
          fit: 'contain',
          dataSource: 'real',
        }
      case 'campaigns':
        return {
          name: 'New campaign',
          objective: planning?.objective ?? 'Product Launch',
          budget: planning?.budget ?? 1000000,
          inventoryIds: [placement],
          creativeId: creatives[0]?.id ?? '',
          ...dates,
        }
      case 'audience':
        return {
          name: 'New audience segment',
          inventoryIds: [placement],
          description: 'Audience estimate for selected placements',
          estimatedAudience: 0,
          dataSource: 'mock',
        }
      case 'sources':
        return {
          name: 'New data source',
          url: projects[0]?.url ?? 'https://example.com',
          status: 'Draft',
          notes: '',
        }
      case 'issues':
        return {
          name: 'New operational issue',
          severity: 'Warning',
          status: 'Open',
          action: 'Investigate and document the resolution',
          href: '/operations',
        }
      case 'proposals':
        return {
          name: 'New proposal',
          dealId: deal,
          amount: 0,
          reference: `PROP-${Date.now()}`,
          stage: 'Proposal',
          notes: '',
        }
      case 'invoices':
        return {
          name: 'New invoice',
          dealId: deal,
          amount: 0,
          reference: `INV-${Date.now()}`,
          stage: 'Invoice',
          notes: '',
        }
      default:
        return { name: 'New report', month: new Date().toISOString().slice(0, 7), notes: '' }
    }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!writable) return
    setBusy(true)
    setError('')
    try {
      const body = JSON.parse(content)
      await api(
        selected ? `${config.update}/${encodeURIComponent(selected)}` : config.create,
        body,
        selected ? (config.method ?? 'PATCH') : 'POST',
      )
      window.location.reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed.')
      setBusy(false)
    }
  }
  async function loadMore() {
    setBusy(true)
    try {
      const response = await fetch(`${config.list}?page=${page + 1}`, { cache: 'no-store' })
      const body = await response.json()
      if (!response.ok) throw Error(body.error)
      setRows((current) => [...current, ...body.data])
      setPage((current) => current + 1)
      setTotal(body.total)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed.')
    } finally {
      setBusy(false)
    }
  }
  async function remove() {
    if (
      !selected ||
      !writable ||
      !window.confirm(
        `Remove ${config.title}: ${selected}? Mock deal deletion also removes its mock transactions. Historical references may be archived.`,
      )
    )
      return
    setBusy(true)
    setError('')
    try {
      await api(`${config.remove}/${encodeURIComponent(selected)}`, {}, 'DELETE')
      window.location.reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Remove failed.')
      setBusy(false)
    }
  }
  return (
    <section
      id="workspace-resource-manager"
      className="panel workspace-resource-panel"
      aria-label={`Manage ${config.title}`}
    >
      <details open={writable}>
        <summary>
          <strong>Manage {config.title}</strong> · {rows.length} records{' '}
          {writable ? '· Create / Edit / Remove' : '· Read only'}
        </summary>
        <p className="demo-note">
          Data is persisted in PostgreSQL. Backend validation and lifecycle rules apply. Derived
          charts update from their source records.
        </p>
        {error ? (
          <p role="alert" className="form-error">
            {error}
          </p>
        ) : null}
        <div className="cms-grid">
          <div className="cms-records">
            {writable ? (
              <button
                className="btn"
                type="button"
                onClick={() => {
                  setSelected('')
                  setError('')
                  setContent(JSON.stringify(template(), null, 2))
                }}
              >
                New {config.type}
              </button>
            ) : null}
            {rows.map((row) => (
              <button
                key={row.id}
                type="button"
                className={`btn ${selected === row.id ? 'primary' : ''}`}
                onClick={() => {
                  setSelected(row.id)
                  setError('')
                  setContent(JSON.stringify(row, null, 2))
                }}
              >
                {row.name ?? row.id}
              </button>
            ))}
            {config.type === 'transactions' && rows.length < total ? (
              <button type="button" className="btn" disabled={busy} onClick={loadMore}>
                Load more transactions ({rows.length} / {total})
              </button>
            ) : null}
            {!rows.length ? <p>No records yet.</p> : null}
          </div>
          {content ? (
            <form onSubmit={save}>
              <label className="field">
                {writable ? 'Record JSON' : 'Record details'}
                <textarea
                  className="control cms-json"
                  aria-label={`${config.title} record JSON`}
                  readOnly={!writable}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                />
              </label>
              {writable ? (
                <div className="pg-actions">
                  <button className="btn primary" type="submit" disabled={busy}>
                    Save {config.type}
                  </button>
                  {selected ? (
                    <button type="button" className="btn" disabled={busy} onClick={remove}>
                      {config.type === 'connections' &&
                      [
                        'Advertiser',
                        'Agency',
                        'DSP',
                        'Ad Exchange',
                        'SSP',
                        'CMS',
                        'Screen',
                      ].includes(String(rows.find((r) => r.id === selected)?.name))
                        ? 'Reset connection'
                        : `Remove ${config.type}`}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </form>
          ) : (
            <p>Select a record{writable ? ' or create a new one' : ''}.</p>
          )}
        </div>
      </details>
    </section>
  )
}
