import { AnalyticsPage } from '@/components/media-os/pages/AnalyticsPage'
export default async function AnalyticsRoute({
  params,
}: {
  params: Promise<{ campaignId: string }>
}) {
  const { campaignId } = await params
  return <AnalyticsPage campaignId={campaignId} />
}
