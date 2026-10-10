'use client'
import { usePathname } from 'next/navigation'
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react'
import type { PortfolioProject } from '@/data/portfolio-projects'
import { inventoryLocations } from '@/lib/planning'
import type { InventoryItem, MediaLocation } from '@/types/media-os'
import type { WorkspaceSettings } from '@/types/workspace'

interface Catalog {
  inventory: InventoryItem[]
  locations: MediaLocation[]
  projects: PortfolioProject[]
  settings: WorkspaceSettings
  ready: boolean
  error: string
  gateway: boolean
  refresh: () => void
}
const Context = createContext<Catalog | null>(null)
export function MediaCatalogProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const isPlayer = pathname.startsWith('/player/') || pathname === '/login'
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [projects, setProjects] = useState<PortfolioProject[]>([])
  const [settings, setSettings] = useState<WorkspaceSettings>({})
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [gateway, setGateway] = useState(false)
  const [revision, setRevision] = useState(0)
  // biome-ignore lint/correctness/useExhaustiveDependencies: revision intentionally reloads the server catalog.
  useEffect(() => {
    const controller = new AbortController()
    setReady(false)
    setError('')
    if (isPlayer) {
      setReady(true)
      return () => controller.abort()
    }
    async function load() {
      try {
        const responses = await Promise.all(
          ['/api/media', '/api/projects', '/api/gateway/cms/settings'].map((url) =>
            fetch(url, { signal: controller.signal, cache: 'no-store' }),
          ),
        )
        const bodies = await Promise.all(responses.map((r) => r.json()))
        for (const [index, response] of responses.entries())
          if (!response.ok) throw new Error(bodies[index].error ?? 'Unable to load catalog.')
        setSettings(bodies[2].data)
        setInventory(bodies[0].data)
        setProjects(bodies[1].data)
        setGateway(bodies[0].meta?.source === 'postgresql')
        setReady(true)
      } catch (e) {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : 'Catalog unavailable.')
      }
    }
    load()
    return () => controller.abort()
  }, [revision, isPlayer])
  const locations = useMemo(() => inventoryLocations(inventory), [inventory])
  return (
    <Context.Provider
      value={{
        inventory,
        projects,
        settings,
        locations,
        ready,
        error,
        gateway,
        refresh: () => setRevision((r) => r + 1),
      }}
    >
      {children}
    </Context.Provider>
  )
}
export function useMediaCatalog() {
  const c = useContext(Context)
  if (!c) throw new Error('MediaCatalogProvider is required')
  return c
}
