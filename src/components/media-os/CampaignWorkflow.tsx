'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { api } from '@/lib/client-api'
import { canManage } from '@/lib/permissions'
import { flightCost, isAvailable } from '@/lib/planning'
import type { Campaign, CampaignAnalytics, MediaPlan } from '@/types/media-os'
import { BriefFields } from './BriefFields'
import { useAuth } from './context/AuthContext'
import { useCampaignDraft } from './context/CampaignDraftContext'
import { useMediaCatalog } from './context/MediaCatalogContext'

const steps = ['Plan', 'Select', 'Build', 'Launch', 'Measure'] as const
type Step = (typeof steps)[number]
export function CampaignWorkflow() {
  const { user } = useAuth()
  const canPlan = canManage(user?.role, 'planning')
  const canOperate = canManage(user?.role, 'operations')
  const draft = useCampaignDraft()
  const { inventory, gateway } = useMediaCatalog()
  const [step, setStep] = useState<Step>('Plan')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [campaignId, setCampaignId] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [analytics, setAnalytics] = useState<CampaignAnalytics | null>(null)
  const [metricsError, setMetricsError] = useState('')
  const [metricsLoading, setMetricsLoading] = useState(false)
  const selected = inventory.filter((item) => draft.selectedInventory.has(item.id))
  const total = flightCost(selected, draft.startDate, draft.endDate)
  const validSelection =
    selected.length > 0 &&
    total <= draft.budget &&
    selected.every((item) => isAvailable(item, draft.startDate, draft.endDate))
  const campaign = campaigns.find((item) => item.id === campaignId)
  const measurable = campaign?.status === 'Live' || campaign?.status === 'Completed'

  // biome-ignore lint/correctness/useExhaustiveDependencies: refresh intentionally reloads saved campaigns.
  useEffect(() => {
    if (step !== 'Launch' && step !== 'Measure') return
    const controller = new AbortController()
    setLoading(true)
    setLoadError('')
    fetch('/api/campaigns', { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json()
        if (!response.ok) throw new Error(body.error ?? 'Unable to load campaigns.')
        return body.data as Campaign[]
      })
      .then((rows) => {
        if (controller.signal.aborted) return
        setCampaigns(rows)
        setCampaignId((current) =>
          rows.some((item) => item.id === current)
            ? current
            : (rows.find((item) =>
                step === 'Measure'
                  ? ['Live', 'Completed'].includes(item.status)
                  : ['Pending Approval', 'Approved', 'Live'].includes(item.status),
              )?.id ??
              rows[0]?.id ??
              ''),
        )
      })
      .catch((e) => {
        if (!controller.signal.aborted) setLoadError(e.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [step, refresh])

  useEffect(() => {
    setAnalytics(null)
    setMetricsLoading(false)
    setMetricsError('')
    if (step !== 'Measure' || !campaignId || !measurable || loading) return
    const controller = new AbortController()
    setMetricsLoading(true)
    fetch(`/api/campaigns/${campaignId}/analytics`, {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(async (response) => {
        const body = await response.json()
        if (!response.ok) throw new Error(body.error ?? 'Unable to load measurement.')
        return body as CampaignAnalytics
      })
      .then((data) => {
        if (!controller.signal.aborted) setAnalytics(data)
      })
      .catch((e) => {
        if (!controller.signal.aborted) setMetricsError(e.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setMetricsLoading(false)
      })
    return () => controller.abort()
  }, [step, campaignId, measurable, loading])

  async function generate() {
    if (!canPlan) return
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const plan = await api<MediaPlan>('/api/media-plan', {
        budget: draft.budget,
        objective: draft.objective,
        audience: draft.audience,
        startDate: draft.startDate,
        endDate: draft.endDate,
      })
      draft.applyPlan(plan)
      setStep('Select')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to generate a plan.')
    } finally {
      setBusy(false)
    }
  }
  async function changeStatus(status: 'Approved' | 'Live') {
    if (!canOperate) return
    if (!campaign || busy) return
    setBusy(true)
    setError('')
    try {
      const updated = await api<Campaign>(`/api/gateway/campaigns/${campaign.id}/status`, {
        status,
      })
      setCampaigns((current) => current.map((item) => (item.id === updated.id ? updated : item)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to update campaign.')
    } finally {
      setBusy(false)
    }
  }
  function activate(next: Step) {
    setError('')
    setStep(next)
  }
  return (
    <div className="panel planner campaign-workflow">
      <div className="steps" role="tablist" aria-label="Campaign workflow">
        {steps.map((label, index) => (
          <button
            key={label}
            type="button"
            id={`workflow-tab-${label}`}
            role="tab"
            aria-selected={step === label}
            aria-controls="workflow-panel"
            tabIndex={step === label ? 0 : -1}
            disabled={busy}
            className={`step ${step === label ? 'active' : ''}`}
            onClick={() => activate(label)}
            onKeyDown={(event) => {
              const next =
                event.key === 'ArrowRight'
                  ? (index + 1) % steps.length
                  : event.key === 'ArrowLeft'
                    ? (index + steps.length - 1) % steps.length
                    : event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? steps.length - 1
                        : null
              if (next === null) return
              event.preventDefault()
              activate(steps[next])
              event.currentTarget.parentElement
                ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
                [next]?.focus()
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div id="workflow-panel" role="tabpanel" aria-labelledby={`workflow-tab-${step}`}>
        {step === 'Plan' ? (
          <>
            <h2>Plan Your Campaign</h2>
            <p>
              Generate a recommended media mix across available inventory using business objective,
              audience and budget.
            </p>
            <fieldset
              className="workflow-brief"
              aria-label="Campaign brief"
              disabled={!canPlan || busy || !draft.ready}
            >
              <BriefFields />
            </fieldset>
            <button
              type="button"
              className="btn primary full-btn"
              disabled={!canPlan || busy || !draft.ready}
              onClick={generate}
            >
              {busy ? 'Generating…' : 'Generate Media Plan →'}
            </button>
          </>
        ) : null}
        {step === 'Select' ? (
          <>
            <h2>Select Your Media</h2>
            <p>
              Review the recommendation or select placements manually for {draft.startDate} –{' '}
              {draft.endDate}.
            </p>
            <fieldset className="workflow-choices" disabled={!canPlan || !draft.ready}>
              <legend>Available placements</legend>
              {inventory.map((item) => {
                const available = isAvailable(item, draft.startDate, draft.endDate)
                return (
                  <label key={item.id} className="workflow-choice">
                    <input
                      type="checkbox"
                      checked={draft.selectedInventory.has(item.id)}
                      disabled={!available && !draft.selectedInventory.has(item.id)}
                      onChange={() => draft.toggleInventory(item.id)}
                    />
                    <span>
                      <strong>{item.name}</strong>
                      <small>
                        {item.area} · ฿
                        {flightCost([item], draft.startDate, draft.endDate).toLocaleString()} /
                        flight{available ? '' : ' · Unavailable'}
                      </small>
                    </span>
                  </label>
                )
              })}
            </fieldset>
            <p>
              {selected.length} selected · ฿{total.toLocaleString()} / ฿
              {draft.budget.toLocaleString()} budget
            </p>
            {!validSelection ? (
              <p className="demo-note">
                Select available placements within your budget to continue. Update dates and budget
                in Plan.
              </p>
            ) : null}
            <button
              type="button"
              className="btn primary full-btn"
              disabled={!validSelection || !draft.ready}
              onClick={() => activate('Build')}
            >
              Continue to Build →
            </button>
            <Link className="btn full-btn" href="/inventory">
              Browse inventory details
            </Link>
          </>
        ) : null}
        {step === 'Build' ? (
          <>
            <h2>Build Your Campaign</h2>
            <p>
              Add a name and creative, preview the content, then submit for approval in Campaign
              Builder.
            </p>
            <div className="summary-row">
              <span>Placements</span>
              <strong>{selected.length}</strong>
            </div>
            <div className="summary-row">
              <span>Flight cost</span>
              <strong>฿{total.toLocaleString()}</strong>
            </div>
            <div className="summary-row">
              <span>Objective</span>
              <strong>{draft.objective}</strong>
            </div>
            {canOperate && validSelection && draft.ready ? (
              <Link className="btn primary full-btn" href="/campaigns/new">
                Open Campaign Builder →
              </Link>
            ) : (
              <>
                <p>Select available media within budget first.</p>
                <button
                  type="button"
                  className="btn primary full-btn"
                  onClick={() => activate('Select')}
                >
                  Select media
                </button>
              </>
            )}
            <p className="demo-note">
              Your selected media and brief carry into Builder. After submitting, choose the saved
              campaign in Launch.
            </p>
          </>
        ) : null}
        {step === 'Launch' || step === 'Measure' ? (
          <>
            <h2>{step === 'Launch' ? 'Launch Your Campaign' : 'Measure Your Campaign'}</h2>
            <p>
              {step === 'Launch'
                ? 'Choose a saved campaign, approve its content and launch it before deploying to screens.'
                : 'View actual browser playback for a launched campaign. Preview plays are counted separately.'}
            </p>
            {loading ? (
              <p role="status">Loading campaigns…</p>
            ) : loadError ? (
              <p role="alert" className="form-error">
                {loadError}
              </p>
            ) : campaigns.length ? (
              <div className="field">
                <label htmlFor="workflow-campaign">Saved campaign</label>
                <select
                  id="workflow-campaign"
                  className="control"
                  value={campaignId}
                  disabled={busy}
                  onChange={(event) => {
                    setError('')
                    setCampaignId(event.target.value)
                  }}
                >
                  {campaigns.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} · {item.status}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <p>No saved campaigns yet. Build and submit a campaign first.</p>
            )}
            <button
              type="button"
              className="btn full-btn"
              disabled={loading || busy}
              onClick={() => setRefresh((current) => current + 1)}
            >
              Refresh campaigns
            </button>
            {!loading && !loadError && campaign ? (
              <>
                <div className="summary-row">
                  <span>Status</span>
                  <strong>{campaign.status}</strong>
                </div>
                <Link className="btn full-btn" href={`/campaigns/${campaign.id}`}>
                  Review campaign details
                </Link>
                {step === 'Launch' ? (
                  !gateway ? (
                    <p>Connect the gateway to approve and launch campaigns.</p>
                  ) : campaign.status === 'Pending Approval' ? (
                    <button
                      type="button"
                      className="btn primary full-btn"
                      disabled={!canOperate || busy}
                      onClick={() => changeStatus('Approved')}
                    >
                      {busy ? 'Approving…' : 'Approve campaign'}
                    </button>
                  ) : campaign.status === 'Approved' ? (
                    <button
                      type="button"
                      className="btn primary full-btn"
                      disabled={!canOperate || busy}
                      onClick={() => changeStatus('Live')}
                    >
                      {busy ? 'Launching…' : 'Launch campaign'}
                    </button>
                  ) : campaign.status === 'Live' ? (
                    <>
                      <Link className="btn primary full-btn" href="/screens">
                        Deploy to screens →
                      </Link>
                      <button
                        type="button"
                        className="btn full-btn"
                        onClick={() => activate('Measure')}
                      >
                        Continue to Measure →
                      </button>
                      <p className="demo-note">
                        Live players follow campaign dates. Launch alone does not assign content to
                        screens.
                      </p>
                    </>
                  ) : (
                    <p>
                      {campaign.status === 'Completed'
                        ? 'This campaign is complete. Open Measure to review delivery.'
                        : 'Complete and submit the campaign before approval.'}
                    </p>
                  )
                ) : !measurable ? (
                  <p>Launch this campaign before measuring delivery.</p>
                ) : (
                  <>
                    {metricsLoading ? <p role="status">Loading measurement…</p> : null}
                    {metricsError ? (
                      <p role="alert" className="form-error">
                        {metricsError}
                      </p>
                    ) : null}
                    {analytics ? (
                      <>
                        <div className="summary-row">
                          <span>Completed live plays</span>
                          <strong>{analytics.deliveredPlays}</strong>
                        </div>
                        <div className="summary-row">
                          <span>Started live plays</span>
                          <strong>{analytics.totalStarts ?? analytics.scheduledPlays}</strong>
                        </div>
                        <div className="summary-row">
                          <span>Preview plays</span>
                          <strong>{analytics.previewPlays ?? 0}</strong>
                        </div>
                        <p className="demo-note">
                          Reach, visits and ROAS require connected measurement data.
                        </p>
                      </>
                    ) : null}
                    <Link className="btn primary full-btn" href={`/analytics/${campaign.id}`}>
                      Open campaign analytics →
                    </Link>
                  </>
                )}
              </>
            ) : null}
          </>
        ) : null}
        {error ? (
          <p role="alert" className="form-error">
            {error}
          </p>
        ) : null}
        {draft.storageWarning ? (
          <p role="status" className="demo-note">
            {draft.storageWarning}
          </p>
        ) : null}
      </div>
    </div>
  )
}
