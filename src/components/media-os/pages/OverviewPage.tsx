'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import type { IconName, MapFilter } from '@/types/media-os'
import { CampaignWorkflow } from '../CampaignWorkflow'
import { useMediaCatalog } from '../context/MediaCatalogContext'
import { Icon } from '../Icon'
import { MediaMapShell } from '../MediaMapShell'
import { RecentCampaigns } from '../RecentCampaigns'

export function OverviewPage() {
  const router = useRouter()
  const { settings, locations } = useMediaCatalog()
  const [selectedLocation, setSelectedLocation] = useState('')
  const [filter, setFilter] = useState<MapFilter>('All Media')
  const [focusLocation, setFocusLocation] = useState<string | null>(null)

  useEffect(() => {
    if (locations.length && !locations.some((l) => l.name === selectedLocation)) {
      setSelectedLocation(locations[0].name)
      setFocusLocation(locations[0].name)
    }
  }, [locations, selectedLocation])
  const selectLocation = (name: string) => {
    setSelectedLocation(name)
    setFocusLocation(name)
  }

  return (
    <section className="page">
      <div className="page-head">
        <div>
          <h1>Campaign Command Center</h1>
          <p>
            Plan, launch and measure out-of-home campaigns from one workspace.{' '}
            <span className="demo-note">Concept prototype · demo data</span>
          </p>
        </div>
        <div className="page-actions">
          <Link className="btn ghost" href="/inventory">
            Browse inventory
          </Link>
          <Link className="btn primary" href="/planner">
            Create media plan
          </Link>
        </div>
      </div>

      <div className="overview-grid">
        <div className="panel map-panel">
          <MediaMapShell
            selectedLocation={selectedLocation}
            filter={filter}
            focusLocation={focusLocation}
            onSelectLocation={selectLocation}
            onFilterChange={setFilter}
            onViewInventory={() =>
              router.push(`/inventory?location=${encodeURIComponent(selectedLocation)}`)
            }
          />
        </div>
        <CampaignWorkflow />
      </div>

      <div className="overview-demo-caption">
        Illustrative network metrics below are separate from your campaign draft.
      </div>
      <div className="kpi-row">
        {settings.overview?.kpis.map((k) => (
          <Kpi key={k.label} {...k} />
        ))}
      </div>

      <RecentCampaigns />
    </section>
  )
}

function Kpi({
  icon,
  label,
  value,
  note,
}: {
  icon: IconName
  label: string
  value: string
  note: string
}) {
  return (
    <div className="panel kpi">
      <div className="kpi-icon">
        <Icon name={icon} />
      </div>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        <em>{note}</em>
      </div>
    </div>
  )
}
