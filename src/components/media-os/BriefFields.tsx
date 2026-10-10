'use client'
import { canManage } from '@/lib/permissions'
import { useAuth } from './context/AuthContext'
import { useCampaignDraft } from './context/CampaignDraftContext'
import { useMediaCatalog } from './context/MediaCatalogContext'
import { ProjectSource } from './ProjectSource'
export function BriefFields() {
  const { user } = useAuth()
  const canPlan = canManage(user?.role, 'planning')
  const draft = useCampaignDraft()
  const { settings } = useMediaCatalog()
  return (
    <>
      <ProjectSource />
      <div className="field">
        <label htmlFor="brief-objective">Objective</label>
        <select
          id="brief-objective"
          disabled={!canPlan || !draft.ready}
          className="control"
          value={draft.objective}
          onChange={(event) => draft.setObjective(event.target.value)}
        >
          {settings.planning?.objectives.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="brief-audience">Target audience</label>
        <input
          id="brief-audience"
          disabled={!canPlan || !draft.ready}
          className="control"
          value={draft.audience}
          onChange={(event) => draft.setAudience(event.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="brief-budget">Total budget (THB)</label>
        <input
          id="brief-budget"
          type="text"
          inputMode="numeric"
          min="1"
          step="1000"
          disabled={!canPlan || !draft.ready}
          className="control"
          value={draft.budget || ''}
          onChange={(event) => {
            const value = Number(event.target.value)
            if (Number.isFinite(value)) draft.setBudget(value)
          }}
        />
      </div>
      <div className="date-fields">
        <div className="field">
          <label htmlFor="brief-start">Start date</label>
          <input
            id="brief-start"
            disabled={!canPlan || !draft.ready}
            className="control"
            type="date"
            value={draft.startDate}
            onChange={(event) => draft.setStartDate(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="brief-end">End date</label>
          <input
            id="brief-end"
            disabled={!canPlan || !draft.ready}
            className="control"
            type="date"
            value={draft.endDate}
            onChange={(event) => draft.setEndDate(event.target.value)}
          />
        </div>
      </div>
      <p className="demo-note">
        Availability follows each placement’s dates from the CMS. Prices are prorated by day from
        weekly rates.
      </p>
      {draft.storageWarning ? (
        <p role="status" className="form-error">
          {draft.storageWarning}
        </p>
      ) : null}
    </>
  )
}
