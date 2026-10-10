'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useId, useState } from 'react'
import { navigationGroups, primaryNavigation } from '@/data/navigation'
import { canViewRoute } from '@/lib/permissions'
import type { NavItem } from '@/types/media-os'
import { useAuth } from './context/AuthContext'
import { Icon } from './Icon'

export function navigationActive(pathname: string, href: string) {
  if (pathname === '/onboarding' && href === '/screens') return true
  if (href === '/' || href === '/commercial') return pathname === href
  if (href.startsWith('/analytics'))
    return pathname === '/analytics' || pathname.startsWith('/analytics/')
  return pathname === href || pathname.startsWith(`${href}/`)
}
export function WorkspaceNavigation({
  pathname,
  onNavigate,
}: {
  pathname: string
  onNavigate?: () => void
}) {
  const { user } = useAuth()
  const menuId = useId()
  const [expanded, setExpanded] = useState<Record<string, { pathname: string; open: boolean }>>({})
  function itemLink(item: NavItem) {
    if (!canViewRoute(user?.role, item.href)) return null
    const active = navigationActive(pathname, item.href)
    return (
      <Link
        key={item.href}
        href={item.href}
        className={active ? 'active' : ''}
        aria-current={active ? 'page' : undefined}
        onClick={onNavigate}
      >
        <Icon name={item.icon} />
        <span>{item.label}</span>
      </Link>
    )
  }
  return (
    <nav className="nav workspace-navigation" aria-label="Workspace navigation">
      <div className="nav-primary">{primaryNavigation.map(itemLink)}</div>
      {navigationGroups
        .filter((group) => group.items.some((item) => canViewRoute(user?.role, item.href)))
        .map((group) => {
          const active = group.items.some((item) => navigationActive(pathname, item.href))
          const preference = expanded[group.label]
          const open = preference?.pathname === pathname ? preference.open : active
          const childrenId = `${menuId}-${group.label.toLowerCase()}`
          return (
            <section className="nav-group" key={group.label} aria-label={group.label}>
              <h2>
                <button
                  type="button"
                  className="nav-group-toggle"
                  aria-expanded={open}
                  aria-controls={childrenId}
                  onClick={() =>
                    setExpanded((current) => ({
                      ...current,
                      [group.label]: { pathname, open: !open },
                    }))
                  }
                >
                  <span>{group.label}</span>
                  <svg viewBox="0 0 16 16" aria-hidden="true" className={open ? 'expanded' : ''}>
                    <path d="m5 3 5 5-5 5" />
                  </svg>
                </button>
              </h2>
              <div
                className={`nav-group-panel ${open ? 'is-open' : ''}`}
                id={childrenId}
                aria-hidden={!open}
                inert={!open}
              >
                <div className="nav-group-panel-inner">
                  <div className="nav-children">{group.items.map(itemLink)}</div>
                </div>
              </div>
            </section>
          )
        })}
      <div className="nav-project-link">
        {itemLink({ href: '/projects', label: 'Real Projects', icon: 'doc' })}
        {user?.role === 'admin' || user?.role === 'editor'
          ? itemLink({ href: '/cms', label: 'CMS', icon: 'doc' })
          : null}
        {itemLink({ href: '/account', label: 'Account', icon: 'people' })}
      </div>
    </nav>
  )
}

export function WorkspaceSectionTabs({ group }: { group: string }) {
  const pathname = usePathname()
  const { user } = useAuth()
  const items = navigationGroups.find((section) => section.label === group)?.items ?? []
  return (
    <nav className="pg-tabs" aria-label={`${group} sections`}>
      {items
        .filter((item) => canViewRoute(user?.role, item.href))
        .map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={navigationActive(pathname, item.href) ? 'active' : ''}
            aria-current={navigationActive(pathname, item.href) ? 'page' : undefined}
          >
            {item.label}
          </Link>
        ))}
    </nav>
  )
}
