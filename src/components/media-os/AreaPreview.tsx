'use client'

import Image from 'next/image'
import { useState } from 'react'
import { useMediaCatalog } from './context/MediaCatalogContext'

export function AreaPreview({ area }: { area: string }) {
  const photo = useMediaCatalog().settings.areaPhotos?.[area]
  const [failed, setFailed] = useState(false)

  return (
    <div className="location-visual area-photo">
      {photo && !failed ? (
        <>
          <Image
            unoptimized
            src={photo.src}
            alt={photo.alt}
            fill
            sizes="238px"
            onError={() => setFailed(true)}
          />
          <span className="area-photo-label">AREA PHOTO</span>
          <div className="area-photo-credit">
            <a
              href={photo.source}
              target="_blank"
              rel="noreferrer"
              title={`Photo: ${photo.author} · Reference area image; cropped to fit`}
            >
              © {photo.author}
            </a>
            <a href={photo.licenseUrl} target="_blank" rel="noreferrer">
              {photo.license}
            </a>
          </div>
        </>
      ) : (
        <span className="area-photo-fallback">{area} · Photo unavailable</span>
      )}
    </div>
  )
}
