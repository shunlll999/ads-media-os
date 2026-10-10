'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/client-api'
import { canManage } from '@/lib/permissions'
import { flightCost, flightDays, isAvailable, periodLabel } from '@/lib/planning'
import type { Creative, MediaPlan } from '@/types/media-os'
import { BriefFields } from '../BriefFields'
import { CreativeRenderer } from '../CreativeRenderer'
import { useAuth } from '../context/AuthContext'
import { useCampaignDraft } from '../context/CampaignDraftContext'
import { useMediaCatalog } from '../context/MediaCatalogContext'
import { ProjectSource } from '../ProjectSource'
export function BuilderPage() {
  const { user } = useAuth()
  const canEdit = canManage(user?.role, 'operations')
  const { inventory, projects, settings } = useMediaCatalog()
  const draft = useCampaignDraft()
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [creatives, setCreatives] = useState<Creative[]>([])
  useEffect(() => {
    api<{ data: Creative[] }>('/api/creatives')
      .then((data) => setCreatives(data.data))
      .catch((e) => setError(e.message))
  }, [])
  const selectedCreative = creatives.find((c) => c.id === draft.creativeId)
  const busy = useRef(false)
  const validation = useRef<HTMLDivElement>(null)
  const [attempted, setAttempted] = useState(false)
  const items = inventory.filter((item) => draft.selectedInventory.has(item.id))
  const total = flightCost(items, draft.startDate, draft.endDate)
  const issues = [
    !draft.name.trim() && 'Enter a campaign name.',
    !items.length && 'Select at least one placement.',
    !flightDays(draft.startDate, draft.endDate) && 'Choose valid flight dates.',
    items.some((item) => !isAvailable(item, draft.startDate, draft.endDate)) &&
      'Selected media is unavailable for these flight dates.',
    (!Number.isFinite(draft.budget) || draft.budget <= 0) && 'Enter a positive budget.',
    total > draft.budget && 'Planned spend exceeds your budget.',
    !selectedCreative && 'Choose a creative from the library before submitting.',
  ].filter(Boolean)
  async function submit() {
    if (!canEdit) return
    if (busy.current || !draft.ready) return
    setAttempted(true)
    if (issues.length) {
      requestAnimationFrame(() => validation.current?.focus())
      return
    }
    busy.current = true
    setSubmitting(true)
    setError('')
    try {
      const response = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: draft.name,
          objective: draft.objective,
          startDate: draft.startDate,
          endDate: draft.endDate,
          budget: draft.budget,
          inventoryIds: [...draft.selectedInventory],
          creativeName: draft.creativeName,
          ...(selectedCreative ? { creativeId: selectedCreative.id } : {}),
          ...(draft.sourceProjectId ? { sourceProjectId: draft.sourceProjectId } : {}),
        }),
      })
      const campaign = await response.json()
      if (!response.ok) throw new Error(campaign.error ?? 'Unable to save campaign.')
      setAttempted(false)
      draft.resetDraft()
      router.push(`/campaigns/${campaign.id}`)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to save campaign.')
    } finally {
      busy.current = false
      setSubmitting(false)
    }
  }
  async function loadDemo() {
    setError('')
    try {
      if (!settings.planning) throw Error('Planning settings are unavailable.')
      const plan = await api<MediaPlan>('/api/media-plan', settings.planning)
      draft.resetDraft()
      draft.applyPlan(plan)
      draft.setName(settings.planning.demoCampaignName)
      const creative = creatives.find((c) => c.id === settings.planning?.demoCreativeId)
      if (creative) draft.setCreative(creative.id, creative.name)
      setAttempted(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Demo plan unavailable.')
    }
  }
  return (
    <section className="page">
      <div className="page-head">
        <div>
          <h1>Campaign Builder</h1>
          <p>
            Convert the selected media plan into a campaign with creative review and approval
            workflow.
          </p>
        </div>
        <div className="page-actions">
          <Link className="btn" href="/inventory">
            Edit media
          </Link>
          <button
            type="button"
            className="btn success"
            onClick={submit}
            disabled={!canEdit || submitting || !draft.ready}
          >
            {submitting ? 'Submitting…' : 'Submit for approval'}
          </button>
        </div>
      </div>
      <div className="builder-layout">
        <div className="panel builder-steps">
          <Step
            status={items.length ? 'done' : ''}
            num={items.length ? '✓' : '1'}
            title="1. Media plan"
            sub={`${items.length} selected placements`}
          />
          <Step
            status={draft.creativeName ? 'done' : 'active'}
            num="2"
            title="2. Creative"
            sub="Load & review"
          />
          <Step num="3" title="3. Schedule" sub="Flight dates & rotations" />
          <Step num="4" title="4. Approval" sub="Brand & media checks" />
          <Step num="5" title="5. Launch" sub="Activate campaign" />
        </div>
        <div className="panel builder-main">
          <h2>Creative Validation</h2>
          <ProjectSource />
          <p>
            Review campaign artwork against the selected media specifications. This prototype uses a
            creative library with actual content previews.
          </p>
          <div className={`upload-zone ${draft.creativeName ? 'loaded' : ''}`}>
            <div>
              <strong>{selectedCreative ? 'Creative selected' : 'Choose campaign content'}</strong>
              <span>Image, video, website or real project card</span>
              <select
                className="control"
                aria-label="Campaign creative"
                value={selectedCreative?.id ?? ''}
                onChange={(event) => {
                  const c = creatives.find((c) => c.id === event.target.value)
                  draft.setCreative(c?.id ?? '', c?.name ?? '')
                }}
              >
                <option value="">Choose from library</option>
                {creatives.map((c) => (
                  <option value={c.id} key={c.id}>
                    {c.name} · {c.kind}
                  </option>
                ))}
              </select>
              <Link className="btn" href="/creatives">
                Upload / manage creatives
              </Link>
              <br />
              <button
                type="button"
                className="btn upload-demo-btn"
                disabled={submitting}
                onClick={() =>
                  draft.setCreative(
                    selectedCreative ? '' : (settings.planning?.demoCreativeId ?? ''),
                    selectedCreative
                      ? ''
                      : (creatives.find((c) => c.id === settings.planning?.demoCreativeId)?.name ??
                          ''),
                  )
                }
              >
                {selectedCreative ? 'Clear creative' : 'Use demo creative'}
              </button>
            </div>
          </div>
          <div className="creative-preview">
            <div className={`creative-frame ${selectedCreative ? 'has-content' : ''}`}>
              {selectedCreative ? (
                <CreativeRenderer
                  creative={{
                    ...selectedCreative,
                    project: projects.find((p) => p.id === selectedCreative.projectId),
                  }}
                />
              ) : null}
            </div>
            <div>
              <strong className="creative-name">
                {draft.creativeName || 'No file uploaded yet'}
              </strong>
              <div className="checklist">
                <div className={draft.creativeName ? 'check' : ''}>
                  {draft.creativeName ? '✓ Content selected' : '○ Creative not selected'}
                </div>
                <div>Placement compliance still requires review</div>
              </div>
            </div>
          </div>
          <details className="builder-settings">
            <summary>Edit campaign brief & schedule</summary>
            <BriefFields />
          </details>
          <details className="builder-settings">
            <summary>Review selected media ({items.length})</summary>
            {items.length ? (
              <ul className="selected-media-list">
                {items.map((item) => (
                  <li key={item.id}>
                    <span>
                      {item.name}
                      <small>฿{item.price.toLocaleString()} / week</small>
                    </span>
                    <strong>
                      ฿{flightCost([item], draft.startDate, draft.endDate).toLocaleString()}
                    </strong>
                    <button
                      type="button"
                      className="btn"
                      disabled={submitting}
                      onClick={() => draft.toggleInventory(item.id)}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p>
                No media selected.{' '}
                <Link className="btn" href="/inventory">
                  Select media
                </Link>
              </p>
            )}
          </details>
          <div className="demo-setup">
            <span>Want to try the complete flow?</span>
            <button
              type="button"
              className="btn"
              disabled={!canEdit || submitting || !draft.ready}
              onClick={loadDemo}
            >
              Load demo campaign
            </button>
            <small>
              Replaces this draft with an affordable media plan, name, dates and creative library
              with actual content previews.
            </small>
          </div>
        </div>
        <div className="panel builder-summary">
          <h3>Campaign summary</h3>
          <div className="field">
            <label htmlFor="campaign-name">Campaign name</label>
            <input
              id="campaign-name"
              className="control"
              maxLength={120}
              placeholder="Name your campaign"
              value={draft.name}
              onChange={(event) => draft.setName(event.target.value)}
            />
          </div>
          <Summary label="Objective" value={draft.objective} />
          <Summary label="Period" value={periodLabel(draft.startDate, draft.endDate)} />
          <Summary label="Selected inventory" value={`${items.length} placements`} />
          <Summary label="Budget" value={`฿${draft.budget.toLocaleString()}`} />
          <Summary label="Remaining budget" value={`฿${(draft.budget - total).toLocaleString()}`} />
          <div className="total">
            <small>Planned spend · full flight cost</small>
            <strong>฿{total.toLocaleString()}</strong>
          </div>
          {attempted && issues.length ? (
            <div ref={validation} tabIndex={-1} role="alert" className="submit-validation">
              <strong>Complete these steps to submit:</strong>
              <ul className="validation-list">
                {issues.map((issue) => (
                  <li key={String(issue)}>{issue}</li>
                ))}
              </ul>
              <Link className="btn" href="/inventory">
                Edit media selection
              </Link>
            </div>
          ) : null}
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="button"
            className="btn success full-btn"
            disabled={!canEdit || submitting || !draft.ready}
            onClick={submit}
          >
            {submitting ? 'Submitting…' : 'Submit for approval'}
          </button>
          <Link className="btn full-btn" href="/analytics">
            Preview measurement
          </Link>
        </div>
      </div>
    </section>
  )
}
function Step({
  status = '',
  num,
  title,
  sub,
}: {
  status?: string
  num: string
  title: string
  sub: string
}) {
  return (
    <div className={`builder-step ${status}`}>
      <div className="step-num">{num}</div>
      <div>
        <strong>{title}</strong>
        <br />
        <span>{sub}</span>
      </div>
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
