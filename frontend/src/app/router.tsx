/**
 * Application Router
 *
 * Central route configuration for the entire IME365 application.
 * Preserves all existing backend-supported route URLs for backward compatibility.
 */

import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { PageSpinner } from '@/components/ui/loading';
import { RouteErrorBoundary } from '@/components/guards/route-error-boundary';
import { RequireAuth, RedirectIfAuthenticated } from '@/components/guards/require-auth';
import { RequireExportAccess } from '@/components/guards/require-export-access';
import { AppShell } from '@/components/layout/app-shell';
import { CubaAppShell } from '@/components/layout/cuba-app-shell';


// ─── Lazy-loaded pages ───
const LandingPage = lazy(() => import('@/pages/landing').then((m) => ({ default: m.LandingPage })));
const LoginPage = lazy(() => import('@/pages/auth/login').then((m) => ({ default: m.LoginPage })));
const DashboardOverview = lazy(() => import('@/pages/dashboard/overview').then((m) => ({ default: m.DashboardOverview })));
const ResumesPage = lazy(() => import('@/pages/dashboard/resumes').then((m) => ({ default: m.ResumesPage })));
const SettingsPage = lazy(() => import('@/pages/dashboard/settings').then((m) => ({ default: m.SettingsPage })));
const JobTrackerPage = lazy(() => import('@/pages/dashboard/job-tracker').then((m) => ({ default: m.JobTrackerPage })));
const InterviewCoachPage = lazy(() => import('@/pages/dashboard/interview-coach').then((m) => ({ default: m.InterviewCoachPage })));
const CoverLettersPage = lazy(() => import('@/pages/dashboard/cover-letters').then((m) => ({ default: m.CoverLettersPage })));
const ResumeBuilderPage = lazy(() => import('@/pages/dashboard/resume-builder').then((m) => ({ default: m.ResumeBuilderPage })));
const AdminConsolePage = lazy(() => import('@/pages/admin/console').then((m) => ({ default: m.AdminConsolePage })));
const JobsPortalPage = lazy(() => import('@/pages/jobs/portal').then((m) => ({ default: m.JobsPortalPage })));
const RegionalJobsPage = lazy(() => import('@/pages/jobs/regional-hub').then((m) => ({ default: m.RegionalJobsPage })));
const BlogPage = lazy(() => import('@/pages/blog/index').then((m) => ({ default: m.BlogPage })));
const ATSScorePage = lazy(() => import('@/pages/dashboard/ats-score').then((m) => ({ default: m.ATSScorePage })));
const PricingPage = lazy(() => import('@/pages/billing/pricing').then((m) => ({ default: m.PricingPage })));
const FeaturesPage = lazy(() => import('@/pages/features/index').then((m) => ({ default: m.FeaturesPage })));
const ContactPage = lazy(() => import('@/pages/cms/index').then((m) => ({ default: m.ContactPage })));
const CMSPage = lazy(() => import('@/pages/cms/index').then((m) => ({ default: m.CMSPage })));
const AIAssistantPage = lazy(() => import('@/pages/dashboard/ai-assistant').then((m) => ({ default: m.AIAssistantPage })));
const PortfolioBuilderPage = lazy(() => import('@/pages/portfolio/builder').then((m) => ({ default: m.PortfolioBuilderPage })));
const PortfolioGalleryPage = lazy(() => import('@/pages/portfolio/gallery').then((m) => ({ default: m.PortfolioGalleryPage })));
const PublicPortfolioPage = lazy(() => import('@/pages/portfolio/public-portfolio').then((m) => ({ default: m.PublicPortfolioPage })));
const EmployerPortalPage = lazy(() => import('@/pages/employer/portal').then((m) => ({ default: m.EmployerPortalPage })));
const EnterpriseConsolePage = lazy(() => import('@/pages/enterprise/console').then((m) => ({ default: m.EnterpriseConsolePage })));
const MessagesPage = lazy(() => import('@/pages/dashboard/messages').then((m) => ({ default: m.MessagesPage })));
const FavouritesPage = lazy(() => import('@/pages/dashboard/favourites').then((m) => ({ default: m.FavouritesPage })));
const NotificationsPage = lazy(() => import('@/pages/dashboard/notifications').then((m) => ({ default: m.NotificationsPage })));
const SupportPage = lazy(() => import('@/pages/dashboard/support').then((m) => ({ default: m.SupportPage })));
const SharedResumePage = lazy(() => import('@/pages/shared/resume-view').then((m) => ({ default: m.SharedResumePage })));
const BlogEditorPage = lazy(() => import('@/pages/blog/editor').then((m) => ({ default: m.BlogEditorPage })));
const CoverLetterBuilderPage = lazy(() => import('@/pages/dashboard/cover-letter-builder').then((m) => ({ default: m.CoverLetterBuilderPage })));
const NotFoundPage = lazy(() => import('@/pages/placeholder').then((m) => ({ default: m.NotFoundPage })));
const CVRendererPage = lazy(() => import('@/pages/export/cv-renderer').then((m) => ({ default: m.CVRendererPage })));

