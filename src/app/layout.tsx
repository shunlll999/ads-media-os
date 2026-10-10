import type { Metadata, Viewport } from 'next'
import 'leaflet/dist/leaflet.css'
import '@/styles/globals.scss'
import { AuthProvider } from '@/components/media-os/context/AuthContext'
import { CampaignDraftProvider } from '@/components/media-os/context/CampaignDraftContext'
import { MediaCatalogProvider } from '@/components/media-os/context/MediaCatalogContext'
import { DashboardShell } from '@/components/media-os/DashboardShell'

export const metadata: Metadata = {
  title: process.env.NEXT_PUBLIC_WORKSPACE_TITLE || 'Media OS — Campaign Workspace',
  referrer: 'no-referrer',
  authors: process.env.NEXT_PUBLIC_PORTFOLIO_AUTHOR
    ? [{ name: process.env.NEXT_PUBLIC_PORTFOLIO_AUTHOR }]
    : undefined,
  description:
    'An independent campaign workspace prototype for out-of-home media planning and simulated programmatic workflows.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <MediaCatalogProvider>
            <CampaignDraftProvider>
              <DashboardShell>{children}</DashboardShell>
            </CampaignDraftProvider>
          </MediaCatalogProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
