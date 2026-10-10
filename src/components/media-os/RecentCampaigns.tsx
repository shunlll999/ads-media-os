'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import type { Campaign } from '@/types/media-os'
export function RecentCampaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/campaigns', { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json()
        if (!response.ok) throw new Error(body.error ?? 'Unable to load campaigns.')
        return body.data
      })
      .then(setCampaigns)
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message)
      })
    return () => controller.abort()
  }, [])
  const recent = campaigns?.toSorted((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5)
  return (
    <div className="panel campaigns-table">
      <div className="table-head">
        <h3>Recent Campaigns</h3>
        <Link className="btn" href="/campaigns">
          View all campaigns
        </Link>
      </div>
      {error ? (
        <div className="state-panel" role="alert">
          {error}
        </div>
      ) : !recent ? (
        <div className="state-panel">Loading campaigns…</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Campaign</th>
              <th>Objective</th>
              <th>Period</th>
              <th>Spend</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((campaign) => (
              <tr key={campaign.id}>
                <td>
                  <Link href={`/campaigns/${campaign.id}`}>{campaign.name}</Link>
                </td>
                <td>{campaign.objective}</td>
                <td>{campaign.period}</td>
                <td>฿{campaign.spend.toLocaleString()}</td>
                <td>
                  <span className="status">{campaign.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
