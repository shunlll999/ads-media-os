import { InventoryDetailPage } from '@/components/media-os/pages/InventoryDetailPage'
export default async function InventoryItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <InventoryDetailPage inventoryId={id} />
}
