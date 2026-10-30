import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
/**
 * CompanyProfile — Employer Portal
 *
 * Company branding, verified entity profile, and team culture:
 * - Displays approved employer companies via GET /api/employer/companies
 * - Logo branding assets, industry, website, size, and location
 * - Verification status badges (Approved, Pending, Featured)
 * - Culture highlights and team branding
 */

import React, { useState, useEffect } from 'react';
import {
  Building2,
  Globe,
  MapPin,
  CheckCircle2,
  Star,
  Plus,
  ShieldCheck,
  Sparkles,
  Edit2,
  X,
  AlertCircle,
  Image as ImageIcon,
  FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useQueryClient } from '@tanstack/react-query';
import { useEmployerCompanies, type EmployerCompany } from '@/hooks/use-api-hooks';
import { post, patch } from '@/lib/api-client';
import { cn } from '@/lib/utils';

const INDUSTRY_OPTIONS = [
  'Technology',
  'Healthcare',
  'Finance',
  'Education',
  'Retail',
  'Manufacturing',
  'Consulting',
  'Marketing',
  'Real Estate',
  'Hospitality',
  'Transportation',
  'Energy',
  'Media',
  'Government',
  'Non-profit',
  'Other',
];

const COMPANY_SIZE_OPTIONS = [
  '1-10 employees',
  '11-50 employees',
  '51-200 employees',
  '201-500 employees',
  '501-1000 employees',
  '1000+ employees',
];

interface CompanyFormData {
  name: string;
  website: string;
  companyImage: string;
  description: string;
  industry: string;
  size: string;
  location: string;
  address: string;
  phone: string;
  email: string;
}

const INITIAL_FORM_DATA: CompanyFormData = {
  name: '',
  website: '',
  companyImage: '',
  description: '',
  industry: 'Technology',
  size: '11-50 employees',
  location: '',
  address: '',
  phone: '',
  email: '',
};

