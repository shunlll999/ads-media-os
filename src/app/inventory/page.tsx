import { Suspense } from 'react'
import { MarketplacePage } from '@/components/media-os/pages/MarketplacePage'
export default function InventoryPage() {
  return (
    <Suspense
      fallback={
        <section className="page">
          <div className="panel state-panel">Loading marketplace…</div>
        </section>
      }
    >
      <MarketplacePage />
    </Suspense>
  )
}
