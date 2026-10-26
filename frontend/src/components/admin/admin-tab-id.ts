/**
 * The console's tab identifiers.
 *
 * Extracted from `pages/admin/console.tsx` so the tab strip can be a component with its own
 * unit test — the Home/End key handling lived in the page and was therefore covered by nothing
 * in the fast tier, which is how `move(±length)` survived as a no-op.
 *
 * @module components/admin/admin-tab-id
 */

/**
 * Tab identifiers. Kept as a union so a typo in a route segment or a capability id
 * is a compile error rather than a blank screen.
 */
export type AdminTabId =
  | 'dashboard'
  | 'health'
  | 'queues'
  | 'operations'
  | 'attention'
  | 'users'
  | 'support'
  | 'moderation'
  | 'blog'
  | 'content'
  | 'ai-settings'
  | 'email'
  | 'security'
  | 'config'
  | 'settings'
  | 'modules'
  | 'rbac'
  | 'audit';

