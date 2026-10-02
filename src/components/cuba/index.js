/**
 * Cuba design system — public surface.
 *
 * Every primitive is documented in `docs/CUBA_DESIGN_SYSTEM.md` and exercised
 * live by the development showcase route (`/dashboard/design-system`), which is
 * the inspectable source of truth. Storybook was deliberately NOT introduced:
 * it would add a large dependency and a second build pipeline for documentation
 * that a real, keyboard-navigable in-app showcase already provides (§13).
 */

export { default as CubaCard } from './CubaCard';
export { default as CubaAppShell, CubaNavGroups } from './CubaAppShell';
export { default as CubaStatCard } from './CubaStatCard';
export { default as CubaBadge } from './CubaBadge';
export { default as CubaButton } from './CubaButton';
export { default as CubaPageHeader } from './CubaPageHeader';
export { default as CubaSkeleton } from './CubaSkeleton';
export { default as CubaEmptyState, CubaLoadingState } from './CubaEmptyState';
export { default as CubaErrorState } from './CubaErrorState';
export { default as CubaModal } from './CubaModal';
export { default as CubaDrawer } from './CubaDrawer';
export { default as CubaInput, CubaField, CubaSelect, CubaTextarea } from './CubaField';
export { default as AiEngineStatus } from './AiEngineStatus';
export { default as AiSurface } from './AiSurface';
export { default as CubaCommandPalette } from './CubaCommandPalette';

export { AI_STATUS, describeAiStatus } from './aiStatus';
export { useDialogA11y, CubaPortal, getFocusable } from './useDialogA11y';
