'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { api } from '@/lib/client-api'
import { canManage } from '@/lib/permissions'
import type { Campaign } from '@/types/media-os'
import { useAuth } from '../context/AuthContext'
import { useMediaCatalog } from '../context/MediaCatalogContext'

export function CampaignDetailPage({ campaignId }: { campaignId: string }) {
  const { user } = useAuth()
  const canEdit = canManage(user?.role, 'operations')
  const { projects, gateway } = useMediaCatalog()
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [loading, setLoading] = useState(true)

  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [busy, setBusy] = useState(false)
  async function changeStatus(status: string) {
    setBusy(true)
    setActionError('')
    try {
      setCampaign(await api<Campaign>(`/api/gateway/campaigns/${campaignId}/status`, { status }))
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Unable to update status.')
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    setCampaign(null)
    fetch(`/api/campaigns/${campaignId}`, { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        if (response.status === 404) return null
        const body = await response.json()
        if (!response.ok) throw new Error(body.error ?? 'Unable to load campaign.')
        return body
      })
      .then(setCampaign)
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [campaignId])
  if (error)
    return (
      <section className="page">
        <div className="panel state-panel" role="alert">
          {error}
          <Link className="btn" href="/campaigns">
            Back to campaigns
          </Link>
        </div>
      </section>
    )

  if (loading)
    return (
      <section className="page">
        <div className="panel state-panel">Loading campaign…</div>
      </section>
    )
  if (!campaign)
    return (
      <section className="page">
        <div className="panel state-panel">
          <h2>Campaign not found</h2>
          <Link className="btn" href="/campaigns">
            Back to campaigns
          </Link>
        </div>
      </section>
    )

  const canMeasure = campaign.status === 'Live' || campaign.status === 'Completed'
  const sourceProject = campaign.sourceProjectId
    ? projects.find((project) => project.id === campaign.sourceProjectId)
    : undefined
  return (
    <section className="page">
      <div className="page-head">
        <div>
          <h1>{campaign.name}</h1>
          <p>
            Campaign ID: {campaign.id} ·{' '}
            <span className="demo-note">
              {gateway ? 'PostgreSQL campaign' : 'Demo workflow data'}
            </span>
          </p>
        </div>
        <div className="page-actions">
          {gateway && campaign.status === 'Pending Approval' ? (
            <button
              className="btn primary"
              type="button"
              disabled={!canEdit || busy}
              onClick={() => changeStatus('Approved')}
            >
              Approve campaign
            </button>
          ) : null}
          {gateway && campaign.status === 'Approved' ? (
            <button
              className="btn primary"
              type="button"
              disabled={!canEdit || busy}
              onClick={() => changeStatus('Live')}
            >
              Launch campaign
            </button>
          ) : null}
          {gateway && campaign.status === 'Live' ? (
            <>
              <Link href="/screens" className="btn primary">
                Deploy to screens
              </Link>
              <button
                type="button"
                className="btn"
                disabled={!canEdit || busy}
                onClick={() => changeStatus('Completed')}
              >
                Complete campaign
              </button>
            </>
          ) : null}
          <Link className="btn" href="/campaigns">
            All campaigns
          </Link>
          {canMeasure ? (
            <Link className="btn primary" href={`/analytics/${campaign.id}`}>
              Open analytics
            </Link>
          ) : null}
        </div>
      </div>
      {actionError ? (
        <p role="alert" className="form-error">
          {actionError}
        </p>
      ) : null}
      <div className="detail-grid">
        <div className="panel detail-main">
          <div className="detail-hero">
            <div>
              <span className="detail-eyebrow">Campaign lifecycle</span>
              <h2>{campaign.status}</h2>
              <p>
                {campaign.status === 'Pending Approval'
                  ? gateway
                    ? 'Saved in PostgreSQL. Review the creative and selected placements, then approve and launch for connected players. No external media booking is made.'
                    : 'Saved for review. Approval and launch are simulated in this prototype; no media has been booked.'
                  : gateway
                    ? 'This campaign can be deployed to paired players. Live playback follows its flight dates; preview playback is counted separately.'
                    : 'This demo campaign shows how status, delivery and measurement connect across the product.'}
              </p>
            </div>
            <span
              className={`status detail-status ${campaign.status === 'Planning' ? 'amber' : campaign.status === 'Completed' ? 'blue' : ''}`}
            >
              {campaign.status}
            </span>
          </div>
          <div className="lifecycle">
            <Life label="Plan" done />
            <Life label="Select" done />
            <Life label="Build" done />
            <Life
              label="Approval"
              done={canMeasure || campaign.status === 'Approved'}
              active={campaign.status === 'Pending Approval'}
            />
            <Life label="Launch" done={canMeasure} active={campaign.status === 'Live'} />
            <Life
              label="Measure"
              done={campaign.status === 'Completed'}
              active={campaign.status === 'Completed'}
            />
          </div>
        </div>
        <div className="panel detail-side">
          <h3>Campaign summary</h3>
          {sourceProject ? (
            <div className="project-source-brief">
              <strong>{sourceProject.name}</strong>
              <p>Real project · Proposed campaign</p>
              <a href={sourceProject.url} target="_blank" rel="noreferrer">
                View project ↗
              </a>
            </div>
          ) : null}
          <Summary label="Objective" value={campaign.objective} />
          <Summary label="Period" value={campaign.period} />
          <Summary label="Spend" value={`฿${campaign.spend.toLocaleString()}`} />
          <Summary label="Reach" value={campaign.reach} />
          <Summary label="Frequency" value={campaign.frequency} />
          <Summary label="Inventory" value={`${campaign.inventoryIds.length} selected units`} />
          <Summary label="Creative" value={campaign.creativeName ?? 'Not uploaded'} />
        </div>
      </div>
    </section>
  )
}
function Life({
  label,
  done = false,
  active = false,
}: {
  label: string
  done?: boolean
  active?: boolean
}) {
  return (
    <div className={`life-step ${done ? 'done' : ''} ${active ? 'active' : ''}`}>
      <i>{done ? '✓' : '•'}</i>
      <span>{label}</span>
    </div>
  )
}
function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="summary-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}
