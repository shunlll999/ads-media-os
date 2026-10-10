'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from 'react'
import { navigationGroups, primaryNavigation } from '@/data/navigation'
import { useAuth } from './context/AuthContext'
import { useMediaCatalog } from './context/MediaCatalogContext'
import { Icon } from './Icon'
import { navigationActive, WorkspaceNavigation, WorkspaceSectionTabs } from './WorkspaceNavigation'
import { WorkspaceResourcePanel } from './WorkspaceResourcePanel'

export function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const { user } = useAuth()
  const section =
    pathname === '/onboarding'
      ? 'Operations'
      : navigationGroups.find((group) =>
          group.items.some((item) => navigationActive(pathname, item.href)),
        )?.label
  const menuRef = useRef<HTMLDialogElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  function closeMenu() {
    menuRef.current?.close()
    setMenuOpen(false)
  }
  function openMenu() {
    menuRef.current?.showModal()
    setMenuOpen(true)
  }
  const { locations, settings, error: catalogError } = useMediaCatalog()
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(null), 2200)
    return () => window.clearTimeout(timeout)
  }, [toast])

  const submitSearch = () => {
    const normalized = search.trim().toLowerCase()
    const match = locations.find((location) => location.name.toLowerCase().includes(normalized))
    if (!normalized || !match) {
      setToast(`Try ${locations.map((l) => l.name).join(', ')}.`)
      return
    }
    router.push(`/inventory?location=${encodeURIComponent(match.name)}`)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') submitSearch()
  }

  if (pathname === '/login' || pathname.startsWith('/player/')) return <>{children}</>
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link href="/" className="brand">
          <span className="brand-mark" aria-hidden="true">
            <Icon name="chart" />
          </span>
          <div className="brand-copy">
            <strong>Media OS</strong>
            <small>{process.env.NEXT_PUBLIC_WORKSPACE_BYLINE || 'Campaign workspace'}</small>
          </div>
        </Link>
        <div className="topbar-center">
          <div className="search">
            <Icon name="pin" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Search inventory locations…"
            />
          </div>
        </div>
        <Link href="/account" className="userbox">
          <div className="avatar" role="img" aria-label={`${user?.name ?? 'Account'} profile`}>
            {user?.name
              .split(' ')
              .map((n) => n[0])
              .join('')
              .slice(0, 2)
              .toUpperCase()}
          </div>
          <div className="user-meta">
            <strong>{user?.name}</strong>
            <span>{user?.role}</span>
          </div>
        </Link>
      </header>

      <aside className="sidebar">
        <WorkspaceNavigation pathname={pathname} />
        <div className="network-summary">
          <h4>Network snapshot</h4>
          <div className="network-grid">
            <div>
              <strong>{settings.overview?.network.availableUnits.toLocaleString() ?? '—'}</strong>
              <span>Available units</span>
            </div>
            <div>
              <strong>{settings.overview?.network.provinces ?? '—'}</strong>
              <span>Provinces</span>
            </div>
            <div>
              <strong>{settings.overview?.network.digitalUnits.toLocaleString() ?? '—'}</strong>
              <span>Digital units</span>
            </div>
            <div>
              <strong>{settings.overview?.network.fillRate ?? '—'}</strong>
              <span>Demo fill rate</span>
            </div>
          </div>
        </div>
      </aside>

      <main className="main">
        {catalogError ? (
          <div className="catalog-error" role="alert">
            {catalogError}
          </div>
        ) : null}
        {section ? (
          <div className="workspace-section-tabs">
            <WorkspaceSectionTabs group={section} />
          </div>
        ) : null}
        {children}
        <WorkspaceResourcePanel pathname={pathname} />
      </main>
      <div className={`toast ${toast ? 'show' : ''}`}>{toast ?? ''}</div>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {primaryNavigation.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={navigationActive(pathname, item.href) ? 'active' : ''}
            aria-current={navigationActive(pathname, item.href) ? 'page' : undefined}
          >
            <Icon name={item.icon} />
            <span>{item.label.replace('Media ', '')}</span>
          </Link>
        ))}
        <button
          type="button"
          aria-label="Open workspace menu"
          aria-expanded={menuOpen}
          aria-controls="workspace-menu"
          onClick={openMenu}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          <span>Menu</span>
        </button>
      </nav>
      <dialog
        id="workspace-menu"
        className="workspace-menu"
        ref={menuRef}
        aria-labelledby="workspace-menu-title"
        onClose={() => setMenuOpen(false)}
        onCancel={() => setMenuOpen(false)}
      >
        <div className="workspace-menu-head">
          <div>
            <small>MEDIA OS</small>
            <h2 id="workspace-menu-title">Workspace menu</h2>
          </div>
          <button
            type="button"
            className="btn"
            onClick={closeMenu}
            aria-label="Close workspace menu"
          >
            Close ×
          </button>
        </div>
        <WorkspaceNavigation pathname={pathname} onNavigate={closeMenu} />
      </dialog>
    </div>
  )
}
