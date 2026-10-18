/**
 * CompanyProfile — Employer Portal
 *
 * Company branding, verified entity profile, and team culture:
 * - Displays approved employer companies via GET /api/employer/companies
 * - Logo branding assets, industry, website, size, and location
 * - Verification status badges (Approved, Pending, Featured)
 * - Culture highlights and team branding
 */

import React, { useState } from 'react';
import {
  Building2,
  Globe,
  MapPin,
  Users,
  CheckCircle2,
  Clock,
  Star,
  Plus,
  ExternalLink,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useEmployerCompanies, type EmployerCompany } from '@/hooks/use-api-hooks';
import { cn } from '@/lib/utils';

export function CompanyProfile() {
  const { data: companies = [], isLoading } = useEmployerCompanies();
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);

  const activeCompany = companies.find((c) => c.id === selectedCompanyId) || companies[0] || null;

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-ink flex items-center gap-2">
            <Building2 className="size-5 text-accent" />
            Company & Entity Branding
          </h3>
          <p className="text-xs text-ink-muted">
            Manage your verified hiring organization profile, branding assets, and applicant-facing culture.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-pulse">
          <div className="h-64 rounded-xl bg-canvas-soft col-span-1" />
          <div className="h-64 rounded-xl bg-canvas-soft col-span-2" />
        </div>
      ) : companies.length === 0 ? (
        <Card className="border-edge p-8 text-center bg-surface">
          <Building2 className="size-12 text-ink-muted mx-auto mb-3" />
          <h4 className="text-sm font-bold text-ink">No Employer Organization Registered</h4>
          <p className="text-xs text-ink-muted max-w-md mx-auto mt-1">
            To post jobs and evaluate candidates under your company brand, register your employer organization profile.
          </p>
          <Button size="sm" className="mt-4 text-xs font-semibold gap-1.5">
            <Plus className="size-3.5" /> Register Company Entity
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Companies List Selector */}
          <div className="col-span-1 space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              Registered Organizations ({companies.length})
            </p>
            <div className="space-y-2">
              {companies.map((comp) => {
                const isSelected = activeCompany?.id === comp.id;
                return (
                  <div
                    key={comp.id}
                    onClick={() => setSelectedCompanyId(comp.id)}
                    className={cn(
                      'p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between',
                      isSelected
                        ? 'border-accent bg-accent/10 shadow-xs'
                        : 'border-edge bg-surface hover:border-edge-strong'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className="size-9 rounded-lg bg-canvas-soft border border-edge flex items-center justify-center font-bold text-xs text-ink overflow-hidden shrink-0">
                        {comp.logo ? (
                          <img src={comp.logo} alt={comp.name} className="size-full object-cover" />
                        ) : (
                          comp.name.charAt(0).toUpperCase()
                        )}
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-ink flex items-center gap-1.5">
                          {comp.name}
                          {comp.featured && <Star className="size-3 text-amber-500 fill-amber-500" />}
                        </h4>
                        <p className="text-[10px] text-ink-muted capitalize">
                          {comp.status || 'Active Entity'}
                        </p>
                      </div>
                    </div>
                    {isSelected && <CheckCircle2 className="size-4 text-accent" />}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Active Company Details Card */}
          {activeCompany && (
            <Card className="col-span-1 md:col-span-2 border-edge shadow-sm">
              <CardHeader className="border-b border-edge pb-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3.5">
                    <div className="size-14 rounded-xl bg-accent-soft text-accent border border-accent/20 flex items-center justify-center font-extrabold text-xl overflow-hidden shrink-0">
                      {activeCompany.logo ? (
                        <img src={activeCompany.logo} alt={activeCompany.name} className="size-full object-cover" />
                      ) : (
                        activeCompany.name.charAt(0).toUpperCase()
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base font-bold text-ink">
                          {activeCompany.name}
                        </CardTitle>
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                          <ShieldCheck className="size-3" /> Verified Employer
                        </span>
                      </div>
                      <CardDescription className="text-xs text-ink-muted mt-1 flex items-center gap-3">
                        {activeCompany.website && (
                          <a
                            href={activeCompany.website.startsWith('http') ? activeCompany.website : `https://${activeCompany.website}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-accent hover:underline flex items-center gap-1"
                          >
                            <Globe className="size-3" /> {activeCompany.website.replace(/^https?:\/\//, '')}
                          </a>
                        )}
                        <span>Revision #{activeCompany.revision || 1}</span>
                      </CardDescription>
                    </div>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="p-6 space-y-6">
                {/* Brand Highlights */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="p-3 rounded-lg border border-edge bg-canvas-soft">
                    <p className="text-[10px] text-ink-muted uppercase font-semibold">Entity Status</p>
                    <p className="text-xs font-bold text-ink mt-0.5 capitalize">{activeCompany.status || 'Approved'}</p>
                  </div>
                  <div className="p-3 rounded-lg border border-edge bg-canvas-soft">
                    <p className="text-[10px] text-ink-muted uppercase font-semibold">Visibility</p>
                    <p className="text-xs font-bold text-ink mt-0.5">
                      {activeCompany.featured ? 'Featured Partner' : 'Standard Directory'}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg border border-edge bg-canvas-soft">
                    <p className="text-[10px] text-ink-muted uppercase font-semibold">Verified On</p>
                    <p className="text-xs font-bold text-ink mt-0.5">
                      {activeCompany.createdAt ? new Date(activeCompany.createdAt).toLocaleDateString() : 'Active'}
                    </p>
                  </div>
                </div>

                {/* Culture & Hiring Pledge */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-ink flex items-center gap-1.5">
                    <Sparkles className="size-3.5 text-accent" />
                    Employer Brand & Candidate Experience
                  </h4>
                  <p className="text-xs text-ink-muted leading-relaxed">
                    Job listings associated with {activeCompany.name} showcase your verified company badge, direct team messaging, and automated ATS match transparency to attract top engineering and leadership talent.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
