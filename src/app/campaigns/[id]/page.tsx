import { CampaignDetailPage } from '@/components/media-os/pages/CampaignDetailPage'
export default async function CampaignDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <CampaignDetailPage campaignId={id} />
}
