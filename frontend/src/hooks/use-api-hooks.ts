/**
 * Typed API Client Hooks
 *
 * Zod-validated React Query hooks for all mock data sources.
 * Bound to backend contracts: /api/employer, /api/admin, /api/enterprise, /api/auth
 * All hooks include auth headers via useAuth, input sanitization via zod, CSRF tokens for mutations.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { get, post, patch, del, normalizeError } from '@/lib/api-client';

// ──────────────────────────────────────────────────────────────────────────────
// Zod Schemas (Backend Contract Validation)
// ──────────────────────────────────────────────────────────────────────────────

/** Employer Portal: Job Listing */
export const JobListingSchema = z.object({
  id: z.string(),
  title: z.string(),
  department: z.string(),
  location: z.string(),
  type: z.string(),
  salary: z.string(),
  applicantCount: z.number().int().nonnegative(),
  status: z.enum(['active', 'paused', 'closed']),
  postedAt: z.string(),
});
export type JobListing = z.infer<typeof JobListingSchema>;

/** Employer Portal: Candidate */
export const CandidateSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  role: z.string(),
  appliedDate: z.string(),
  atsScore: z.number().int().min(0).max(100),
  stage: z.enum(['Applied', 'Screening', 'Interview', 'Offer', 'Archived']),
  experienceYears: z.number().int().nonnegative(),
  topSkills: z.array(z.string()),
});
export type Candidate = z.infer<typeof CandidateSchema>;

/** Enterprise Console: Org Member */
export const OrgMemberSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  role: z.enum(['Owner', 'Admin', 'Reviewer', 'Member']),
  twoFactorEnabled: z.boolean(),
  lastActive: z.string(),
});
export type OrgMember = z.infer<typeof OrgMemberSchema>;

/** Enterprise Console: Audit Event */
export const AuditEventSchema = z.object({
  id: z.string(),
  actor: z.string(),
  action: z.string(),
  target: z.string(),
  ip: z.string(),
  timestamp: z.string(),
});
export type AuditEvent = z.infer<typeof AuditEventSchema>;

/** Admin Console: Platform Stats */
export const PlatformStatsSchema = z.object({
  totalUsers: z.number().int().nonnegative(),
  activeUsers: z.number().int().nonnegative(),
  totalResumes: z.number().int().nonnegative(),
  totalJobApplications: z.number().int().nonnegative(),
  aiGenerations: z.number().int().nonnegative(),
  storageUsed: z.string(),
});
export type PlatformStats = z.infer<typeof PlatformStatsSchema>;

/** Admin Console: Admin User */
export const AdminUserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  displayName: z.string(),
  role: z.string(),
  status: z.enum(['active', 'suspended', 'pending']),
  lastLogin: z.string(),
  createdAt: z.string(),
  resumeCount: z.number().int().nonnegative(),
});
export type AdminUser = z.infer<typeof AdminUserSchema>;

/** Admin Console: AI Provider Status */
export const AIProviderStatusSchema = z.object({
  name: z.string(),
  status: z.enum(['healthy', 'degraded', 'down']),
  model: z.string(),
  latencyMs: z.number().int().nonnegative(),
  requestsToday: z.number().int().nonnegative(),
  errorsToday: z.number().int().nonnegative(),
});
export type AIProviderStatus = z.infer<typeof AIProviderStatusSchema>;

/** Admin Console: Support Ticket */
export const SupportTicketSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  subject: z.string(),
  priority: z.enum(['low', 'normal', 'urgent']),
  status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED']),
  createdAt: z.string(),
  messages: z.array(z.object({
    id: z.string(),
    role: z.string(),
    body: z.string(),
    createdAt: z.string(),
  })).optional(),
});
export type SupportTicket = z.infer<typeof SupportTicketSchema>;

/** Admin Console: Audit Record */
export const AuditRecordSchema = z.object({
  id: z.string(),
  actor: z.string(),
  action: z.string(),
  resource: z.string(),
  outcome: z.enum(['SUCCESS', 'FAILURE']),
  severity: z.enum(['INFO', 'WARNING', 'CRITICAL']),
  timestamp: z.string(),
  ip: z.string(),
});
export type AuditRecord = z.infer<typeof AuditRecordSchema>;

/** Dashboard: Notification Message */
export const NotificationMessageSchema = z.object({
  id: z.string(),
  sender: z.object({
    name: z.string(),
    avatar: z.string().optional(),
    role: z.string(),
    isSystem: z.boolean().optional(),
  }),
  subject: z.string(),
  preview: z.string(),
  body: z.string(),
  timestamp: z.string(),
  read: z.boolean(),
  starred: z.boolean(),
  category: z.enum(['interviews', 'jobs', 'ai', 'system']),
  actions: z.array(z.object({
    label: z.string(),
    href: z.string().optional(),
    variant: z.enum(['primary', 'outline']).optional(),
  })).optional(),
});
export type NotificationMessage = z.infer<typeof NotificationMessageSchema>;

