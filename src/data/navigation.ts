import type { NavItem } from '@/types/media-os'

export const primaryNavigation: NavItem[] = [
  { href: '/', label: 'Overview', icon: 'home' },
  { href: '/inventory', label: 'Inventory', icon: 'pin' },
  { href: '/planner', label: 'Media Planner', icon: 'spark' },
  { href: '/campaigns', label: 'Campaigns', icon: 'play' },
]
export const navigationGroups: { label: string; items: NavItem[] }[] = [
  {
    label: 'Programmatic',
    items: [
      { href: '/deals', label: 'Deals', icon: 'card' },
      { href: '/programmatic/transactions', label: 'Transactions', icon: 'doc' },
      { href: '/programmatic/connections', label: 'SSP / DSP', icon: 'screen' },
      { href: '/monitor', label: 'Delivery Monitor', icon: 'chart' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { href: '/creatives', label: 'Creatives', icon: 'image' },
      { href: '/screens', label: 'Screens', icon: 'screen' },
      { href: '/approvals', label: 'Approvals', icon: 'check' },
      { href: '/operations', label: 'Issues', icon: 'spark' },
    ],
  },
  {
    label: 'Data',
    items: [
      { href: '/audience', label: 'Audience', icon: 'people' },
      { href: '/data', label: 'Connections', icon: 'doc' },
      { href: '/analytics', label: 'Analytics', icon: 'chart' },
    ],
  },
  {
    label: 'Commercial',
    items: [
      { href: '/commercial/proposals', label: 'Proposals', icon: 'doc' },
      { href: '/commercial', label: 'Revenue', icon: 'chart' },
      { href: '/commercial/billing', label: 'Billing', icon: 'card' },
      { href: '/reports', label: 'Reports', icon: 'doc' },
    ],
  },
]
