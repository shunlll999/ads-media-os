'use client'

import dynamic from 'next/dynamic'
import type { MapFilter } from '@/types/media-os'
import { AreaPreview } from './AreaPreview'
import { useMediaCatalog } from './context/MediaCatalogContext'

const MediaMap = dynamic(() => import('./MediaMap'), {
  ssr: false,
  loading: () => (
    <div className="map-fallback">
      <strong>Loading live map…</strong>
      <span>Map tiles load from OpenStreetMap.</span>
    </div>
  ),
})

interface MediaMapShellProps {
  selectedLocation: string
  filter: MapFilter
  focusLocation?: string | null
  marketplace?: boolean
  onSelectLocation: (name: string) => void
  onFilterChange: (filter: MapFilter) => void
  onViewInventory?: () => void
}

export function MediaMapShell({
  selectedLocation,
  filter,
  focusLocation,
  marketplace = false,
  onSelectLocation,
  onFilterChange,
  onViewInventory,
}: MediaMapShellProps) {
  const { locations, settings } = useMediaCatalog()
  const mapFilters = settings.planning?.mapFilters ?? []
  const selected = locations.find((location) => location.name === selectedLocation) ?? locations[0]
  if (!selected) return <div className="map-fallback">No inventory locations available.</div>
  const count = filter === 'All Media' ? selected.count : (selected.breakdown[filter] ?? 0)
  return (
    <>
      <div className="map-toolbar">
        <span className="filter-btn region-label">
          {marketplace ? 'Media inventory' : 'Inventory locations'}
        </span>
        {mapFilters.map((item) => (
          <button
            type="button"
            key={item}
            className={`filter-btn ${filter === item ? 'active' : ''}`}
            onClick={() => onFilterChange(item)}
          >
            {item}
          </button>
        ))}
      </div>
      <div className={`live-map-shell ${marketplace ? 'marketplace-shell' : 'overview-map-shell'}`}>
        <MediaMap
          locations={locations}
          selectedLocation={selectedLocation}
          filter={filter}
          focusLocation={focusLocation}
          onSelectLocation={onSelectLocation}
        />
        <div className="map-source-note">Inventory placements · area centers</div>
        <div className="legend">
          <h4>Marker = inventory placements</h4>
          <div>
            <i className="dot dot-blue" />
            Area summary
          </div>
          <div>
            <i className="dot dot-cyan" />
            Click to inspect
          </div>
          <div>
            <i className="dot dot-amber" />
            Zoom / pan enabled
          </div>
        </div>
        {!marketplace ? (
          <div className="location-card">
            <AreaPreview key={selected.name} area={selected.name} />
            <div className="location-card-body">
              <strong>{selected.name} Area</strong>
              <small>{selected.types}</small>
              <div className="location-stats">
                <div>
                  <b>{count}</b>
                  <span>{filter === 'All Media' ? 'all' : 'matching'} placements</span>
                </div>
                <div>
                  <b>{selected.reach}</b>
                  <span>campaign reach</span>
                </div>
                <div>
                  <b>{selected.price}</b>
                  <span>from / week</span>
                </div>
              </div>
              <button type="button" className="btn primary" onClick={onViewInventory}>
                View Inventory
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </>
  )
}
