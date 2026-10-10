'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { canManage } from '@/lib/permissions'
import type { Campaign, CampaignStatus } from '@/types/media-os'
import { useAuth } from '../context/AuthContext'

const statuses: CampaignStatus[] = ['Planning', 'Pending Approval', 'Approved', 'Live', 'Completed']
export function CampaignsPage({
  initialFilter = 'All',
  title = 'Campaigns',
}: {
  initialFilter?: CampaignStatus | 'All'
  title?: string
}) {
  const { user } = useAuth()
  const canEdit = canManage(user?.role, 'operations')
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [filter, setFilter] = useState<CampaignStatus | 'All'>(initialFilter)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    fetch(`/api/campaigns?refresh=${retry}`, { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json()
        if (!response.ok) throw new Error(body.error ?? 'Unable to load campaigns.')
        return body.data
      })
      .then(setCampaigns)
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [retry])
  const visible = campaigns.filter((campaign) => filter === 'All' || campaign.status === filter)
  return (
    <section className="page">
      <div className="page-head">
        <div>
          <h1>{title}</h1>
          <p>Saved campaigns and connected playback workflows. Seed campaigns remain examples.</p>
        </div>
        <div className="page-actions">
          <Link className="btn" href="/planner">
            Start with media plan
          </Link>
          {canEdit ? (
            <Link className="btn primary" href="/campaigns/new">
              New campaign
            </Link>
          ) : null}
        </div>
      </div>
      <div className="campaign-status-grid">
        {statuses.map((status) => (
          <div className="panel mini-stat" key={status}>
            <span>{status}</span>
            <strong>
              {loading || error
                ? '—'
                : campaigns.filter((campaign) => campaign.status === status).length}
            </strong>
          </div>
        ))}
      </div>
      <div className="panel campaigns-table">
        <div className="table-head">
          <h3>All campaigns</h3>
          <div className="tabs">
            {(['All', ...statuses] as const).map((status) => (
              <button
                type="button"
                key={status}
                className={filter === status ? 'active' : ''}
                onClick={() => setFilter(status)}
              >
                {status}
              </button>
            ))}
          </div>
        </div>
        {loading ? (
          <div className="state-panel">Loading campaigns…</div>
        ) : error ? (
          <div className="state-panel" role="alert">
            {error}
            <button type="button" className="btn" onClick={() => setRetry((value) => value + 1)}>
              Retry
            </button>
          </div>
        ) : visible.length ? (
          <table>
            <thead>
              <tr>
                <th>Campaign</th>
                <th>Objective</th>
                <th>Period</th>
                <th>Spend</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((campaign) => (
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
                  <td>
                    <Link
                      href={
                        title === 'Reports'
                          ? `/analytics/${campaign.id}`
                          : `/campaigns/${campaign.id}`
                      }
                    >
                      {title === 'Reports' ? 'View report' : 'Open'}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="state-panel">No campaigns in this status.</div>
        )}
      </div>
    </section>
  )
}
