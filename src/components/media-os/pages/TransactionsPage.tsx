'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'

type Transaction = {
  id: string
  dealId: string
  inventoryId: string
  occurredAt: string
  source: string
  impressions: number
  requests: number
  bids: number
  wins: number
  spend: number
  sspFee: number
  cost: number
}
type Result = { data: Transaction[]; total: number; page: number; pageSize: number }
const currency = (n: number) =>
  new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(n)
export function TransactionsPage() {
  const [page, setPage] = useState(1)
  const [source, setSource] = useState('')
  const [dealId, setDealId] = useState('')
  const [deals, setDeals] = useState<{ id: string; name: string }[]>([])
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setResult(null)
    setError('')
    const query = new URLSearchParams({ page: String(page), refresh: String(revision) })
    if (source) query.set('source', source)
    if (dealId) query.set('dealId', dealId)
    Promise.all(
      ['/deals', `/transactions?${query}`].map(async (path) => {
        const r = await fetch(`/api/gateway/programmatic${path}`, {
          signal: controller.signal,
          cache: 'no-store',
        })
        const data = await r.json()
        if (!r.ok) throw new Error(data.error ?? 'Cannot load transactions.')
        return data
      }),
    )
      .then(([dealRows, transactionRows]) => {
        setDeals(dealRows)
        setResult(transactionRows)
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message)
      })
    return () => controller.abort()
  }, [page, source, dealId, revision])
  return (
    <section className="page pg-page">
      <div className="page-head">
        <div>
          <p className="pg-eyebrow">PROGRAMMATIC</p>
          <h1>Transactions</h1>
          <p>
            Recorded ad requests, bids, wins and spend. Mock and imported partner events retain
            their source.
          </p>
        </div>
        <button type="button" className="btn" onClick={() => setRevision((v) => v + 1)}>
          Refresh
        </button>
      </div>

      <div className="panel pg-monitor-toolbar">
        <label>
          Deal
          <select
            className="control"
            value={dealId}
            onChange={(e) => {
              setPage(1)
              setDealId(e.target.value)
            }}
          >
            <option value="">All deals</option>
            {deals.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Source
          <select
            className="control"
            value={source}
            onChange={(e) => {
              setPage(1)
              setSource(e.target.value)
            }}
          >
            <option value="">All sources</option>
            <option value="mock">Mock</option>
            <option value="partner">Imported partner</option>
          </select>
        </label>
        <Link className="btn" href="/monitor">
          Import a transaction →
        </Link>
      </div>
      {error ? (
        <p className="form-error" role="alert">
          {error}
          <button className="btn" type="button" onClick={() => setRevision((v) => v + 1)}>
            Retry
          </button>
        </p>
      ) : result ? (
        <div className="panel pg-table-wrap">
          <h2>{result.total.toLocaleString()} transactions</h2>
          {result.data.length ? (
            <table>
              <thead>
                <tr>
                  <th>Event / Time (UTC)</th>
                  <th>Deal / Inventory</th>
                  <th>Source</th>
                  <th>Impressions</th>
                  <th>Requests / Bids / Wins</th>
                  <th>Spend</th>
                  <th>SSP Fee</th>
                  <th>Media revenue</th>
                </tr>
              </thead>
              <tbody>
                {result.data.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <strong>{t.id}</strong>
                      <small>{t.occurredAt}</small>
                    </td>
                    <td>
                      {deals.find((d) => d.id === t.dealId)?.name ?? t.dealId}
                      <small>{t.inventoryId}</small>
                    </td>
                    <td>
                      <span className="pg-badge">{t.source}</span>
                    </td>
                    <td>{t.impressions.toLocaleString()}</td>
                    <td>
                      {t.requests} / {t.bids} / {t.wins}
                    </td>
                    <td>{currency(t.spend)}</td>
                    <td>{currency(t.sspFee)}</td>
                    <td>{currency(t.spend - t.sspFee)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="pg-empty">
              No recorded transactions match these filters. Create a mock deal or import partner
              events from Delivery Monitor.
            </p>
          )}
          <div className="pg-actions">
            <button
              className="btn"
              type="button"
              disabled={page === 1}
              onClick={() => setPage((v) => v - 1)}
            >
              Previous
            </button>
            <span>
              Page {page} of {Math.max(1, Math.ceil(result.total / result.pageSize))}
            </span>
            <button
              className="btn"
              type="button"
              disabled={page * result.pageSize >= result.total}
              onClick={() => setPage((v) => v + 1)}
            >
              Next
            </button>
          </div>
        </div>
      ) : (
        <p role="status">Loading transactions…</p>
      )}
    </section>
  )
}