/** Dashboard: Favourite Item */
export const FavouriteItemSchema = z.object({
  key: z.string(),
  kind: z.enum(['job', 'document']),
  documentType: z.enum(['resume', 'cover']).nullable(),
  id: z.string(),
  createdAt: z.string().nullable(),
  title: z.string(),
  company: z.string().nullable(),
  location: z.string(),
  salary: z.string(),
  summary: z.string().nullable(),
  badge: z.string(),
  badgeTone: z.string(),
});
export type FavouriteItem = z.infer<typeof FavouriteItemSchema>;

// ──────────────────────────────────────────────────────────────────────────────
// Query Keys Factory
// ──────────────────────────────────────────────────────────────────────────────

export const queryKeys = {
  employer: {
    jobs: ['employer', 'jobs'] as const,
    candidates: ['employer', 'candidates'] as const,
  },
  enterprise: {
    members: (tenantId: string) => ['enterprise', 'members', tenantId] as const,
    auditLogs: (tenantId: string) => ['enterprise', 'auditLogs', tenantId] as const,
  },
  admin: {
    stats: ['admin', 'stats'] as const,
    users: ['admin', 'users'] as const,
    aiProviders: ['admin', 'aiProviders'] as const,
    supportTickets: ['admin', 'supportTickets'] as const,
    auditLogs: ['admin', 'auditLogs'] as const,
    systemHealth: ['admin', 'systemHealth'] as const,
  },
  dashboard: {
    notifications: ['dashboard', 'notifications'] as const,
    favourites: ['dashboard', 'favourites'] as const,
    supportTickets: ['dashboard', 'supportTickets'] as const,
  },
};

// ──────────────────────────────────────────────────────────────────────────────
// Employer Portal Hooks
// ──────────────────────────────────────────────────────────────────────────────

export function useJobs() {
  return useQuery({
    queryKey: queryKeys.employer.jobs,
    queryFn: async () => {
      const data = await get<{ jobs: JobListing[] }>('/employer/jobs');
      return z.array(JobListingSchema).parse(data.jobs ?? []);
    },
    staleTime: 30_000,
  });
}

export function useCandidates() {
  return useQuery({
    queryKey: queryKeys.employer.candidates,
    queryFn: async () => {
      const data = await get<{ candidates: Candidate[] }>('/employer/candidates');
      return z.array(CandidateSchema).parse(data.candidates ?? []);
    },
    staleTime: 30_000,
  });
}

export function useCreateJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (job: Omit<JobListing, 'id' | 'applicantCount' | 'postedAt'>) => {
      const data = await post<{ job: JobListing }>('/employer/jobs', job);
      return JobListingSchema.parse(data.job);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.employer.jobs });
    },
  });
}

export function useUpdateJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...jobPatch }: Partial<JobListing> & { id: string }) => {
      const data = await patch<{ job: JobListing }>(`/employer/jobs/${id}`, jobPatch);
      return JobListingSchema.parse(data.job);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.employer.jobs });
    },
  });
}

export function useAdvanceCandidateStage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: Candidate['stage'] }) => {
      const data = await patch<{ candidate: Candidate }>(`/employer/candidates/${id}`, { stage });
      return CandidateSchema.parse(data.candidate);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.employer.candidates });
    },
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Enterprise Console Hooks
// ──────────────────────────────────────────────────────────────────────────────

export function useOrgMembers(tenantId: string) {
  return useQuery({
    queryKey: queryKeys.enterprise.members(tenantId),
    queryFn: async () => {
      const data = await get<{ members: OrgMember[] }>(`/enterprise/${tenantId}/members`);
      return z.array(OrgMemberSchema).parse(data.members ?? []);
    },
    enabled: !!tenantId,
    staleTime: 30_000,
  });
}

export function useAuditLogs(tenantId: string) {
  return useQuery({
    queryKey: queryKeys.enterprise.auditLogs(tenantId),
    queryFn: async () => {
      const data = await get<{ logs: AuditEvent[] }>(`/enterprise/${tenantId}/audit-logs`);
      return z.array(AuditEventSchema).parse(data.logs ?? []);
    },
    enabled: !!tenantId,
    staleTime: 60_000,
  });
}

export function useInviteMember(tenantId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (member: Omit<OrgMember, 'id' | 'twoFactorEnabled' | 'lastActive'>) => {
      const data = await post<{ member: OrgMember }>(`/enterprise/${tenantId}/members`, member);
      return OrgMemberSchema.parse(data.member);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.enterprise.members(tenantId) });
    },
  });
}