export function AppRouter() {
  return (
    <BrowserRouter>
      <RouteErrorBoundary>
        <Suspense fallback={<PageSpinner />}>
          <Routes>
            {/* ─── Public Routes ─── */}
            <Route path="/" element={<LandingPage />} />
            <Route
              path="/login"
              element={
                <RedirectIfAuthenticated>
                  <LoginPage />
                </RedirectIfAuthenticated>
              }
            />
            <Route path="/sign-up" element={<Navigate to="/login" replace />} />
            <Route path="/front" element={<Navigate to="/" replace />} />
            <Route path="/features" element={<FeaturesPage />} />
            <Route path="/pricing" element={<PricingPage />} />
            <Route path="/contact" element={<ContactPage />} />

            {/* ─── Blog ─── */}
            <Route path="/blog" element={<BlogPage />} />
            <Route path="/blog/:slug" element={<BlogPage />} />
            <Route
              path="/blog-editor"
              element={<RequireAuth roles={['ADMIN', 'SUPER_ADMIN']}><AppShell><BlogEditorPage /></AppShell></RequireAuth>}
            />
            <Route
              path="/blog-editor/:postId"
              element={<RequireAuth roles={['ADMIN', 'SUPER_ADMIN']}><AppShell><BlogEditorPage /></AppShell></RequireAuth>}
            />

            {/* ─── Jobs (public) ─── */}
            <Route path="/jobs" element={<JobsPortalPage />} />
            <Route path="/jobs/browse" element={<JobsPortalPage />} />
            <Route path="/jobs/portal" element={<JobsPortalPage />} />
            <Route path="/jobs/portal/:jobId" element={<JobsPortalPage />} />
            <Route path="/jobs/categories" element={<JobsPortalPage />} />
            <Route path="/jobs/category/:catName" element={<JobsPortalPage />} />
            <Route path="/jobs/city/:slug" element={<RegionalJobsPage />} />
            <Route path="/jobs/in/:slug" element={<RegionalJobsPage />} />

            {/* ─── Portfolio (public) ─── */}
            <Route path="/portfolios" element={<PortfolioGalleryPage />} />
            <Route path="/portfolio/:slug" element={<PublicPortfolioPage />} />

            {/* ─── Billing & Checkout (mixed) ─── */}
            <Route path="/billing/plans" element={<PricingPage />} />
            <Route path="/billing/checkout" element={<PricingPage />} />
            <Route path="/checkout" element={<PricingPage />} />

            {/* ─── CMS Pages ─── */}
            <Route path="/p/:custompage" element={<CMSPage />} />
            <Route path="/shared/:resumeId" element={<SharedResumePage />} />

            {/* ─── Authenticated — Candidate Dashboard (CubaAppShell) ─── */}
            <Route
              path="/dashboard"
              element={
                <RequireAuth>
                  <CubaAppShell><DashboardOverview /></CubaAppShell>
                </RequireAuth>
              }
            />
            <Route
              path="/dashboard/resumes"
              element={
                <RequireAuth>
                  <CubaAppShell><ResumesPage /></CubaAppShell>
                </RequireAuth>
              }
            />
            <Route
              path="/dashboard/ats"
              element={<RequireAuth><CubaAppShell><ATSScorePage /></CubaAppShell></RequireAuth>}
            />
            <Route
              path="/dashboard/job-tracker/*"
              element={<RequireAuth><CubaAppShell><JobTrackerPage /></CubaAppShell></RequireAuth>}
            />
            <Route
              path="/dashboard/job-tracker"
              element={<RequireAuth><CubaAppShell><JobTrackerPage /></CubaAppShell></RequireAuth>}
            />
            <Route
              path="/dashboard/jobs/*"
              element={<RequireAuth><CubaAppShell><JobsPortalPage /></CubaAppShell></RequireAuth>}
            />
            <Route
              path="/dashboard/jobs"
              element={<RequireAuth><CubaAppShell><JobsPortalPage /></CubaAppShell></RequireAuth>}
            />
            <Route
              path="/dashboard/applied-jobs"
              element={<RequireAuth><CubaAppShell><JobTrackerPage /></CubaAppShell></RequireAuth>}
            />
            <Route
              path="/dashboard/interview/*"
              element={<Navigate to="/dashboard/interviews" replace />}
            />
            <Route
              path="/dashboard/interview"
              element={<Navigate to="/dashboard/interviews" replace />}
            />
            <Route
              path="/dashboard/interviews/*"
              element={<RequireAuth><CubaAppShell><InterviewCoachPage /></CubaAppShell></RequireAuth>}
            />
            <Route
              path="/dashboard/cover-letters/*"
              element={<RequireAuth><CubaAppShell><CoverLettersPage /></CubaAppShell></RequireAuth>}
            />
            {/* Legacy alias (src/components/Dashboard/DashboardMain: path="cv" → /dashboard/cover-letters). */}
            <Route path="/dashboard/cv" element={<Navigate to="/dashboard/cover-letters" replace />} />
            <Route
              path="/dashboard/ats-score"
              element={<RequireAuth><CubaAppShell><ATSScorePage /></CubaAppShell></RequireAuth>}
            />
            <Route
              path="/dashboard/portfolio/*"
              element={<RequireAuth><CubaAppShell><PortfolioBuilderPage /></CubaAppShell></RequireAuth>}
            />
            <Route
              path="/dashboard/ai/*"
              element={<RequireAuth><CubaAppShell><AIAssistantPage /></CubaAppShell></RequireAuth>}
            />
            <Route
              path="/dashboard/messages/*"
              element={<RequireAuth><CubaAppShell><MessagesPage /></CubaAppShell></RequireAuth>}
            />
            <Route
              path="/dashboard/messages"
              element={<RequireAuth><CubaAppShell><MessagesPage /></CubaAppShell></RequireAuth>}
            />
            <Route
              path="/dashboard/favourites"
              element={<RequireAuth><CubaAppShell><FavouritesPage /></CubaAppShell></RequireAuth>}
            />
            <Route
              path="/dashboard/favorites"
              element={<Navigate to="/dashboard/favourites" replace />}
            />
            <Route
              path="/dashboard/plans"
              element={<Navigate to="/pricing" replace />}
            />
            <Route
              path="/dashboard/notifications"
              element={<RequireAuth><CubaAppShell><NotificationsPage /></CubaAppShell></RequireAuth>}
            />
            <Route
              path="/dashboard/support"
              element={<RequireAuth><CubaAppShell><SupportPage /></CubaAppShell></RequireAuth>}
            />
            <Route
              path="/dashboard/settings/*"
              element={<RequireAuth><CubaAppShell><SettingsPage /></CubaAppShell></RequireAuth>}
            />

            {/* ─── Resume Builder ─── */}
            <Route
              path="/build-resume/*"
              element={<RequireAuth><CubaAppShell><ResumeBuilderPage /></CubaAppShell></RequireAuth>}
            />
            <Route
              path="/build-resume"
              element={<RequireAuth><CubaAppShell><ResumeBuilderPage /></CubaAppShell></RequireAuth>}
            />
            <Route
              path="/create-resume/*"
              element={<RequireAuth><Navigate to="/build-resume" replace /></RequireAuth>}
            />
            <Route path="/create-resume" element={<Navigate to="/build-resume" replace />} />

            {/* ─── Cover Letters ─── */}
            <Route
              path="/coverletter/*"
              element={<RequireAuth><CubaAppShell><CoverLetterBuilderPage /></CubaAppShell></RequireAuth>}
            />
            <Route
              path="/cover-letter/*"
              element={<RequireAuth><CubaAppShell><CoverLetterBuilderPage /></CubaAppShell></RequireAuth>}
            />

            {/* ─── Portfolio Builder ─── */}
            <Route
              path="/portfolio/builder"
              element={<RequireAuth><CubaAppShell><PortfolioBuilderPage /></CubaAppShell></RequireAuth>}
            />

            {/* ─── Employer Portal ─── */}
            <Route
              path="/employer/*"
              element={<RequireAuth><CubaAppShell><EmployerPortalPage /></CubaAppShell></RequireAuth>}
            />

            {/* ─── Enterprise Console ─── */}
            <Route
              path="/org/:slug/*"
              element={<RequireAuth><CubaAppShell><EnterpriseConsolePage /></CubaAppShell></RequireAuth>}
            />
            <Route
              path="/org/*"
              element={<RequireAuth><CubaAppShell><EnterpriseConsolePage /></CubaAppShell></RequireAuth>}
            />

            {/* ─── Admin Console ─── */}
            <Route
              path="/admin/*"
              element={<RequireAuth roles={['ADMIN', 'SUPER_ADMIN']}><CubaAppShell><AdminConsolePage /></CubaAppShell></RequireAuth>}
            />

            {/* ─── Blog Editor ─── */}
            <Route
              path="/blog-editor/:postId"
              element={<RequireAuth roles={['ADMIN', 'SUPER_ADMIN']}><CubaAppShell><BlogEditorPage /></CubaAppShell></RequireAuth>}
            />
            <Route
              path="/blog-editor"
              element={<RequireAuth roles={['ADMIN', 'SUPER_ADMIN']}><CubaAppShell><BlogEditorPage /></CubaAppShell></RequireAuth>}
            />

            {/* ─── Legacy Redirects (backward compatibility) ─── */}
            <Route path="/enterprise/*" element={<RequireAuth><LegacyRedirect from="/enterprise" to="/org" /></RequireAuth>} />
            <Route path="/dashboard2/*" element={<RequireAuth><LegacyRedirect from="/dashboard2" to="/dashboard" /></RequireAuth>} />
            <Route path="/dashboard2" element={<RequireAuth><Navigate to="/dashboard" replace /></RequireAuth>} />
            <Route path="/adm/*" element={<RequireAuth><LegacyRedirect from="/adm" to="/admin" /></RequireAuth>} />
            <Route path="/platform/*" element={<RequireAuth><LegacyRedirect from="/platform" to="/admin" /></RequireAuth>} />
            <Route path="/resume/:step" element={<Navigate to="/build-resume/heading" replace />} />
            <Route path="/resume-builder" element={<Navigate to="/build-resume" replace />} />
            <Route path="/resume-builder/*" element={<Navigate to="/build-resume" replace />} />
            <Route path="/resumes" element={<Navigate to="/dashboard/resumes" replace />} />
            <Route path="/resumes/*" element={<Navigate to="/dashboard/resumes" replace />} />
            <Route path="/templates" element={<Navigate to="/#templates" replace />} />
            <Route path="/faq" element={<Navigate to="/#faqs" replace />} />
            <Route path="/faqs" element={<Navigate to="/#faqs" replace />} />
            <Route path="/plans" element={<Navigate to="/pricing" replace />} />
            <Route path="/career-resources" element={<Navigate to="/blog" replace />} />
            <Route path="/privacy" element={<Navigate to="/p/privacy-policy" replace />} />
            <Route path="/terms" element={<Navigate to="/p/terms-of-service" replace />} />
            <Route path="/cookies" element={<Navigate to="/p/cookie-policy" replace />} />
            <Route path="/about" element={<Navigate to="/p/about-us" replace />} />
            <Route path="/about-us" element={<Navigate to="/p/about-us" replace />} />

            {/* Direct Full-Screen Preview Deep Link */}
            <Route
              path="/preview/:resumeId"
              element={<RequireExportAccess><CVRendererPage /></RequireExportAccess>}
            />

            {/* ─── Export Routes (preserve contract) ─── */}
            {/*
              CRITICAL FIX: Export routes MUST use RequireExportAccess to allow
              headless Chromium PDF rendering via #renderToken=... URL fragment authentication.
              This prevents redirect to /login for automated PDF generation.
            */}
            {Array.from({ length: 100 }, (_, i) => i + 1).map((num) => (
              <Route
                key={`cv-${num}`}
                path={`/export/Cv${num}/:resumeId/:language`}
                element={<RequireExportAccess><CVRendererPage /></RequireExportAccess>}
              />
            ))}
            {Array.from({ length: 4 }, (_, i) => i + 1).map((num) => (
              <Route
                key={`cover-${num}`}
                path={`/export/Cover${num}/:resumeId/:language`}
                element={<RequireExportAccess><CVRendererPage /></RequireExportAccess>}
              />
            ))}
            <Route
              path="/export/:templateId/:resumeId/:language"
              element={<RequireExportAccess><CVRendererPage /></RequireExportAccess>}
            />

            {/* ─── Catch-all ─── */}
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </RouteErrorBoundary>
    </BrowserRouter>
  );
}

/** Utility: redirect legacy paths preserving subpath and query */
function LegacyRedirect({ from, to }: { from: string; to: string }) {
  const path = window.location.pathname.replace(new RegExp(`^${from}`), to) || to;
  const search = window.location.search;
  const hash = window.location.hash;
  return <Navigate to={`${path}${search}${hash}`} replace />;
}
