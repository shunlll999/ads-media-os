'use client'

import L from 'leaflet'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { MapContainer, Marker, TileLayer, useMap, ZoomControl } from 'react-leaflet'
import type { MapFilter, MediaLocation } from '@/types/media-os'

interface MediaMapProps {
  locations: MediaLocation[]
  selectedLocation: string
  filter: MapFilter
  focusLocation?: string | null
  onSelectLocation: (name: string) => void
}

function countFor(loc: MediaLocation, filter: MapFilter) {
  return filter === 'All Media' ? loc.count : (loc.breakdown[filter] ?? 0)
}

function createMarkerIcon(loc: MediaLocation, filter: MapFilter, selected: boolean) {
  return L.divIcon({
    className: 'media-div-icon',
    html: `<div class="media-map-marker ${selected ? 'selected' : ''}"><strong>${countFor(loc, filter)}</strong><span>${loc.name}</span></div>`,
    iconSize: [48, 48],
    iconAnchor: [24, 24],
  })
}

function MapViewport({
  locations,
  focusLocation,
}: {
  locations: MediaLocation[]
  focusLocation?: string | null
}) {
  const map = useMap()

  useEffect(() => {
    if (!locations.length) return
    const focused = focusLocation
      ? locations.find((location) => location.name === focusLocation)
      : undefined
    if (focused) {
      map.flyTo([focused.lat, focused.lng], Math.max(map.getZoom(), 13), { duration: 0.55 })
      return
    }
    const bounds = L.latLngBounds(
      locations.map((location) => [location.lat, location.lng] as [number, number]),
    )
    map.fitBounds(bounds, { paddingTopLeft: [44, 80], paddingBottomRight: [44, 80], maxZoom: 12 })
  }, [focusLocation, locations, map])

  return null
}

export default function MediaMap({
  locations,
  selectedLocation,
  filter,
  focusLocation,
  onSelectLocation,
}: MediaMapProps) {
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [loaded, setLoaded] = useState(false)
  // biome-ignore lint/correctness/useExhaustiveDependencies: retrying restarts the tile-loading timeout even if loaded stays false.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!loaded) setFailed(true)
    }, 12000)
    return () => clearTimeout(timer)
  }, [attempt, loaded])
  const visible = useMemo(
    () =>
      filter === 'All Media'
        ? locations
        : locations.filter((location) => (location.breakdown[filter] ?? 0) > 0),
    [filter, locations],
  )

  return (
    <>
      <MapContainer
        key={attempt}
        center={[13.7563, 100.5018]}
        zoom={11}
        zoomControl={false}
        attributionControl
        className="leaflet-live-map"
      >
        <TileLayer
          attribution={
            process.env.NEXT_PUBLIC_MAP_ATTRIBUTION ||
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          }
          className={process.env.NEXT_PUBLIC_MAP_TILE_URL ? undefined : 'osm-light-tiles'}
          // Tile providers require a Referer; send only the origin, never player tokens or paths.
          referrerPolicy="strict-origin-when-cross-origin"
          url={
            process.env.NEXT_PUBLIC_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
          }
          eventHandlers={{ tileerror: () => setFailed(true), tileload: () => setLoaded(true) }}
          subdomains="abcd"
          maxZoom={19}
        />
        <ZoomControl position="bottomright" />
        <MapViewport locations={visible} focusLocation={focusLocation} />
        {visible.map((location) => (
          <Marker
            key={`${location.name}-${filter}-${selectedLocation === location.name}`}
            position={[location.lat, location.lng]}
            icon={createMarkerIcon(location, filter, selectedLocation === location.name)}
            eventHandlers={{ click: () => onSelectLocation(location.name) }}
          />
        ))}
      </MapContainer>
      {failed ? (
        <div className="map-error" role="status">
          <strong>Basemap unavailable</strong>
          <p>You can still select an area or browse the inventory list.</p>
          <div className="map-area-fallback">
            {visible.map((location) => (
              <button
                type="button"
                key={location.name}
                className="btn"
                onClick={() => onSelectLocation(location.name)}
              >
                {location.name} · {countFor(location, filter)}
              </button>
            ))}
          </div>
          <div className="page-actions">
            <button
              type="button"
              className="btn"
              onClick={() => {
                setFailed(false)
                setLoaded(false)
                setAttempt((current) => current + 1)
              }}
            >
              Retry map
            </button>
            <Link className="btn primary" href="/inventory">
              Browse inventory
            </Link>
          </div>
        </div>
      ) : null}
    </>
  )
}