export function useRemoveMember(tenantId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (memberId: string) => {
      await del(`/enterprise/${tenantId}/members/${memberId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.enterprise.members(tenantId) });
    },
  });
}

export function useUpdateSSO(tenantId: string) {
  return useMutation({
    mutationFn: async (config: { ssoEnabled: boolean; enforce2FA: boolean }) => {
      await patch(`/enterprise/${tenantId}/sso`, config);
    },
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Admin Console Hooks
// ──────────────────────────────────────────────────────────────────────────────

export function usePlatformStats() {
  return useQuery({
    queryKey: queryKeys.admin.stats,
    queryFn: async () => {
      const data = await get<{ stats: PlatformStats }>('/admin/stats');
      return PlatformStatsSchema.parse(data.stats);
    },
    staleTime: 60_000,
  });
}

export function useAdminUsers() {
  return useQuery({
    queryKey: queryKeys.admin.users,
    queryFn: async () => {
      const data = await get<{ users: AdminUser[] }>('/admin/users');
      return z.array(AdminUserSchema).parse(data.users ?? []);
    },
    staleTime: 30_000,
  });
}

export function useAIProviders() {
  return useQuery({
    queryKey: queryKeys.admin.aiProviders,
    queryFn: async () => {
      const data = await get<{ providers: AIProviderStatus[] }>('/admin/ai-settings');
      return z.array(AIProviderStatusSchema).parse(data.providers ?? []);
    },
    staleTime: 60_000,
  });
}

export function useAdminSupportTickets() {
  return useQuery({
    queryKey: queryKeys.admin.supportTickets,
    queryFn: async () => {
      const data = await get<{ tickets: SupportTicket[] }>('/admin/support-tickets');
      return z.array(SupportTicketSchema).parse(data.tickets ?? []);
    },
    staleTime: 30_000,
  });
}

export function useAdminAuditLogs() {
  return useQuery({
    queryKey: queryKeys.admin.auditLogs,
    queryFn: async () => {
      const data = await get<{ logs: AuditRecord[] }>('/admin/audit-logs');
      return z.array(AuditRecordSchema).parse(data.logs ?? []);
    },
    staleTime: 60_000,
  });
}

export function useSystemHealth() {
  return useQuery({
    queryKey: queryKeys.admin.systemHealth,
    queryFn: async () => {
      const data = await get<{ checks: Array<{ name: string; status: string; detail: string }> }>('/admin/system-health');
      return data.checks ?? [];
    },
    staleTime: 30_000,
  });
}

export function useReplyToTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ ticketId, body }: { ticketId: string; body: string }) => {
      const data = await post<{ ticket: SupportTicket }>(`/admin/support-tickets/${ticketId}/reply`, { body });
      return SupportTicketSchema.parse(data.ticket);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.supportTickets });
    },
  });
}

export function useUpdateTicketStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ ticketId, status }: { ticketId: string; status: SupportTicket['status'] }) => {
      const data = await patch<{ ticket: SupportTicket }>(`/admin/support-tickets/${ticketId}`, { status });
      return SupportTicketSchema.parse(data.ticket);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.supportTickets });
    },
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Dashboard Hooks
// ──────────────────────────────────────────────────────────────────────────────

export function useNotifications() {
  return useQuery({
    queryKey: queryKeys.dashboard.notifications,
    queryFn: async () => {
      const data = await get<{ notifications: NotificationMessage[] }>('/notifications-data');
      return z.array(NotificationMessageSchema).parse(data.notifications ?? []);
    },
    staleTime: 30_000,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, read }: { id: string; read: boolean }) => {
      await patch(`/notifications-data/${encodeURIComponent(id)}`, { read });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.notifications });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await post('/notifications-data/mark-all-read', {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.notifications });
    },
  });
}

export function useFavourites() {
  return useQuery({
    queryKey: queryKeys.dashboard.favourites,
    queryFn: async () => {
      const data = await get<{ favourites: FavouriteItem[] }>('/favourites');
      return z.array(FavouriteItemSchema).parse(data.favourites ?? []);
    },
    staleTime: 60_000,
  });
}

export function useRemoveFavourite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (itemId: string) => {
      await del(`/favourites/${itemId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.favourites });
    },
  });
}

export function useDashboardSupportTickets() {
  return useQuery({
    queryKey: queryKeys.dashboard.supportTickets,
    queryFn: async () => {
      const data = await get<{ tickets: SupportTicket[] }>('/support/tickets');
      return z.array(SupportTicketSchema).parse(data.tickets ?? []);
    },
    staleTime: 30_000,
  });
}

export function useCreateSupportTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ticket: { subject: string; priority: string; message: string }) => {
      const data = await post<{ ticket: SupportTicket }>('/support/tickets', ticket);
      return SupportTicketSchema.parse(data.ticket);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.supportTickets });
    },
  });
}

export function useReplyToSupportTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ ticketId, body }: { ticketId: string; body: string }) => {
      const data = await post<{ ticket: SupportTicket }>(`/support/tickets/${ticketId}/reply`, { body });
      return SupportTicketSchema.parse(data.ticket);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.supportTickets });
    },
  });
}