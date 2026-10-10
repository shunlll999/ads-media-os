'use client'
import { createContext, type ReactNode, useContext, useEffect, useState } from 'react'
import type { MediaPlan } from '@/types/media-os'
import { useMediaCatalog } from './MediaCatalogContext'

interface Draft {
  creativeId: string
  sourceProjectId: string
  selectedInventory: string[]
  budget: number
  objective: string
  audience: string
  startDate: string
  endDate: string
  name: string
  creativeName: string
  plan: MediaPlan | null
}
const initial: Draft = {
  creativeId: '',
  sourceProjectId: '',
  selectedInventory: [],
  budget: 0,
  objective: '',
  audience: '',
  startDate: '',
  endDate: '',
  name: '',
  creativeName: '',
  plan: null,
}
interface DraftContext extends Omit<Draft, 'selectedInventory'> {
  selectedInventory: Set<string>
  ready: boolean
  storageWarning: string
  setBudget: (value: number) => void
  setObjective: (value: string) => void
  setAudience: (value: string) => void
  setStartDate: (value: string) => void
  setEndDate: (value: string) => void
  setName: (value: string) => void
  setCreativeName: (value: string) => void
  setCreative: (id: string, name: string) => void
  toggleInventory: (id: string) => void
  applyPlan: (plan: MediaPlan) => void
  applyProject: (id: string) => void
  resetDraft: () => void
}
const Context = createContext<DraftContext | null>(null)
export function CampaignDraftProvider({ children }: { children: ReactNode }) {
  const catalog = useMediaCatalog()
  const [draft, setDraft] = useState<Draft>(initial)
  const [ready, setReady] = useState(false)
  const [storageWarning, setStorageWarning] = useState('')
  const defaults = catalog.settings.planning
  useEffect(() => {
    if (!defaults) return
    const controller = new AbortController()
    async function load() {
      try {
        const r = await fetch('/api/gateway/cms/draft', {
          signal: controller.signal,
          cache: 'no-store',
        })
        const body = await r.json()
        if (!r.ok) throw Error(body.error)
        setDraft({ ...initial, ...defaults, ...(body.data ?? {}) })
        setReady(true)
      } catch (e) {
        if (!controller.signal.aborted)
          setStorageWarning(e instanceof Error ? e.message : 'Draft unavailable.')
      }
    }
    load()
    return () => controller.abort()
  }, [defaults])
  useEffect(() => {
    if (!ready) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      fetch('/api/gateway/cms/draft', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
        signal: controller.signal,
      })
        .then(async (r) => {
          if (!r.ok) throw Error((await r.json()).error)
          setStorageWarning('')
        })
        .catch((e) => {
          if (!controller.signal.aborted) setStorageWarning(e.message)
        })
    }, 600)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [draft, ready])
  const update = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value, plan: null }))
  const value: DraftContext = {
    ...draft,
    selectedInventory: new Set(draft.selectedInventory),
    ready: ready && catalog.ready,
    storageWarning,
    setBudget: (value) => update('budget', value),
    setObjective: (value) => update('objective', value),
    setAudience: (value) => update('audience', value),
    setStartDate: (value) => update('startDate', value),
    setEndDate: (value) => update('endDate', value),
    setName: (value) => update('name', value),
    setCreativeName: (value) =>
      setDraft((current) => ({
        ...current,
        creativeName: value,
        creativeId: '',
      })),
    setCreative: (id, name) =>
      setDraft((current) => ({ ...current, creativeId: id, creativeName: name })),
    applyProject: (id) => {
      const project = catalog.projects.find((project) => project.id === id)
      if (!project) return
      setDraft((current) => ({
        ...current,
        sourceProjectId: id,
        ...project.suggestedBrief,
        plan: null,
      }))
    },
    toggleInventory: (id) =>
      setDraft((current) => ({
        ...current,
        plan: null,
        selectedInventory: current.selectedInventory.includes(id)
          ? current.selectedInventory.filter((entry) => entry !== id)
          : [...current.selectedInventory, id],
      })),
    applyPlan: (plan) =>
      setDraft((current) => ({
        ...current,
        plan,
        selectedInventory: plan.inventoryIds,
        budget: plan.budget,
        objective: plan.objective,
        audience: plan.audience,
        startDate: plan.startDate,
        endDate: plan.endDate,
      })),
    resetDraft: () => setDraft({ ...initial, ...defaults }),
  }
  return <Context.Provider value={value}>{children}</Context.Provider>
}
export function useCampaignDraft() {
  const value = useContext(Context)
  if (!value) throw new Error('CampaignDraftProvider is required')
  return value
}
