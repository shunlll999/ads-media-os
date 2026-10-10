export type Role = 'admin' | 'editor' | 'operator' | 'commercial' | 'viewer'
export type Capability = 'content' | 'operations' | 'commercial' | 'planning'
export function canManage(role: Role | undefined, capability: Capability) {
  if (role === 'admin') return true
  if (capability === 'content') return role === 'editor'
  if (capability === 'operations') return role === 'operator'
  if (capability === 'commercial') return role === 'commercial'
  return role !== undefined && role !== 'viewer'
}
export function canViewRoute(role: Role | undefined, route: string) {
  if (!role) return false
  const path = route.toLowerCase()
  if (path === '/commercial' || path.startsWith('/commercial/') || path === '/reports')
    return canManage(role, 'commercial')
  if (path === '/cms' || path.startsWith('/cms/')) return canManage(role, 'content')
  if (path === '/data' || path === '/audience')
    return role === 'admin' || role === 'editor' || role === 'operator'
  if (path === '/campaigns/new') return canManage(role, 'operations')
  return true
}
