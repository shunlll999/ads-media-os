'use client'
import { useEffect } from 'react'
import { assetUrl } from '@/lib/client-api'
import type { Creative } from '@/types/media-os'

export function CreativeRenderer({
  creative,
  onReady,
  onError,
  onEnded,
}: {
  creative: Creative
  onReady?: () => void
  onError?: () => void
  onEnded?: () => void
}) {
  useEffect(() => {
    if (creative.kind === 'project' && creative.project) onReady?.()
  }, [creative.kind, creative.project, onReady])
  if (creative.kind === 'project') {
    const p = creative.project
    if (!p) return <div className="content-unavailable">Project data unavailable.</div>
    return (
      <div className={`project-display project-display-${p.id}`}>
        <div className="project-display-copy">
          <span>{p.category}</span>
          <h1>{p.name}</h1>
          <p>{p.description}</p>
          <strong>{new URL(p.url).hostname}</strong>
        </div>
        <div className="project-display-photo">
          {/* biome-ignore lint/performance/noImgElement: uploaded and external creative assets use native media loading. */}
          <img
            src={assetUrl(p.image)}
            alt={`${p.name} website`}
            onError={(event) => {
              event.currentTarget.style.display = 'none'
            }}
          />
        </div>
      </div>
    )
  }
  if (creative.kind === 'video')
    return (
      <video
        className="creative-media"
        src={assetUrl(creative.url ?? '')}
        style={{ objectFit: creative.fit }}
        autoPlay
        muted
        playsInline
        onPlaying={onReady}
        onError={onError}
        onEnded={onEnded}
      />
    )
  if (creative.kind === 'web')
    return (
      <iframe
        className="creative-media"
        src={creative.url}
        title={creative.name}
        sandbox="allow-scripts allow-same-origin"
        referrerPolicy="no-referrer"
        onLoad={() => {
          if (creative.url?.startsWith('/')) {
            fetch(assetUrl(creative.url), { method: 'HEAD' })
              .then((response) => (response.ok ? onReady?.() : onError?.()))
              .catch(() => onError?.())
          } else onReady?.()
        }}
        onError={onError}
      />
    )
  return (
    // biome-ignore lint/performance/noImgElement: native onLoad/onError confirm uploaded creative rendering for telemetry.
    <img
      className="creative-media"
      src={assetUrl(creative.url ?? '')}
      alt={creative.name}
      style={{ objectFit: creative.fit }}
      onLoad={onReady}
      onError={onError}
    />
  )
}
