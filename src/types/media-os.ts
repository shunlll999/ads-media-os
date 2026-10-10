export type MapFilter = 'All Media' | 'Digital' | 'Transit' | 'Airport' | 'Retail'
export type LocationBreakdown = Partial<Record<Exclude<MapFilter, 'All Media'> | 'Static', number>>

export interface MediaLocation {
  name: string
  count: number
  lat: number
  lng: number
  reach: string
  price: string
  types: string
  breakdown: LocationBreakdown
}

export interface InventoryItem {
  dataSource?: 'mock' | 'real'
  availableFrom?: string
  availableTo?: string
  id: string
  name: string
  area: string
  type: string
  reach: string
  price: number
  latitude?: number
  longitude?: number
  format?: string
  dimensions?: string
  availability?: string
  estimatedImpressions?: string
}

export interface MediaPlanAllocation {
  type: string
  areas: string
  percentage: number
  cost: number
  reach: string
  rationale: string
}

export interface MediaPlan {
  id: string
  objective: string
  audience: string
  budget: number
  period: string
  areas: string[]
  score: number
  estimatedReach: string
  estimatedFrequency: string
  allocations: MediaPlanAllocation[]
  inventoryIds: string[]
  totalCost: number
  startDate: string
  endDate: string
  generatedAt: string
}

export type CampaignStatus = 'Planning' | 'Pending Approval' | 'Approved' | 'Live' | 'Completed'

export interface Campaign {
  creativeId?: string
  sourceProjectId?: string
  id: string
  name: string
  objective: string
  period: string
  spend: number
  reach: string
  frequency: string
  status: CampaignStatus
  proofOfPlay?: string
  inventoryIds: string[]
  creativeName?: string
  budget?: number
  startDate?: string
  endDate?: string
  createdAt: string
}

export interface CampaignAnalytics {
  trend?: number[]
  deliveredImpressions?: string
  measurementSource?: string
  previewPlays?: number
  totalStarts?: number
  campaignId: string
  reach: string
  frequency: string
  proofOfPlay: string
  deliveredPlays: number
  scheduledPlays: number
  storeVisits: string
  engagements: string
  roas: string
  topLocations: Array<{ area: string; impressions: string; proofOfPlay: string }>
}

export type IconName =
  | 'home'
  | 'pin'
  | 'spark'
  | 'play'
  | 'chart'
  | 'image'
  | 'check'
  | 'doc'
  | 'card'
  | 'people'
  | 'screen'
  | 'pie'

export interface NavItem {
  href: string
  label: string
  icon: IconName
  badge?: number
}

export interface Creative {
  id: string
  name: string
  kind: 'image' | 'video' | 'web' | 'project'
  url?: string
  projectId?: string
  durationSeconds: number
  fit: 'contain' | 'cover'
  project?: import('@/data/portfolio-projects').PortfolioProject
  campaignId?: string
  mode?: 'preview' | 'live'
}
export interface DisplayScreen {
  id: string
  name: string
  inventoryId: string
  location: string
  latitude: number
  longitude: number
  format: 'landscape' | 'portrait' | 'square' | 'ultrawide' | 'classic' | 'custom'
  width: number
  height: number
  preview: boolean
  online?: boolean
  lastSeenAt?: string
}
