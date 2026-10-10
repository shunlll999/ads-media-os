'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Creative, DisplayScreen } from '@/types/media-os'
import { CreativeRenderer } from '../CreativeRenderer'

interface Feed {
  screen: DisplayScreen
  items: Creative[]
  serverTime: string
}
export function PlayerPage({ screenId, token }: { screenId: string; token: string }) {
  const [feed, setFeed] = useState<Feed | null>(null)
  const [index, setIndex] = useState(0)
  const [playlistVersion, setPlaylistVersion] = useState(0)
  const [error, setError] = useState('')
  const [contentError, setContentError] = useState(false)
  const [controls, setControls] = useState(true)
  const signature = useRef('')
  const playback = useRef<{
    id: string
    creativeId: string
    started: number
    accepted: boolean
    complete: boolean
  } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const current = feed?.items[index % Math.max(feed.items.length, 1)]
  const request = useCallback(
    async (action: string, body?: unknown) => {
      const response = await fetch(`/api/player/${encodeURIComponent(screenId)}/${action}`, {
        method: body ? 'POST' : 'GET',
        headers: {
          'x-screen-token': token,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        cache: 'no-store',
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'Player connection failed.')
      return data
    },
    [screenId, token],
  )
  useEffect(() => {
    let active = true
    async function poll() {
      try {
        const data: Feed = await request('playlist')
        if (!active) return
        const next = JSON.stringify(data.items)
        if (signature.current !== next) {
          signature.current = next
          playback.current = null
          if (timer.current) clearTimeout(timer.current)
          setContentError(false)
          setIndex(0)
          setPlaylistVersion((v) => v + 1)
        }
        setFeed((previous) =>
          JSON.stringify(previous?.screen) === JSON.stringify(data.screen) &&
          signature.current === next &&
          JSON.stringify(previous?.items) === next
            ? previous
            : data,
        )
        setError('')
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Player unavailable.')
      }
    }
    async function heartbeat() {
      try {
        await request('heartbeat', {})
      } catch {}
    }
    poll()
    heartbeat()
    const polling = setInterval(poll, 5000)
    const beat = setInterval(heartbeat, 15000)
    return () => {
      active = false
      clearInterval(polling)
      clearInterval(beat)
    }
  }, [request])
  const advance = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    playback.current = null
    setIndex((i) => i + 1)
    setContentError(false)
  }, [])
  const complete = useCallback(async () => {
    const session = playback.current
    if (!session || session.complete) return
    session.complete = true
    if (session.accepted)
      try {
        await request('plays', {
          sessionId: session.id,
          creativeId: session.creativeId,
          event: 'complete',
          durationMs: Math.round(performance.now() - session.started),
        })
      } catch {}
    advance()
  }, [request, advance])
  const onReady = useCallback(() => {
    if (!current || playback.current) return
    const session = {
      id: crypto.randomUUID(),
      creativeId: current.id,
      started: performance.now(),
      accepted: false,
      complete: false,
    }
    playback.current = session
    request('plays', { sessionId: session.id, creativeId: session.creativeId, event: 'start' })
      .then(() => {
        session.accepted = true
      })
      .catch(() => {})
    timer.current = setTimeout(() => complete(), current.durationSeconds * 1000)
  }, [current, request, complete])
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )
  function failed() {
    setContentError(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(advance, 5000)
  }
  useEffect(() => {
    const hide = setTimeout(() => setControls(false), 7000)
    return () => clearTimeout(hide)
  }, [])
  const ratio = feed ? feed.screen.width / feed.screen.height : 16 / 9
  return (
    <div className="display-player" onPointerMove={() => setControls(true)}>
      {current ? (
        <div
          className={`display-canvas ${ratio < 1 ? 'display-portrait' : ''}`}
          style={{
            width: `min(100vw, calc(100vh * ${ratio}))`,
            height: `min(100vh, calc(100vw / ${ratio}))`,
          }}
        >
          <CreativeRenderer
            key={`${playlistVersion}-${index}-${current.id}`}
            creative={current}
            onReady={onReady}
            onError={failed}
            onEnded={complete}
          />
          {contentError ? (
            <div className="player-empty">Content failed to load. Skipping in 5 seconds…</div>
          ) : null}
        </div>
      ) : (
        <div className="player-empty">
          <h1>{feed?.screen.name ?? 'Media OS Player'}</h1>
          <p>{error || 'No active playlist. Assign content from Screens.'}</p>
          <small>{feed?.screen.location}</small>
        </div>
      )}
      {feed && controls ? (
        <div className="player-controls">
          <div>
            <strong>{feed.screen.name}</strong>
            <span>
              {feed.screen.location} · {feed.screen.width}×{feed.screen.height} ·{' '}
              {feed.screen.preview ? 'Preview' : 'Scheduled live playback'}
            </span>
            {error ? <span role="alert">{error}</span> : null}
          </div>
          <button
            type="button"
            onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})}
          >
            Fullscreen
          </button>
          <button type="button" onClick={() => setControls(false)}>
            Hide controls
          </button>
        </div>
      ) : null}
    </div>
  )
}