export function CompanyProfile() {
  const queryClient = useQueryClient();
  const { data: companies = [], isLoading } = useEmployerCompanies();
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<CompanyFormData>(INITIAL_FORM_DATA);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof CompanyFormData, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const activeCompany = companies.find((c) => c.id === selectedCompanyId) || companies[0] || null;

  // Escape key handler for modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && modalOpen) {
        setModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [modalOpen]);

  const openCreateModal = () => {
    setIsEditing(false);
    setFormData(INITIAL_FORM_DATA);
    setFormErrors({});
    setModalOpen(true);
  };

  const openEditModal = (comp: EmployerCompany) => {
    setIsEditing(true);
    setFormData({
      name: comp.name || '',
      website: comp.website || '',
      companyImage: comp.logo || '',
      description: comp.description || '',
      industry: comp.industry || 'Technology',
      size: comp.size || '11-50 employees',
      location: comp.location || '',
      address: (comp as any).address || '',
      phone: (comp as any).phone || '',
      email: (comp as any).email || '',
    });
    setFormErrors({});
    setModalOpen(true);
  };

  const validateForm = () => {
    const errors: Partial<Record<keyof CompanyFormData, string>> = {};
    if (!formData.name.trim()) errors.name = 'Company name is required';
    if (!formData.industry.trim()) errors.industry = 'Industry selection is required';
    if (!formData.size.trim()) errors.size = 'Company size is required';
    if (!formData.location.trim()) errors.location = 'Headquarters location is required';

    if (formData.website.trim()) {
      if (!formData.website.startsWith('https://')) {
        errors.website = 'Website must start with https://';
      }
    }
    if (formData.companyImage.trim()) {
      if (!formData.companyImage.startsWith('https://')) {
        errors.companyImage = 'Image URL must start with https://';
      }
    }
    if (formData.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      errors.email = 'Please enter a valid email address';
    }
    if (formData.phone.trim() && !/^\+?[0-9 ()-]{7,30}$/.test(formData.phone.trim())) {
      errors.phone = 'Please enter a valid phone number';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm() || submitting) return;

    setSubmitting(true);
    try {
      if (isEditing && activeCompany) {
        await patch(`/employer/companies/${activeCompany.id}`, {
          expectedRevision: activeCompany.revision || 1,
          data: formData,
        });
        setNotification({ type: 'success', message: `Company "${formData.name}" updated successfully.` });
      } else {
        await post('/employer/companies', { data: formData });
        setNotification({ type: 'success', message: `Employer entity "${formData.name}" registered successfully.` });
      }
      setModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['employer', 'companies'] });
      setTimeout(() => setNotification(null), 4000);
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Operation failed. Please check inputs.' });
    } finally {
      setSubmitting(false);
    }
  };

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
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={openCreateModal}
            className="text-xs font-semibold gap-1.5"
          >
            <Plus className="size-3.5" /> Register Company Entity
          </Button>
        </div>
      </div>

      {/* Notifications */}
      {notification && (
        <div
          className={cn(
            'p-3.5 rounded-xl border text-xs font-semibold flex items-center gap-2 animate-[fade-in_150ms_ease-out]',
            notification.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/20 text-rose-700 dark:text-rose-300'
          )}
        >
          {notification.type === 'success' ? (
            <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
          ) : (
            <AlertCircle className="size-4 shrink-0 text-rose-600" />
          )}
          <span>{notification.message}</span>
        </div>
      )}

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
          <Button size="sm" onClick={openCreateModal} className="mt-4 text-xs font-semibold gap-1.5">
            <Plus className="size-3.5" /> Register Company Entity
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Companies List Selector */}
          <div className="col-span-1 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wider text-ink-muted">
                Registered Organizations ({companies.length})
              </p>
              <Button
                variant="ghost"
                size="xs"
                onClick={openCreateModal}
                className="h-6 px-2 text-[11px] text-accent font-semibold"
              >
                + Add Entity
              </Button>
            </div>
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
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-ink flex items-center gap-1.5 truncate">
                          {comp.name}
                          {comp.featured && <Star className="size-3 text-amber-500 fill-amber-500 shrink-0" />}
                        </h4>
                        <p className="text-[10px] text-ink-muted capitalize">
                          {comp.industry || comp.status || 'Active Entity'}
                        </p>
                      </div>
                    </div>
                    {isSelected && <CheckCircle2 className="size-4 text-accent shrink-0" />}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Active Company Details Card */}
          {activeCompany && (
            <Card className="col-span-1 md:col-span-2 border-edge shadow-sm">
              <CardHeader className="border-b border-edge pb-4">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
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
                      <CardDescription className="text-xs text-ink-muted mt-1 flex flex-wrap items-center gap-3">
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
                        {activeCompany.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="size-3" /> {activeCompany.location}
                          </span>
                        )}
                        <span>Revision #{activeCompany.revision || 1}</span>
                      </CardDescription>
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEditModal(activeCompany)}
                    className="text-xs font-semibold gap-1.5 self-start"
                  >
                    <Edit2 className="size-3.5" /> Edit Profile
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="p-6 space-y-6">
                {/* Brand Highlights */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 rounded-lg border border-edge bg-canvas-soft">
                    <p className="text-[10px] text-ink-muted uppercase font-semibold">Industry</p>
                    <p className="text-xs font-bold text-ink mt-0.5">{activeCompany.industry || 'Technology'}</p>
                  </div>
                  <div className="p-3 rounded-lg border border-edge bg-canvas-soft">
                    <p className="text-[10px] text-ink-muted uppercase font-semibold">Company Size</p>
                    <p className="text-xs font-bold text-ink mt-0.5">{activeCompany.size || '11-50 employees'}</p>
                  </div>
                  <div className="p-3 rounded-lg border border-edge bg-canvas-soft">
                    <p className="text-[10px] text-ink-muted uppercase font-semibold">Entity Status</p>
                    <p className="text-xs font-bold text-ink mt-0.5 capitalize">{activeCompany.status || 'Approved'}</p>
                  </div>
                  <div className="p-3 rounded-lg border border-edge bg-canvas-soft">
                    <p className="text-[10px] text-ink-muted uppercase font-semibold">Verified On</p>
                    <p className="text-xs font-bold text-ink mt-0.5">
                      {activeCompany.createdAt ? new Date(activeCompany.createdAt).toLocaleDateString() : 'Active'}
                    </p>
                  </div>
                </div>

                {/* Company Overview Description */}
                {activeCompany.description && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-ink flex items-center gap-1.5">
                      <FileText className="size-3.5 text-accent" />
                      About the Company
                    </h4>
                    <p className="text-xs text-ink-muted leading-relaxed whitespace-pre-wrap">
                      {activeCompany.description}
                    </p>
                  </div>
                )}

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

      {/* ─── Add/Edit Company Entity Modal (11-Field Legacy Parity) ─── */}
      {modalOpen && (
        <Dialog open={modalOpen} onOpenChange={value => { if (!submitting) setModalOpen(value); }}>
          <DialogContent hideCloseButton aria-describedby={undefined} className="w-[calc(100%-1rem)] max-w-2xl max-h-[92vh] p-0 gap-0 flex flex-col rounded-2xl md:rounded-3xl bg-surface/95 border-border backdrop-blur-xl overflow-hidden motion-reduce:animate-none">
            {/* Modal Header */}
            <div className="flex min-w-0 shrink-0 items-start justify-between gap-3 border-b border-border bg-neutral-50/50 p-5">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-brand-200 bg-brand-50 text-brand-600">
                  <Building2 className="size-5" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <DialogTitle className="break-words text-base font-bold text-ink">
                    {isEditing ? `Edit ${formData.name || 'Company Profile'}` : 'Register Employer Entity'}
                  </DialogTitle>
                  <p className="break-words text-xs text-ink-muted">
                    {isEditing
                      ? 'Update organizational branding, verified contacts, and culture details.'
                      : 'Create a verified company profile to post jobs and evaluate candidates.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                disabled={submitting}
                className="shrink-0 rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-canvas hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
                aria-label="Close modal"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>

            {/* Modal Form Body */}
            <form onSubmit={handleSubmit} className="min-h-0 min-w-0 flex-1 space-y-5 overflow-y-auto p-5 text-xs sm:p-6">
              {/* Logo Preview Banner */}
              <div className="flex min-w-0 flex-wrap items-center gap-4 rounded-2xl border border-edge bg-canvas-soft p-4">
                <div className="size-16 rounded-xl border border-edge bg-surface flex items-center justify-center overflow-hidden shrink-0 font-extrabold text-xl text-accent">
                  {formData.companyImage.trim() && formData.companyImage.startsWith('https://') ? (
                    <img
                      src={formData.companyImage}
                      alt="Logo preview"
                      className="size-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    formData.name.trim().charAt(0).toUpperCase() || <ImageIcon className="size-6 text-ink-muted" />
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <label className="font-bold text-ink block">Company Logo URL (HTTPS)</label>
                  <Input
                    value={formData.companyImage}
                    onChange={(e) => setFormData({ ...formData, companyImage: e.target.value })}
                    placeholder="https://example.com/logo.png"
                    className="h-8 text-xs font-mono"
                  />
                  {formErrors.companyImage && (
                    <p className="text-[11px] text-rose-500 font-semibold">{formErrors.companyImage}</p>
                  )}
                  <p className="text-[10px] text-ink-muted">
                    Direct public image link (PNG, SVG, or WEBP). Must start with https://
                  </p>
                </div>
              </div>

              {/* Basic Facts: Name & Website */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="font-bold text-ink flex items-center gap-1">
                    <span>Company Name</span>
                    <span className="text-rose-500">*</span>
                  </label>
                  <Input
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. Acme Innovations Corp"
                    className="h-9 text-xs"
                  />
                  {formErrors.name && <p className="text-[11px] text-rose-500 font-semibold">{formErrors.name}</p>}
                </div>

                <div className="space-y-1.5">
                  <label className="font-bold text-ink block">Official Website (HTTPS)</label>
                  <Input
                    value={formData.website}
                    onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                    placeholder="https://company.com"
                    className="h-9 text-xs font-mono"
                  />
                  {formErrors.website && (
                    <p className="text-[11px] text-rose-500 font-semibold">{formErrors.website}</p>
                  )}
                </div>
              </div>

              {/* Industry & Size */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="font-bold text-ink flex items-center gap-1">
                    <span>Industry Sector</span>
                    <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formData.industry}
                    onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg bg-surface border border-edge text-xs text-ink focus:outline-none focus:ring-1 focus:ring-accent"
                  >
                    {INDUSTRY_OPTIONS.map((ind) => (
                      <option key={ind} value={ind}>
                        {ind}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="font-bold text-ink flex items-center gap-1">
                    <span>Organization Size</span>
                    <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formData.size}
                    onChange={(e) => setFormData({ ...formData, size: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg bg-surface border border-edge text-xs text-ink focus:outline-none focus:ring-1 focus:ring-accent"
                  >
                    {COMPANY_SIZE_OPTIONS.map((sz) => (
                      <option key={sz} value={sz}>
                        {sz}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Location & Address */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="font-bold text-ink flex items-center gap-1">
                    <span>Headquarters Location</span>
                    <span className="text-rose-500">*</span>
                  </label>
                  <Input
                    required
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    placeholder="e.g. San Francisco, CA or London, UK"
                    className="h-9 text-xs"
                  />
                  {formErrors.location && (
                    <p className="text-[11px] text-rose-500 font-semibold">{formErrors.location}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="font-bold text-ink block">Street Address / Suite</label>
                  <Input
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    placeholder="e.g. 500 Market St, Suite 400"
                    className="h-9 text-xs"
                  />
                </div>
              </div>

              {/* Contacts: Email & Phone */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="font-bold text-ink block">Recruitment Email</label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="careers@company.com"
                    className="h-9 text-xs"
                  />
                  {formErrors.email && (
                    <p className="text-[11px] text-rose-500 font-semibold">{formErrors.email}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="font-bold text-ink block">Contact Phone Number</label>
                  <Input
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+1 (555) 019-2834"
                    className="h-9 text-xs font-mono"
                  />
                  {formErrors.phone && (
                    <p className="text-[11px] text-rose-500 font-semibold">{formErrors.phone}</p>
                  )}
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <label className="font-bold text-ink block">Company Overview & Culture</label>
                <Textarea
                  rows={4}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Describe your organization's mission, engineering challenges, technology stack, and hiring culture..."
                  className="text-xs resize-y"
                />
              </div>

              {/* Modal Actions Footer */}
              <div className="flex min-w-0 flex-wrap items-center justify-end gap-3 border-t border-edge pt-4">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setModalOpen(false)}
                  disabled={submitting}
                  className="min-w-0 whitespace-normal"
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={submitting} className="min-w-0 whitespace-normal">
                  {submitting ? 'Saving…' : isEditing ? 'Save Changes' : 'Register Entity'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
export default CompanyProfile;

