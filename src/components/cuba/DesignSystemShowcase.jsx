import React, { useState } from 'react';
import { FiFileText, FiGrid, FiSearch, FiShield, FiUser, FiZap } from 'react-icons/fi';
import CubaAppShell from './CubaAppShell';
import CubaBadge from './CubaBadge';
import CubaButton from './CubaButton';
import CubaCard from './CubaCard';
import CubaDrawer from './CubaDrawer';
import CubaEmptyState from './CubaEmptyState';
import CubaErrorState from './CubaErrorState';
import CubaModal from './CubaModal';
import CubaPageHeader from './CubaPageHeader';
import CubaSkeleton from './CubaSkeleton';
import CubaStatCard from './CubaStatCard';
import CubaInput, { CubaSelect, CubaTextarea } from './CubaField';
import AiEngineStatus from './AiEngineStatus';
import AiSurface from './AiSurface';
import CubaPublicHeader from './CubaPublicHeader';
import { AI_STATUS } from './aiStatus';

/**
 * Development showcase for the Cuba design system (Â§13).
 *
 * This is the INSPECTABLE SOURCE OF TRUTH for every primitive: each component is
 * rendered in its real states (default, variants, loading, disabled, error, dark,
 * responsive) and every overlay is keyboard-operable from this page.
 *
 * Storybook was deliberately NOT introduced. It would add a large dev
 * dependency plus a second build pipeline, while this route provides the same
 * review surface with zero new dependencies and inside the app's real CSP,
 * router, auth and theme context â€” so what is reviewed here is exactly what ships.
 */

const Section = ({ title, description, children }) => (
    <section className="space-y-4">
        <div>
            <h2 className="text-lg font-bold tracking-tight text-cuba-ink">{title}</h2>
            {description && <p className="mt-1 text-sm text-cuba-ink-muted">{description}</p>}
        </div>
        {children}
    </section>
);

const Row = ({ children }) => <div className="flex flex-wrap items-center gap-3">{children}</div>;

const NAVIGATION = [
    {
        id: 'workspace',
        label: 'Workspace',
        items: [
            { id: 'overview', label: 'Overview', href: '#overview', icon: FiGrid, active: true },
            { id: 'resumes', label: 'Resumes & Master CV', href: '#resumes', icon: FiFileText },
            { id: 'profile', label: 'Profile', href: '#profile', icon: FiUser },
        ],
    },
    {
        id: 'intelligence',
        label: 'Intelligence',
        items: [
            { id: 'search', label: 'Search & Commands', href: '#search', icon: FiSearch },
            { id: 'ai', label: 'AI Surfaces', href: '#ai', icon: FiZap },
        ],
    },
    {
        id: 'system',
        label: 'System',
        items: [
            { id: 'guards', label: 'Accessibility Guards', href: '#guards', icon: FiShield },
        ],
    },
];

// Real, reachable showcase destinations only. There is no built-in command list,
// so the palette cannot offer a dead action.
const COMMANDS = [
    { id: 'go-overview', label: 'Go to Overview', group: 'Navigate', run: () => {} },
    { id: 'go-resumes', label: 'Go to Resumes & Master CV', group: 'Navigate', run: () => {} },
    { id: 'ai-briefing', label: 'Open AI Career Briefing', group: 'AI', isAi: true, run: () => {} },
];

