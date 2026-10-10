import type { AreaPhoto } from '@/data/area-photos'
import type { IconName, MapFilter } from './media-os'
export interface WorkspaceSettings {
  overview?: {
    network: { availableUnits: number; provinces: number; digitalUnits: number; fillRate: string }
    kpis: { icon: IconName; label: string; value: string; note: string }[]
    source: string
  }
  areaPhotos?: Record<string, AreaPhoto>
  importTemplate?: Record<string, unknown>
  programmatic?: {
    profile: {
      venueId: string
      latitude: number
      longitude: number
      screenSize: string
      width: number
      height: number
      slotDuration: number
      loopDuration: number
      operatingStart: string
      operatingEnd: string
      cms: string
      ssp: string
      sspInventoryId: string
      floorCpm: number
      audiencePerPlay: number
    }
    deal: {
      type: string
      dsp: string
      ssp: string
      cpm: number
      floorCpm: number
      budget: number
      impressionTarget: number
      sspFeePercent: number
    }
    revenueTarget: number
  }
  planning?: {
    demoCreativeId: string
    demoCampaignName: string
    budget: number
    objective: string
    audience: string
    startDate: string
    endDate: string
    objectives: string[]
    mapFilters: MapFilter[]
  }
}
