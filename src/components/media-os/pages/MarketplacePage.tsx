'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { flightCost, matchesType, periodLabel } from '@/lib/planning'
import type { MapFilter } from '@/types/media-os'
import { useCampaignDraft } from '../context/CampaignDraftContext'
import { useMediaCatalog } from '../context/MediaCatalogContext'
import { MediaMapShell } from '../MediaMapShell'

export function MarketplacePage() {
  const { inventory, locations } = useMediaCatalog()
  const searchParams = useSearchParams()
  const requested = searchParams.get('location')
  const initial =
    requested && locations.some((item) => item.name === requested)
      ? requested
      : (locations[0]?.name ?? '')
  const [selectedLocation, setSelectedLocation] = useState(initial)
  const [focusLocation, setFocusLocation] = useState<string | null>(initial)
  const [filter, setFilter] = useState<MapFilter>('All Media')
  const { selectedInventory, toggleInventory, startDate, endDate } = useCampaignDraft()

  useEffect(() => {
    if (requested && locations.some((item) => item.name === requested)) {
      setSelectedLocation(requested)
      setFocusLocation(requested)
    }
  }, [requested, locations])

  useEffect(() => {
    if (locations.length && !locations.some((l) => l.name === selectedLocation)) {
      setSelectedLocation(locations[0].name)
      setFocusLocation(locations[0].name)
    }
  }, [locations, selectedLocation])
  const rows = useMemo(
    () => inventory.filter((item) => item.area === selectedLocation && matchesType(item, filter)),
    [selectedLocation, filter, inventory],
  )
  const selectedTotal = useMemo(
    () =>
      flightCost(
        inventory.filter((item) => selectedInventory.has(item.id)),
        startDate,
        endDate,
      ),
    [selectedInventory, startDate, endDate, inventory],
  )
  const selectLocation = (name: string) => {
    setSelectedLocation(name)
    setFocusLocation(name)
  }

  return (
    <section className="page">
      <div className="page-head">
        <div>
          <h1>Media Marketplace</h1>
          <p>
            Discover purchasable inventory by location, audience context and availability.{' '}
            <span className="demo-note">
              Map uses real geography. Seed placements are mock; imported records use your supplied
              data.
            </span>
          </p>
        </div>
        <div className="page-actions">
          <Link className="btn" href="/planner">
            Media recommendation
          </Link>
          <Link className="btn primary" href="/campaigns/new">
            Continue to campaign
          </Link>
        </div>
      </div>
      <div className="market-layout">
        <div className="panel market-map">
          <MediaMapShell
            selectedLocation={selectedLocation}
            filter={filter}
            focusLocation={focusLocation}
            marketplace
            onSelectLocation={selectLocation}
            onFilterChange={setFilter}
          />
          <div className="selection-bar">
            <div>
              <strong>{selectedInventory.size} placements selected</strong>
              <br />
              <span>Total flight cost · {periodLabel(startDate, endDate)}</span>
            </div>
            <div>
              <strong>฿{selectedTotal.toLocaleString()}</strong>{' '}
              <Link className="btn primary" href="/campaigns/new">
                Add to campaign
              </Link>
            </div>
          </div>
        </div>
        <div className="panel inventory-list">
          <div className="panel-title">
            <div>
              <h3>{selectedLocation} Inventory</h3>
              <span>Availability follows each placement</span>
            </div>
            <span>{rows.length} results</span>
          </div>
          <div className="inventory-scroll">
            {rows.length ? (
              rows.map((item) => (
                <div
                  key={item.id}
                  className={`inventory-item inventory-card-row ${selectedInventory.has(item.id) ? 'selected' : ''}`}
                >
                  <button
                    type="button"
                    className="inventory-toggle"
                    onClick={() => toggleInventory(item.id)}
                    aria-label={`Select ${item.name}`}
                  >
                    <span className="selection-check">
                      {selectedInventory.has(item.id) ? '✓' : '+'}
                    </span>
                  </button>
                  <Link href={`/inventory/${item.id}`} className="inventory-detail-link">
                    <span className="thumb" />
                    <span>
                      <h4>{item.name}</h4>
                      <p>
                        {item.area} · {item.type}
                        <br />
                        {item.reach}
                      </p>
                    </span>
                    <span className="price">
                      ฿{(item.price / 1000).toFixed(0)}K<span>per week</span>
                    </span>
                  </Link>
                </div>
              ))
            ) : (
              <div className="inventory-empty">No placements match this area and media filter.</div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
