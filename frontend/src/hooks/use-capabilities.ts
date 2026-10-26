/**
 * Capability-driven authorisation for the console (REC-018, INV-5).
 *
 * ## The rule this hook exists to enforce
 *
 * **Nothing in this app decides what a person may do by looking at their role
 * name.** The backend resolves authority from persisted role bundles and grants
 * (`services/adminRbac.js`) and publishes the answer at
 * `GET /api/me/capabilities`. This hook consumes that answer.
 *
 * Before this, `console.tsx` contained `if (role === 'AUDITOR') … else if (role ===
 * 'SUPPORT') …`. That produced two defects, both found by probe: an AUDITOR was
 * shown an Operations tab whose feature-flag endpoint answered 403, and a role
 * granted `audit.read` through the API saw nothing change in the UI.
 *
 * ## Failure behaviour
 *
 * If the capability request fails, this hook reports `status: 'error'` and exposes
 * **no** capabilities. It does not fall back to a role-name guess: a guess would
 * re-introduce the exact coupling the backend just removed, and in the failure case
 * it would guess *upward* for ADMIN/SUPER_ADMIN, which is the wrong direction. The
 * console renders an error surface with a retry instead.
 *
 * @module hooks/use-capabilities
 */

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { get } from '@/lib/api-client';

/** Why a surface is not available. `null` when it is. */
export type CapabilityDenialReason = 'missing-permission' | 'super-admin-only';

/** One console surface and whether the caller may open it. */
export interface CapabilityTab {
  id: string;
  label: string;
  group: string;
  allowed: boolean;
  superAdminOnly: boolean;
  /** Machine-readable reason when `allowed` is false, so the UI can explain it. */
  reason: CapabilityDenialReason | null;
  /** The permissions the caller lacks. `['*']` when the refusal is `super-admin-only`. */
  missing: string[];
}

/** Authority provenance, so the console can warn when it is running on the fallback. */
export interface ResolvedAuthority {
  source: string;
  degraded: boolean;
  roles: number;
}

/** `GET /api/me/capabilities` response. */
export interface Capabilities {
  success: true;
  role: string | null;
  tabs: CapabilityTab[];
  /** `tabId → actionName → allowed`. Actions are finer grained than tabs. */
  actions: Record<string, Record<string, boolean>>;
  defaultTab: string | null;
  permissions: string[];
  authority: ResolvedAuthority;
}

/**
 * Runtime contract for the endpoint, and the adapter that produces the typed value.
 *
 * The interfaces above are the source of truth for the app; this function exists so
 * a backend contract change fails **at the boundary** with a message instead of
 * surfacing as `undefined` inside a render three components deep. Normalising
 * defaults here (rather than with `.optional().default()` in the schema) keeps the
 * parsing and the types visibly the same thing.
 *
 * @param {unknown} raw response body
 * @returns {Capabilities}
 * @throws when the payload does not match the contract
 */
export function parseCapabilities(raw: unknown): Capabilities {
  const Row = z.object({
    id: z.string(),
    label: z.string(),
    group: z.string(),
    allowed: z.boolean(),
    superAdminOnly: z.boolean().optional(),
    reason: z.enum(['missing-permission', 'super-admin-only']).nullish(),
    missing: z.array(z.string()).optional(),
  });
  const Contract = z.object({
    success: z.literal(true),
    role: z.string().nullish(),
    tabs: z.array(Row),
    actions: z.record(z.string(), z.record(z.string(), z.boolean())).optional(),
    defaultTab: z.string().nullish(),
    permissions: z.array(z.string()).optional(),
    authority: z.object({ source: z.string(), degraded: z.boolean(), roles: z.number() }),
  });

  const parsed = Contract.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(`Capability contract mismatch at ${issue?.path.join('.') || 'root'}: ${issue?.message || 'invalid payload'}`);
  }
  const value = parsed.data;

  return {
    success: true,
    role: value.role ? String(value.role) : null,
    tabs: value.tabs.map((tab): CapabilityTab => ({
      id: tab.id,
      label: tab.label,
      group: tab.group,
      allowed: tab.allowed,
      superAdminOnly: tab.superAdminOnly ?? false,
      reason: tab.reason ?? null,
      missing: tab.missing ?? [],
    })),
    actions: value.actions ?? {},
    defaultTab: value.defaultTab ? String(value.defaultTab) : null,
    permissions: value.permissions ?? [],
    // Read field by field rather than forwarding the parsed node: this is where the
    // declared interface and the validated payload are made to agree, so a field
    // added to one and not the other is a visible omission here instead of an
    // `undefined` that renders as a blank badge.
    authority: {
      source: String(value.authority?.source ?? 'unknown'),
      degraded: Boolean(value.authority?.degraded),
      roles: Number(value.authority?.roles ?? 0),
    },
  };
}

/** React Query key — exported so mutations can invalidate it. */
export const CAPABILITIES_QUERY_KEY = ['me', 'capabilities'] as const;

/**
 * Resolve the caller's console capabilities.
 *
 * Cached for 60 s rather than indefinitely: a revoked role must stop rendering a
 * console within a minute even if the user never navigates, and every mutation that
 * changes authority invalidates this key explicitly (see `invalidateCapabilities`).
 */
export function useCapabilities() {
  const query = useQuery({
    queryKey: CAPABILITIES_QUERY_KEY,
    queryFn: async (): Promise<Capabilities> => {
      const raw = await get<unknown>('/me/capabilities');
      return parseCapabilities(raw);
    },
    staleTime: 60_000,
    retry: 1,
  });

  const capabilities = query.data;

  /** Is this tab open to the caller? Unknown data means "no". */
  const canOpenTab = useCallback(
    (tabId: string): boolean => capabilities?.tabs.some((tab) => tab.id === tabId && tab.allowed) ?? false,
    [capabilities],
  );

  /** May the caller perform `action` inside `tab`? Unknown data means "no". */
  const canDo = useCallback(
    (tabId: string, action: string): boolean => capabilities?.actions[tabId]?.[action] ?? false,
    [capabilities],
  );

  /** Every tab, allowed and denied, so a screen can explain a refusal. */
  const tabs = capabilities?.tabs ?? [];
  const allowedTabs = tabs.filter((tab) => tab.allowed);
  const defaultTab = capabilities?.defaultTab ?? null;

  return {
    ...query,
    capabilities,
    tabs,
    allowedTabs,
    defaultTab,
    canOpenTab,
    canDo,
    /** `true` when the backend resolved from its fallback literal, not the database. */
    degraded: capabilities?.authority.degraded ?? false,
  };
}

/**
 * Invalidate the capability cache after an authority change.
 *
 * Called by RBAC mutations, and by anything that could alter the caller's own
 * authority. Returns the promise so a mutation can await the refetch if it wants to.
 *
 * @returns {Promise<void>}
 */
export function useInvalidateCapabilities() {
  const queryClient = useQueryClient();
  return useCallback(
    () => queryClient.invalidateQueries({ queryKey: CAPABILITIES_QUERY_KEY }),
    [queryClient],
  );
}