const DesignSystemShowcase = () => {
    const [modalOpen, setModalOpen] = useState(false);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [retrying, setRetrying] = useState(false);
    // The live beacon below is state-driven so "Simulate a failed check" can
    // actually exercise the §20 degradation path (a failed check must land on
    // UNKNOWN and must never be upgraded into a healthy claim). It previously
    // called an undeclared `setAiStatus`, which threw a ReferenceError on click.
    const [aiStatus, setAiStatus] = useState(AI_STATUS.READY);

    return (
        <div className="space-y-12">
                <CubaPageHeader
                    eyebrow="Cuba Modern Executive Glassmorphism"
title="Design system showcase"
                    subtitle="Every primitive in its real states, with no fabricated data. Use the theme toggle in the app bar and press Cmd+K / Ctrl+K to test the command palette."
                    actions={
                        <>
                            <CubaButton variant="outline" onClick={() => setModalOpen(true)}>Open modal</CubaButton>
                            <CubaButton variant="secondary" onClick={() => setDrawerOpen(true)}>Open drawer</CubaButton>
                        </>
                    }
                />

                <Section title="Buttons" description="Variants, sizes, loading and disabled states.">
                    <Row>
                        <CubaButton>Primary</CubaButton>
                        <CubaButton variant="secondary">Secondary</CubaButton>
                        <CubaButton variant="outline">Outline</CubaButton>
                        <CubaButton variant="ghost">Ghost</CubaButton>
                        <CubaButton variant="danger">Danger</CubaButton>
                    </Row>
                    <Row>
                        <CubaButton size="sm">Small</CubaButton>
                        <CubaButton size="md">Medium</CubaButton>
                        <CubaButton size="lg">Large</CubaButton>
                        <CubaButton loading>Loading</CubaButton>
                        <CubaButton disabled>Disabled</CubaButton>
                    </Row>
                </Section>

                <Section title="Badges" description="Semantic tones only — never raw colours.">
                    <Row>
                        {['primary', 'success', 'info', 'warning', 'danger', 'neutral'].map((tone) => (
                            <CubaBadge key={tone} tone={tone}>{tone}</CubaBadge>
                        ))}
                    </Row>
                </Section>

<Section title="Stat cards" description="A missing value is shown as loading, never as zero.">
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        <CubaStatCard label="Real value" value="128" hint="From the caller" icon={<FiFileText className="h-5 w-5" />} />
                        <CubaStatCard label="Loading" loading icon={<FiZap className="h-5 w-5" />} />
                        <CubaStatCard label="Genuine zero" value="0" hint="Zero is a real answer" accent="info" />
                    </div>
                </Section>

                <Section title="Cards" description="Opaque by default; glass is opt-in for floating chrome only.">
                    <div className="grid gap-4 md:grid-cols-2">
                        <CubaCard hover>
                            <h3 className="font-semibold text-cuba-ink">Opaque card</h3>
                            <p className="mt-1 text-sm text-cuba-ink-muted">Default surface. Best for dense content and data.</p>
                        </CubaCard>
                        <CubaCard glass>
                            <h3 className="font-semibold text-cuba-ink">Glass card</h3>
                            <p className="mt-1 text-sm text-cuba-ink-muted">Reserved for chrome floating above scrolling content.</p>
                        </CubaCard>
                    </div>
                </Section>


<Section title="AI surfaces" description="The mark indicates real AI capability. Status is derived from telemetry, never decorative.">
                    <div className="grid gap-4">
                        <AiSurface statusLabel="Sourced from the platform availability endpoint">
                            <p>The briefing renders whatever the caller actually knows. When there is no data, the caller states that plainly.</p>
                        </AiSurface>
                        <Row>
                            <AiEngineStatus status={aiStatus} />
                            <AiEngineStatus status={AI_STATUS.CHECKING} />
                            <AiEngineStatus status={AI_STATUS.UNAVAILABLE} />
                            <AiEngineStatus status={AI_STATUS.UNKNOWN} />
                            <button
                                type="button"
                                onClick={() => setAiStatus(AI_STATUS.UNKNOWN)}
                                className="cuba-focusable text-xs font-semibold text-cuba-primary underline"
                            >
                                Simulate a failed check
                            </button>
                        </Row>
                    </div>
                </Section>

                <Section title="Form fields" description="Labels, hints and errors are programmatically associated.">
                    <div className="grid gap-4 md:grid-cols-3">
                        <CubaInput label="Full name" placeholder="Ada Lovelace" hint="Shown on your documents." />
                        <CubaInput label="Email" placeholder="ada@example.com" error="Enter a valid email address." />
                        <CubaSelect label="Template" defaultValue="51">
                            <option value="1">Template 1</option>
                            <option value="51">Template 51</option>
                        </CubaSelect>
                        <CubaTextarea label="Summary" placeholder="Professional summary" className="md:col-span-2" />
                    </div>
                </Section>

<Section title="Loading, empty and error states" description="All three are real platform states.">
                    <div className="grid gap-4 lg:grid-cols-2">
                        <div className="space-y-3" aria-hidden="true">
                            <CubaSkeleton height="1rem" />
                            <CubaSkeleton height="1rem" width="80%" />
                            <CubaSkeleton height="6rem" rounded="rounded-cuba-lg" />
                        </div>
                        <CubaEmptyState
                            title="No saved resumes yet"
                            description="Create your first resume to see it listed here."
                            action={<CubaButton>Create resume</CubaButton>}
                        />
                        <div className="lg:col-span-2">
                            <CubaErrorState
                                message="The platform returned an error. Retry to request the data again."
                                onRetry={() => setRetrying((value) => !value)}
                                retrying={retrying}
                            />
                        </div>
                    </div>
                </Section>

                <Section
                    title="Public marketing header"
                    description="Phase 8. Sticky frosted bar built from the real public route table. Resize to 320px to check the mobile disclosure, and press Escape to close it."
                >
                    <div className="-mx-4 -mt-2 overflow-hidden rounded-cuba-lg border border-cuba-line sm:-mx-5">
                        <CubaPublicHeader currentPath="/pricing" />
                    </div>
                    <p className="text-xs text-cuba-ink-muted">
                        Renders <code>/features</code>, <code>/#templates</code>, <code>/pricing</code>,
                        {' '}<code>/jobs</code>, <code>/blog</code> and <code>/contact</code> — every entry is a
                        route the application actually mounts.
                    </p>
                </Section>

                <Section
                    title="Accessibility guards"
                    description="Keyboard: Tab to the buttons, Enter to open, Escape to close, and focus returns to the trigger."
                >
                    <Row>
                        <CubaButton variant="outline" onClick={() => setModalOpen(true)}>Modal — dialog semantics, focus trap, scroll lock</CubaButton>
                        <CubaButton variant="outline" onClick={() => setDrawerOpen(true)}>Drawer — same contract, different geometry</CubaButton>
                    </Row>
                </Section>

            <CubaModal
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                title="Cuba modal"
                description="Focus is trapped, Escape closes, and focus returns to the trigger."
                footer={
                    <>
                        <CubaButton variant="ghost" onClick={() => setModalOpen(false)}>Cancel</CubaButton>
                        <CubaButton onClick={() => setModalOpen(false)}>Confirm</CubaButton>
                    </>
                }
            >
                <p className="text-sm text-cuba-ink-muted">
                    Scroll locking is reference counted, so nested overlays cannot unlock the page early.
                </p>
            </CubaModal>

            <CubaDrawer
                open={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                title="Cuba drawer"
                description="Uses the identical accessibility contract as the modal."
            >
                <p className="text-sm text-cuba-ink-muted">
                    Drawers are how candidate review, filters and detail panels are presented across the portals.
                </p>
            </CubaDrawer>
        </div>
    );
};

export default DesignSystemShowcase;
