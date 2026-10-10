export interface PortfolioProject {
  dataSource?: 'mock' | 'real'
  id: string
  name: string
  category: string
  url: string
  image: string
  description: string
  capabilities: string[]
  publicStatus: string
  reviewedAt: string
  suggestedBrief: { name: string; objective: string; audience: string }
}
