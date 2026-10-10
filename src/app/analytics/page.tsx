'use client'
import { useEffect, useState } from 'react'
import { AnalyticsPage } from '@/components/media-os/pages/AnalyticsPage'
import type { Campaign } from '@/types/media-os'
export default function AnalyticsIndex() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]),
    [selected, setSelected] = useState(''),
    [error, setError] = useState(''),
    [ready, setReady] = useState(false)
  useEffect(() => {
    const c = new AbortController()
    fetch('/api/campaigns', { signal: c.signal, cache: 'no-store' })
      .then(async (r) => {
        const b = await r.json()
        if (!r.ok) throw Error(b.error)
        setCampaigns(b.data)
        setSelected((b.data.find((v: Campaign) => v.status === 'Live') ?? b.data[0])?.id ?? '')
        setReady(true)
      })
      .catch((e) => {
        if (!c.signal.aborted) {
          setError(e.message)
          setReady(true)
        }
      })
    return () => c.abort()
  }, [])
  return (
    <>
      <section className="page">
        <div className="panel cms-card">
          <label>
            Campaign to measure
            <select
              className="control"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              disabled={!ready || !campaigns.length}
            >
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.status}
                </option>
              ))}
            </select>
          </label>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : !ready ? (
            <p>Loading campaigns…</p>
          ) : !campaigns.length ? (
            <p>No campaigns yet. Create a campaign to start measuring.</p>
          ) : null}
        </div>
      </section>
      {selected ? <AnalyticsPage campaignId={selected} /> : null}
    </>
  )
}
