'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { canManage } from '@/lib/permissions'
import type { MediaPlan } from '@/types/media-os'
import { BriefFields } from '../BriefFields'
import { useAuth } from '../context/AuthContext'
import { useCampaignDraft } from '../context/CampaignDraftContext'
import { useMediaCatalog } from '../context/MediaCatalogContext'
export function PlannerPage() {
  const { user } = useAuth()
  const canPlan = canManage(user?.role, 'planning')
  const { locations } = useMediaCatalog()
  const draft = useCampaignDraft()
  const router = useRouter()
  const [result, setResult] = useState<{ plan: MediaPlan; brief: string } | null>(null)
  const [areas, setAreas] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const busy = useRef(false)
  const brief = JSON.stringify({
    budget: draft.budget,
    objective: draft.objective,
    audience: draft.audience,
    startDate: draft.startDate,
    endDate: draft.endDate,
    areas,
  })
  const plan = result?.brief === brief ? result.plan : null
  async function generate() {
    if (!canPlan) return
    if (busy.current) return
    busy.current = true
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const response = await fetch('/api/media-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: brief,
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'Unable to generate plan.')
      setResult({ plan: data, brief })
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to generate plan.')
    } finally {
      busy.current = false
      setLoading(false)
    }
  }
  function usePlan() {
    if (!plan) return
    draft.applyPlan(plan)
    router.push('/campaigns/new')
  }
  return (
    <section className="page">
      <div className="page-head">
        <div>
          <h1>Media Planner</h1>
          <p>
            Recommend current inventory within your budget using transparent rules. Audience is
            brief context; campaign reach is not forecast.
          </p>
        </div>
        <div className="page-actions">
          <Link className="btn" href="/inventory">
            Browse manually
          </Link>
          <button
            type="button"
            className="btn primary"
            disabled={!plan || loading}
            onClick={usePlan}
          >
            Use this plan
          </button>
        </div>
      </div>
      <div className="ai-layout">
        <div className="panel form-panel">
          <h3>Campaign brief</h3>
          <p>
            Digital is prioritized for launches, transit for awareness, and retail for store
            traffic. Mention commuting or shopping in the audience to adjust priorities.
          </p>
          <BriefFields />
          <fieldset className="area-options">
            <legend>Priority areas (none selected = all areas)</legend>
            {locations.map((location) => (
              <label key={location.name}>
                <input
                  type="checkbox"
                  checked={areas.includes(location.name)}
                  onChange={() =>
                    setAreas((current) =>
                      current.includes(location.name)
                        ? current.filter((area) => area !== location.name)
                        : [...current, location.name],
                    )
                  }
                />
                {location.name}
              </label>
            ))}
          </fieldset>
          {error ? (
            <p role="alert" className="form-error">
              {error}
            </p>
          ) : null}
          <button
            type="button"
            className="btn primary full-btn"
            disabled={!canPlan || loading || !draft.ready}
            onClick={generate}
          >
            {loading ? 'Generating…' : 'Generate Recommendation'}
          </button>
        </div>
        <div className="panel plan-result">
          {plan ? (
            <>
              <div className="result-hero">
                <div>
                  <h2>Recommended placements</h2>
                  <p>
                    {plan.inventoryIds.length} placements · {plan.period} · ฿
                    {plan.totalCost.toLocaleString()} total flight cost
                  </p>
                </div>
                <div className="score" title={`${plan.score}% budget used`}>
                  {plan.score}%
                </div>
              </div>
              <div className="media-mix">
                {plan.allocations.map((row) => (
                  <div className="mix-row" key={row.type}>
                    <div className="mix-label">
                      <strong>{row.type}</strong>
                      <span>{row.areas}</span>
                    </div>
                    <div className="bar">
                      <i style={{ width: `${row.percentage}%` }} />
                    </div>
                    <strong>฿{row.cost.toLocaleString()}</strong>
                    <span>{row.rationale}</span>
                  </div>
                ))}
              </div>
              <div className="reasoning">
                <div className="reason">
                  <strong>Estimate limits</strong>
                  <span>
                    Placement reach is not deduplicated. Campaign reach and frequency are not
                    modeled.
                  </span>
                </div>
                <div className="reason">
                  <strong>Next step</strong>
                  <span>
                    Use this plan to carry the selected placements, dates and budget into your
                    campaign.
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="btn primary full-btn"
                disabled={!canManage(user?.role, 'operations')}
                onClick={usePlan}
              >
                Use this plan
              </button>
            </>
          ) : (
            <div className="state-panel">
              <h2>{result ? 'Brief changed' : 'Ready to plan'}</h2>
              <p>
                {result
                  ? 'Generate a new recommendation for your updated brief.'
                  : 'Enter a brief and generate a plan to see affordable placements and their flight costs.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
