import { PlayerPage } from '@/components/media-os/pages/PlayerPage'
export default async function PlayerRoute({
  params,
  searchParams,
}: {
  params: Promise<{ screenId: string }>
  searchParams: Promise<{ token?: string }>
}) {
  const [{ screenId }, { token }] = await Promise.all([params, searchParams])
  return <PlayerPage screenId={screenId} token={token ?? ''} />
}
