'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import type { CampaignAnalytics } from '@/types/media-os'

export function AnalyticsPage({ campaignId }: { campaignId: string }) {
  const [data, setData] = useState<CampaignAnalytics | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    setData(null)
    setError('')
    fetch(`/api/campaigns/${campaignId}/analytics`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json()
        if (!response.ok) throw new Error(body.error ?? 'Unable to load analytics.')
        return body
      })
      .then(setData)
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message)
      })
    return () => controller.abort()
  }, [campaignId])
  if (error)
    return (
      <section className="page">
        <div className="panel state-panel" role="alert">
          <h2>Analytics unavailable</h2>
          <p>{error}</p>
          <Link className="btn" href={`/campaigns/${campaignId}`}>
            Campaign detail
          </Link>
        </div>
      </section>
    )
  if (!data)
    return (
      <section className="page">
        <div className="panel state-panel">Loading analytics…</div>
      </section>
    )
  const measured = data.measurementSource === 'player'
  return (
    <section className="page">
      <div className="page-head">
        <div>
          <h1>Campaign Analytics</h1>
          <p>
            Measure delivery first, then connect exposure to engagement and business outcomes.{' '}
            <span className="demo-note">
              {measured ? 'Connected player telemetry' : 'Illustrative analytics'} for {campaignId}.
            </span>
          </p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn" onClick={() => window.print()}>
            Export / Print report
          </button>
          <Link className="btn primary" href={`/campaigns/${campaignId}`}>
            Campaign detail
          </Link>
        </div>
      </div>
      <div className="analytics-kpis">
        <Kpi label="Reach" value={data.reach} note="Delivered audience" />
        <Kpi label="Frequency" value={data.frequency} note="Target 3–7x" />
        <Kpi
          label={measured ? 'Playback completion' : 'Proof of Play'}
          value={data.proofOfPlay}
          note={`${data.deliveredPlays.toLocaleString()} / ${data.scheduledPlays.toLocaleString()} ${measured ? 'started sessions' : 'plays'}`}
        />
        <Kpi label="Store Visits" value={data.storeVisits} note="Attributed demo signal" />
        <Kpi label="ROAS" value={data.roas} note="Illustrative only" />
      </div>
      <div className="analytics-grid">
        <div className="panel chart">
          <h3>{measured ? 'Playback telemetry' : 'Reach & Exposure Trend'}</h3>
          <p>
            {measured
              ? 'Completed browser sessions. Preview plays do not count as live delivery.'
              : 'Daily cumulative reach across the campaign flight.'}
          </p>
          {measured ? (
            <div className="telemetry-summary">
              <strong>{data.deliveredPlays}</strong>
              <span>completed live plays</span>
              <p>
                {data.previewPlays ?? 0} completed preview plays · {data.totalStarts ?? 0} live
                starts
              </p>
              <small>
                Reach, visits and ROAS require external measurement data. Browser telemetry is not
                independently verified audience measurement.
              </small>
            </div>
          ) : (
            <div className="chart-area">
              <svg className="line-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
                <title>Illustrative cumulative campaign reach</title>
                <defs>
                  <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#168aff" stopOpacity=".34" />
                    <stop offset="100%" stopColor="#168aff" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <polyline
                  points={(data.trend ?? [])
                    .map((n, i, a) => `${a.length > 1 ? (i * 100) / (a.length - 1) : 0},${100 - n}`)
                    .join(' ')}
                  fill="none"
                  stroke="#29a2ff"
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            </div>
          )}
        </div>
        <div className="panel pop-list">
          <div className="panel-title pop-list-title">
            <div>
              <h3>Top Locations</h3>
              <span>By delivered impressions</span>
            </div>
          </div>
          {data.topLocations.map((item) => (
            <div className="pop-row" key={item.area}>
              <div>
                <strong>{item.area}</strong>
                <span>{item.proofOfPlay} proof-of-play</span>
              </div>
              <b>{item.impressions}</b>
            </div>
          ))}
        </div>
      </div>
      <div className="panel funnel">
        <h3>Exposure → Business Outcome</h3>
        <div className="funnel-grid">
          <Funnel
            value={data.deliveredImpressions ?? 'Not measured'}
            label="Delivered impressions"
          />
          <Funnel value={data.reach} label="Unique reach" />
          <Funnel value={data.engagements} label="QR / web engagements" />
          <Funnel value={data.storeVisits} label="Store visits" />
          <Funnel value={data.roas} label="Illustrative ROAS" />
        </div>
      </div>
    </section>
  )
}
function Kpi({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="panel kpi">
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        <em>{note}</em>
      </div>
    </div>
  )
}
function Funnel({ value, label }: { value: string; label: string }) {
  return (
    <div className="funnel-step">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  )
}
