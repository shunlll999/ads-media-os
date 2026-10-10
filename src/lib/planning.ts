import type { InventoryItem, LocationBreakdown, MapFilter } from '@/types/media-os'

export function flightDays(start: string, end: string) {
  const valid = (value: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  if (!valid(start) || !valid(end)) return 0
  const days = (Date.parse(end) - Date.parse(start)) / 86400000 + 1
  return days > 0 && days <= 366 ? days : 0
}
export function flightCost(items: InventoryItem[], start: string, end: string) {
  const days = flightDays(start, end)
  return items.reduce((total, item) => total + Math.round((item.price * days) / 7), 0)
}
export function periodLabel(start: string, end: string) {
  return `${start} – ${end}`
}
export function matchesType(item: InventoryItem, filter: MapFilter) {
  return filter === 'All Media' || item.type.toLowerCase().includes(filter.toLowerCase())
}
export function isAvailable(item: InventoryItem, start: string, end: string) {
  return (
    flightDays(start, end) > 0 &&
    Boolean(item.availableFrom) &&
    start >= (item.availableFrom ?? '') &&
    Boolean(item.availableTo) &&
    end <= (item.availableTo ?? '')
  )
}

export function inventoryLocations(records: InventoryItem[]) {
  const names = [...new Set(records.map((item) => item.area))]
  return names.map((name) => {
    const items = records.filter((item) => item.area === name)
    const location = {
      name,
      lat: items[0]?.latitude ?? 13.7563,
      lng: items[0]?.longitude ?? 100.5018,
    }
    const breakdown: LocationBreakdown = {}
    for (const filter of ['Digital', 'Transit', 'Airport', 'Retail'] as const)
      breakdown[filter] = items.filter((item) => matchesType(item, filter)).length
    return {
      ...location,
      count: items.length,
      breakdown,
      reach: 'Not modeled',
      price: items.length
        ? `฿${Math.min(...items.map((item) => item.price)).toLocaleString()}`
        : '—',
      types: [...new Set(items.map((item) => item.type))].join(' · '),
    }
  })
}
