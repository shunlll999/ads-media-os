'use client'

import Link from 'next/link'
import { useCampaignDraft } from '../context/CampaignDraftContext'
import { useMediaCatalog } from '../context/MediaCatalogContext'

export function InventoryDetailPage({ inventoryId }: { inventoryId: string }) {
  const { inventory, ready: catalogReady } = useMediaCatalog()
  const item = inventory.find((entry) => entry.id === inventoryId)
  const { selectedInventory, toggleInventory } = useCampaignDraft()
  if (!catalogReady)
    return (
      <section className="page">
        <div className="panel state-panel">Loading placement…</div>
      </section>
    )
  if (!item)
    return (
      <section className="page">
        <div className="panel state-panel">
          <h2>Inventory not found</h2>
          <Link className="btn" href="/inventory">
            Back to inventory
          </Link>
        </div>
      </section>
    )
  const selected = selectedInventory.has(item.id)
  return (
    <section className="page">
      <div className="page-head">
        <div>
          <h1>{item.name}</h1>
          <p>
            {item.area} · {item.type} ·{' '}
            <span className="demo-note">
              {item.dataSource === 'real' ? 'Imported inventory record' : 'Seed inventory record'}
            </span>
          </p>
        </div>
        <div className="page-actions">
          <Link className="btn" href={`/inventory?location=${encodeURIComponent(item.area)}`}>
            Back to map
          </Link>
          <button
            type="button"
            className={`btn ${selected ? 'success' : 'primary'}`}
            onClick={() => toggleInventory(item.id)}
          >
            {selected ? 'Selected ✓' : 'Add to media plan'}
          </button>
        </div>
      </div>
      <div className="inventory-detail-grid">
        <div className="panel inventory-visual-large">
          <div className="media-screen-mock">
            <span>{item.area.toUpperCase()}</span>
            <strong>
              YOUR
              <br />
              BRAND
            </strong>
            <small>Placement visualization</small>
          </div>
        </div>
        <div className="panel inventory-specs">
          <h3>Media specifications</h3>
          <Spec label="Format" value={item.format ?? item.type} />
          <Spec label="Dimensions" value={item.dimensions ?? 'Network'} />
          <Spec label="Estimated reach" value={item.reach} />
          <Spec label="Estimated impressions" value={item.estimatedImpressions ?? '—'} />
          <Spec
            label="Availability"
            value={
              item.availableFrom && item.availableTo
                ? `${item.availableFrom} – ${item.availableTo}`
                : (item.availability ?? 'Nov 2026')
            }
          />
          <Spec label="Weekly price" value={`฿${item.price.toLocaleString()} / week`} />
          <div className="inventory-coordinates">
            <span>Area center</span>
            <code>
              {item.latitude?.toFixed(4)}, {item.longitude?.toFixed(4)}
            </code>
          </div>
          <button
            type="button"
            className={`btn full-btn ${selected ? 'success' : 'primary'}`}
            onClick={() => toggleInventory(item.id)}
          >
            {selected ? 'Remove from plan' : 'Add to media plan'}
          </button>
        </div>
      </div>
      <div className="panel inventory-next">
        <div>
          <h3>Next step</h3>
          <p>
            Combine this placement with other locations, or let the media planner recommend a
            complete media mix for the campaign objective.
          </p>
        </div>
        <div className="page-actions">
          <Link className="btn" href="/planner">
            Media Planner
          </Link>
          <Link className="btn primary" href="/campaigns/new">
            Build campaign
          </Link>
        </div>
      </div>
    </section>
  )
}
function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div className="spec-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}
