/**
 * Canonical 100 ATS Resume Templates & 4 Cover Letter Templates Catalog
 *
 * Fully typed, enterprise design tokens covering 100 unique resume architectures
 * and 4 distinct cover letter formats with visual differentiation across:
 * - 5 Core Archetypes: Modern Split, Executive Banner, Minimal ATS, Tech Grid, Compact Euro
 * - 6 Header Styles: sidebar, banner, centered-classic, left-bold, minimal-inline, accent-bracket
 * - 5 Skill Display Variants: pills, badges, bars, dots, inline
 * - 6 Timeline Formats: modern-node, subtle-line, accent-bullet, compact-clean, code-tag, date-rail
 * - 4 Divider Styles: solid-thin, solid-thick, double-line, left-bar
 * - Sidebar Alignments: left or right (reverse split)
 * - Typography: Plus Jakarta Sans, Inter, Outfit, Merriweather, Georgia, Fira Code, Montserrat, Cinzel
 */

export interface TemplateMeta {
  id: string;
  name: string;
  archetype:
    | 'modern-split'
    | 'executive-banner'
    | 'minimal-ats'
    | 'tech-grid'
    | 'compact-euro'
    | 'cover-classic'
    | 'cover-modern'
    | 'cover-split'
    | 'cover-creative';
  category: 'modern' | 'professional' | 'simple' | 'creative' | 'europass' | 'specialized';
  primary: string;
  secondary: string;
  /** Optional third identity colour for templates whose legacy art uses a
   *  three-stop accent (e.g. Cv34's tri-colour header rule). */
  accent?: string;
  sidebarBg?: string;
  sidebarText?: string;
  sidebarPosition?: 'left' | 'right';
  headerStyle?: 'sidebar' | 'banner' | 'centered-classic' | 'left-bold' | 'minimal-inline' | 'accent-bracket';
  skillVariant?: 'pills' | 'badges' | 'bars' | 'dots' | 'inline';
  timelineStyle?: 'modern-node' | 'subtle-line' | 'accent-bullet' | 'compact-clean' | 'code-tag' | 'date-rail';
  dividerStyle?: 'solid-thin' | 'solid-thick' | 'double-line' | 'left-bar';
  font?: string;
  badgeRadius?: string;
  density?: 'compact' | 'standard' | 'spacious';
  thumbnail: string;
  description?: string;
}

export const TEMPLATE_CATEGORIES = [
  { id: 'all', label: 'All Templates (100+)' },
  { id: 'modern', label: 'Modern Split' },
  { id: 'professional', label: 'Executive' },
  { id: 'simple', label: 'Simple / ATS' },
  { id: 'creative', label: 'Tech & AI' },
  { id: 'europass', label: 'Europass' },
  { id: 'specialized', label: 'Specialized 10/10' },
] as const;

export const TEMPLATES: TemplateMeta[] = [
  // ── Baseline Certified 1 to 51 ──
  { id: 'Cv1', name: 'Metropolitan Navy', archetype: 'modern-split', category: 'modern', primary: '#1e40af', secondary: '#475569', sidebarBg: '#f8fafc', sidebarText: '#1e293b', headerStyle: 'left-bold', skillVariant: 'pills', timelineStyle: 'modern-node', dividerStyle: 'solid-thin', font: "'Plus Jakarta Sans', sans-serif", badgeRadius: '6px', density: 'standard', thumbnail: '/templates/Cv1.JPG' },
  { id: 'Cv2', name: 'Nordic Slate', archetype: 'modern-split', category: 'modern', primary: '#0f172a', secondary: '#0ea5e9', sidebarBg: '#f1f5f9', sidebarText: '#334155', headerStyle: 'sidebar', skillVariant: 'pills', timelineStyle: 'subtle-line', dividerStyle: 'solid-thin', font: "'Inter', sans-serif", badgeRadius: '4px', density: 'standard', thumbnail: '/templates/Cv2.JPG' },
  { id: 'Cv3', name: 'Emerald Executive', archetype: 'modern-split', category: 'modern', primary: '#065f46', secondary: '#10b981', sidebarBg: '#f0fdf4', sidebarText: '#166534', headerStyle: 'sidebar', skillVariant: 'badges', timelineStyle: 'modern-node', dividerStyle: 'left-bar', font: "'Plus Jakarta Sans', sans-serif", badgeRadius: '6px', density: 'standard', thumbnail: '/templates/Cv3.JPG' },
  { id: 'Cv4', name: 'Harvard Classic ATS', archetype: 'minimal-ats', category: 'simple', primary: '#111827', secondary: '#4b5563', headerStyle: 'centered-classic', skillVariant: 'inline', timelineStyle: 'compact-clean', dividerStyle: 'solid-thin', font: "'Merriweather', serif", density: 'standard', thumbnail: '/templates/Cv4.JPG' },
  { id: 'Cv5', name: 'Stanford Clean ATS', archetype: 'minimal-ats', category: 'simple', primary: '#1e293b', secondary: '#0ea5e9', headerStyle: 'left-bold', skillVariant: 'pills', timelineStyle: 'modern-node', dividerStyle: 'left-bar', font: "'Plus Jakarta Sans', sans-serif", density: 'standard', thumbnail: '/templates/Cv5.JPG' },
  { id: 'Cv6', name: 'Wall Street Modern', archetype: 'minimal-ats', category: 'simple', primary: '#0f172a', secondary: '#2563eb', headerStyle: 'minimal-inline', skillVariant: 'badges', timelineStyle: 'compact-clean', dividerStyle: 'double-line', font: "'Inter', sans-serif", density: 'compact', thumbnail: '/templates/Cv6.JPG' },
  { id: 'Cv7', name: 'Sapphire Modern Split', archetype: 'modern-split', category: 'modern', primary: '#1d4ed8', secondary: '#60a5fa', sidebarBg: '#eff6ff', sidebarText: '#1e3a8a', headerStyle: 'sidebar', skillVariant: 'pills', timelineStyle: 'modern-node', dividerStyle: 'solid-thin', font: "'Montserrat', sans-serif", badgeRadius: '8px', density: 'standard', thumbnail: '/templates/Cv7.JPG' },
  { id: 'Cv8', name: 'Crown Executive Banner', archetype: 'executive-banner', category: 'professional', primary: '#1e293b', secondary: '#3b82f6', headerStyle: 'banner', skillVariant: 'pills', timelineStyle: 'modern-node', dividerStyle: 'solid-thin', font: "'Outfit', sans-serif", badgeRadius: '6px', density: 'spacious', thumbnail: '/templates/Cv8.JPG' },
  { id: 'Cv9', name: 'Cobalt Pro Split', archetype: 'modern-split', category: 'modern', primary: '#2563eb', secondary: '#38bdf8', sidebarBg: '#1e293b', sidebarText: '#f8fafc', headerStyle: 'sidebar', skillVariant: 'badges', timelineStyle: 'accent-bullet', dividerStyle: 'solid-thin', font: "'Plus Jakarta Sans', sans-serif", badgeRadius: '6px', density: 'standard', thumbnail: '/templates/Cv9.JPG' },
  { id: 'Cv10', name: 'Titanium Executive', archetype: 'executive-banner', category: 'professional', primary: '#334155', secondary: '#64748b', headerStyle: 'banner', skillVariant: 'pills', timelineStyle: 'subtle-line', dividerStyle: 'left-bar', font: "'Inter', sans-serif", badgeRadius: '4px', density: 'compact', thumbnail: '/templates/Cv10.JPG' },
  { id: 'Cv11', name: 'Prism Executive Banner', archetype: 'executive-banner', category: 'professional', primary: '#4338ca', secondary: '#818cf8', headerStyle: 'banner', skillVariant: 'pills', timelineStyle: 'modern-node', dividerStyle: 'solid-thin', font: "'Plus Jakarta Sans', sans-serif", badgeRadius: '6px', density: 'standard', thumbnail: '/templates/Cv11.JPG' },
  { id: 'Cv12', name: 'Oxford Academic ATS', archetype: 'minimal-ats', category: 'simple', primary: '#1e1b4b', secondary: '#4338ca', headerStyle: 'centered-classic', skillVariant: 'inline', timelineStyle: 'compact-clean', dividerStyle: 'double-line', font: "'Merriweather', serif", density: 'standard', thumbnail: '/templates/Cv12.JPG' },
  { id: 'Cv13', name: 'Cambridge Research', archetype: 'minimal-ats', category: 'simple', primary: '#09090b', secondary: '#52525b', headerStyle: 'minimal-inline', skillVariant: 'pills', timelineStyle: 'subtle-line', dividerStyle: 'solid-thin', font: "'Inter', sans-serif", density: 'standard', thumbnail: '/templates/Cv13.JPG' },
  { id: 'Cv14', name: 'Yale Corporate ATS', archetype: 'minimal-ats', category: 'simple', primary: '#0c2340', secondary: '#c59b27', headerStyle: 'left-bold', skillVariant: 'badges', timelineStyle: 'modern-node', dividerStyle: 'solid-thick', font: "'Cinzel', sans-serif", density: 'standard', thumbnail: '/templates/Cv14.JPG' },
  { id: 'Cv15', name: 'MIT Technical ATS', archetype: 'minimal-ats', category: 'simple', primary: '#8b0000', secondary: '#475569', headerStyle: 'accent-bracket', skillVariant: 'badges', timelineStyle: 'code-tag', dividerStyle: 'left-bar', font: "'Inter', sans-serif", density: 'compact', thumbnail: '/templates/Cv15.JPG' },
  { id: 'Cv16', name: 'Apex Navy Banner', archetype: 'executive-banner', category: 'professional', primary: '#1e3a8a', secondary: '#38bdf8', headerStyle: 'banner', skillVariant: 'badges', timelineStyle: 'accent-bullet', dividerStyle: 'solid-thin', font: "'Outfit', sans-serif", badgeRadius: '6px', density: 'standard', thumbnail: '/templates/Cv16.JPG' },
  { id: 'Cv17', name: 'Teal Horizon Banner', archetype: 'executive-banner', category: 'professional', primary: '#0f766e', secondary: '#14b8a6', headerStyle: 'banner', skillVariant: 'bars', timelineStyle: 'modern-node', dividerStyle: 'left-bar', font: "'Plus Jakarta Sans', sans-serif", badgeRadius: '6px', density: 'standard', thumbnail: '/templates/Cv17.JPG' },
  { id: 'Cv18', name: 'Princeton Minimal ATS', archetype: 'minimal-ats', category: 'simple', primary: '#c2410c', secondary: '#ea580c', headerStyle: 'accent-bracket', skillVariant: 'pills', timelineStyle: 'accent-bullet', dividerStyle: 'left-bar', font: "'Georgia', serif", density: 'spacious', thumbnail: '/templates/Cv18.JPG' },
  { id: 'Cv19', name: 'Zurich Financial ATS', archetype: 'minimal-ats', category: 'simple', primary: '#004b49', secondary: '#d97706', headerStyle: 'centered-classic', skillVariant: 'badges', timelineStyle: 'compact-clean', dividerStyle: 'double-line', font: "'Plus Jakarta Sans', sans-serif", density: 'compact', thumbnail: '/templates/Cv19.JPG' },
  { id: 'Cv20', name: 'Pacific Blue Split', archetype: 'modern-split', category: 'modern', primary: '#0284c7', secondary: '#38bdf8', sidebarBg: '#f0f9ff', sidebarText: '#0369a1', headerStyle: 'sidebar', skillVariant: 'bars', timelineStyle: 'accent-bullet', dividerStyle: 'solid-thick', font: "'Plus Jakarta Sans', sans-serif", badgeRadius: '10px', density: 'standard', thumbnail: '/templates/Cv20.JPG' },
  { id: 'Cv21', name: 'Imperial Indigo Banner', archetype: 'executive-banner', category: 'professional', primary: '#3730a3', secondary: '#6366f1', headerStyle: 'banner', skillVariant: 'dots', timelineStyle: 'subtle-line', dividerStyle: 'double-line', font: "'Outfit', sans-serif", badgeRadius: '6px', density: 'standard', thumbnail: '/templates/Cv21.JPG' },
  { id: 'Cv22', name: 'Geneva Executive ATS', archetype: 'minimal-ats', category: 'simple', primary: '#18181b', secondary: '#dc2626', headerStyle: 'left-bold', skillVariant: 'pills', timelineStyle: 'compact-clean', dividerStyle: 'solid-thick', font: "'Inter', sans-serif", density: 'compact', thumbnail: '/templates/Cv22.JPG' },
  { id: 'Cv23', name: 'Burgundy Prestige Banner', archetype: 'executive-banner', category: 'professional', primary: '#881337', secondary: '#f43f5e', headerStyle: 'banner', skillVariant: 'pills', timelineStyle: 'compact-clean', dividerStyle: 'solid-thick', font: "'Plus Jakarta Sans', sans-serif", badgeRadius: '6px', density: 'spacious', thumbnail: '/templates/Cv23.JPG' },
  { id: 'Cv24', name: 'Cyberpunk Modern Split', archetype: 'modern-split', category: 'creative', primary: '#4f46e5', secondary: '#ec4899', sidebarBg: '#faf5ff', sidebarText: '#3b0764', headerStyle: 'sidebar', skillVariant: 'badges', timelineStyle: 'code-tag', dividerStyle: 'solid-thin', font: "'Plus Jakarta Sans', sans-serif", badgeRadius: '8px', density: 'compact', thumbnail: '/templates/Cv24.JPG' },
  { id: 'Cv25', name: 'DevOps Terminal Tech', archetype: 'tech-grid', category: 'creative', primary: '#274472', secondary: '#3d6485', headerStyle: 'banner', skillVariant: 'bars', timelineStyle: 'accent-bullet', dividerStyle: 'solid-thick', font: "'Inter', sans-serif", badgeRadius: '4px', density: 'standard', thumbnail: '/templates/Cv25.JPG' },
  { id: 'Cv26', name: 'FullStack Dark Split', archetype: 'modern-split', category: 'modern', primary: '#0891b2', secondary: '#06b6d4', sidebarBg: '#090d16', sidebarText: '#f8fafc', headerStyle: 'sidebar', skillVariant: 'badges', timelineStyle: 'code-tag', dividerStyle: 'left-bar', font: "'Plus Jakarta Sans', sans-serif", badgeRadius: '6px', density: 'compact', thumbnail: '/templates/Cv26.JPG' },
  { id: 'Cv27', name: 'Creative Studio Split', archetype: 'modern-split', category: 'creative', primary: '#d97706', secondary: '#fbbf24', sidebarBg: '#fffbeb', sidebarText: '#78350f', headerStyle: 'sidebar', skillVariant: 'pills', timelineStyle: 'accent-bullet', dividerStyle: 'solid-thin', font: "'Outfit', sans-serif", badgeRadius: '6px', density: 'standard', thumbnail: '/templates/Cv27.JPG' },
  { id: 'Cv28', name: 'Silicon Valley Engineer', archetype: 'tech-grid', category: 'creative', primary: '#2563eb', secondary: '#60a5fa', headerStyle: 'left-bold', skillVariant: 'badges', timelineStyle: 'code-tag', dividerStyle: 'left-bar', font: "'Plus Jakarta Sans', sans-serif", badgeRadius: '3px', density: 'compact', thumbnail: '/templates/Cv28.JPG' },
  { id: 'Cv29', name: 'Minimal Nordic Slate', archetype: 'modern-split', category: 'modern', primary: '#334155', secondary: '#64748b', sidebarBg: '#f1f5f9', sidebarText: '#0f172a', headerStyle: 'sidebar', skillVariant: 'inline', timelineStyle: 'compact-clean', dividerStyle: 'double-line', font: "'Inter', sans-serif", badgeRadius: '4px', density: 'spacious', thumbnail: '/templates/Cv29.JPG' },
  { id: 'Cv30', name: 'Corporate Summit Banner', archetype: 'executive-banner', category: 'professional', primary: '#b45309', secondary: '#f59e0b', headerStyle: 'banner', skillVariant: 'inline', timelineStyle: 'subtle-line', dividerStyle: 'solid-thin', font: "'Plus Jakarta Sans', sans-serif", badgeRadius: '6px', density: 'standard', thumbnail: '/templates/Cv30.JPG' },
  { id: 'Cv31', name: 'Cloud Native Tech', archetype: 'tech-grid', category: 'creative', primary: '#0891b2', secondary: '#0ea5e9', headerStyle: 'left-bold', skillVariant: 'dots', timelineStyle: 'code-tag', dividerStyle: 'left-bar', font: "'Plus Jakarta Sans', sans-serif", badgeRadius: '6px', density: 'spacious', thumbnail: '/templates/Cv31.JPG' },
  { id: 'Cv32', name: 'Kubernetes Developer', archetype: 'tech-grid', category: 'creative', primary: '#326ce5', secondary: '#60a5fa', headerStyle: 'left-bold', skillVariant: 'pills', timelineStyle: 'code-tag', dividerStyle: 'double-line', font: "'Inter', sans-serif", badgeRadius: '6px', density: 'standard', thumbnail: '/templates/Cv32.JPG' },
  { id: 'Cv33', name: 'Data Science Matrix', archetype: 'tech-grid', category: 'creative', primary: '#059669', secondary: '#34d399', headerStyle: 'left-bold', skillVariant: 'bars', timelineStyle: 'code-tag', dividerStyle: 'double-line', font: "'Plus Jakarta Sans', sans-serif", badgeRadius: '8px', density: 'compact', thumbnail: '/templates/Cv33.JPG' },
  { id: 'Cv34', name: 'Fintech Executive', archetype: 'executive-banner', category: 'professional', primary: '#6c5ce7', secondary: '#0f766e', accent: '#fd79a8', headerStyle: 'minimal-inline', skillVariant: 'bars', timelineStyle: 'modern-node', dividerStyle: 'solid-thin', font: "'Plus Jakarta Sans', sans-serif", badgeRadius: '2px', density: 'standard', thumbnail: '/templates/Cv34.JPG' },
  { id: 'Cv35', name: 'AI & ML Researcher', archetype: 'tech-grid', category: 'creative', primary: '#7c3aed', secondary: '#a78bfa', headerStyle: 'left-bold', skillVariant: 'badges', timelineStyle: 'code-tag', dividerStyle: 'double-line', font: "'Outfit', sans-serif", badgeRadius: '6px', density: 'compact', thumbnail: '/templates/Cv35.JPG' },
  { id: 'Cv36', name: 'BioTech Specialist', archetype: 'executive-banner', category: 'professional', primary: '#0d9488', secondary: '#2dd4bf', headerStyle: 'banner', skillVariant: 'badges', timelineStyle: 'modern-node', dividerStyle: 'double-line', font: "'Inter', sans-serif", badgeRadius: '6px', density: 'spacious', thumbnail: '/templates/Cv36.JPG' },
  { id: 'Cv37', name: 'Solutions Architect', archetype: 'tech-grid', category: 'creative', primary: '#ea580c', secondary: '#fb923c', headerStyle: 'left-bold', skillVariant: 'bars', timelineStyle: 'modern-node', dividerStyle: 'solid-thick', font: "'Plus Jakarta Sans', sans-serif", badgeRadius: '6px', density: 'standard', thumbnail: '/templates/Cv37.JPG' },
  { id: 'Cv38', name: 'Global Legal ATS', archetype: 'minimal-ats', category: 'simple', primary: '#0f172a', secondary: '#0284c7', headerStyle: 'accent-bracket', skillVariant: 'inline', timelineStyle: 'compact-clean', dividerStyle: 'left-bar', font: "'Georgia', serif", density: 'standard', thumbnail: '/templates/Cv38.JPG' },
  { id: 'Cv39', name: 'Product Manager Pro', archetype: 'modern-split', category: 'modern', primary: '#4338ca', secondary: '#f59e0b', sidebarBg: '#fafafa', sidebarText: '#1e293b', headerStyle: 'sidebar', skillVariant: 'pills', timelineStyle: 'accent-bullet', dividerStyle: 'left-bar', font: "'Plus Jakarta Sans', sans-serif", badgeRadius: '6px', density: 'spacious', thumbnail: '/templates/Cv39.JPG' },
  { id: 'Cv40', name: 'Europass Classic Grid', archetype: 'compact-euro', category: 'europass', primary: '#003399', secondary: '#4169e1', headerStyle: 'minimal-inline', skillVariant: 'pills', timelineStyle: 'date-rail', dividerStyle: 'solid-thin', font: "'Inter', sans-serif", badgeRadius: '4px', density: 'standard', thumbnail: '/templates/Cv40.JPG' },
  { id: 'Cv41', name: 'Europass Modern Slate', archetype: 'compact-euro', category: 'europass', primary: '#1e293b', secondary: '#3b82f6', headerStyle: 'left-bold', skillVariant: 'dots', timelineStyle: 'date-rail', dividerStyle: 'solid-thin', font: "'Plus Jakarta Sans', sans-serif", badgeRadius: '4px', density: 'standard', thumbnail: '/templates/Cv41.JPG' },
  { id: 'Cv42', name: 'European Academic Compact', archetype: 'compact-euro', category: 'europass', primary: '#1e3a8a', secondary: '#60a5fa', headerStyle: 'centered-classic', skillVariant: 'pills', timelineStyle: 'date-rail', dividerStyle: 'double-line', font: "'Inter', sans-serif", badgeRadius: '4px', density: 'standard', thumbnail: '/templates/Cv42.JPG' },
  { id: 'Cv43', name: 'Brussels International', archetype: 'compact-euro', category: 'europass', primary: '#0f766e', secondary: '#14b8a6', headerStyle: 'left-bold', skillVariant: 'badges', timelineStyle: 'date-rail', dividerStyle: 'double-line', font: "'Plus Jakarta Sans', sans-serif", badgeRadius: '4px', density: 'spacious', thumbnail: '/templates/Cv43.JPG' },
  { id: 'Cv44', name: 'Scandinavia Clean Compact', archetype: 'minimal-ats', category: 'simple', primary: '#334155', secondary: '#10b981', headerStyle: 'minimal-inline', skillVariant: 'dots', timelineStyle: 'compact-clean', dividerStyle: 'solid-thin', font: "'Inter', sans-serif", density: 'compact', thumbnail: '/templates/Cv44.JPG' },
  { id: 'Cv45', name: 'Vienna Diplomatic Euro', archetype: 'compact-euro', category: 'europass', primary: '#881337', secondary: '#e11d48', headerStyle: 'left-bold', skillVariant: 'pills', timelineStyle: 'date-rail', dividerStyle: 'solid-thick', font: "'Plus Jakarta Sans', sans-serif", badgeRadius: '4px', density: 'standard', thumbnail: '/templates/Cv45.JPG' },
  { id: 'Cv46', name: 'Frankfurt Finance Euro', archetype: 'compact-euro', category: 'europass', primary: '#1e3a8a', secondary: '#0284c7', headerStyle: 'left-bold', skillVariant: 'badges', timelineStyle: 'date-rail', dividerStyle: 'left-bar', font: "'Inter', sans-serif", badgeRadius: '4px', density: 'standard', thumbnail: '/templates/Cv46.JPG' },
  { id: 'Cv47', name: 'Metro Dual Column Pro', archetype: 'modern-split', category: 'modern', primary: '#0369a1', secondary: '#38bdf8', sidebarBg: '#f0f9ff', sidebarText: '#0c4a6e', headerStyle: 'sidebar', skillVariant: 'pills', timelineStyle: 'subtle-line', dividerStyle: 'solid-thin', font: "'Plus Jakarta Sans', sans-serif", badgeRadius: '6px', density: 'compact', thumbnail: '/templates/Cv47.JPG' },
  { id: 'Cv48', name: 'Modern Gradient Aurora', archetype: 'modern-split', category: 'modern', primary: '#6366f1', secondary: '#ec4899', sidebarBg: 'linear-gradient(180deg, #312e81 0%, #1e1b4b 100%)', sidebarText: '#f8fafc', headerStyle: 'sidebar', skillVariant: 'dots', timelineStyle: 'modern-node', dividerStyle: 'solid-thick', font: "'Plus Jakarta Sans', sans-serif", badgeRadius: '8px', density: 'spacious', thumbnail: '/templates/Cv48.JPG' },
  { id: 'Cv49', name: 'Berlin Tech Compact', archetype: 'compact-euro', category: 'europass', primary: '#18181b', secondary: '#3b82f6', headerStyle: 'minimal-inline', skillVariant: 'pills', timelineStyle: 'date-rail', dividerStyle: 'left-bar', font: "'Inter', sans-serif", badgeRadius: '4px', density: 'compact', thumbnail: '/templates/Cv49.JPG' },
  { id: 'Cv50', name: 'Executive Platinum Split', archetype: 'modern-split', category: 'modern', sidebarPosition: 'right', primary: '#0f172a', secondary: '#475569', sidebarBg: '#e2e8f0', sidebarText: '#1e293b', headerStyle: 'sidebar', skillVariant: 'badges', timelineStyle: 'subtle-line', dividerStyle: 'solid-thin', font: "'Plus Jakarta Sans', sans-serif", badgeRadius: '6px', density: 'standard', thumbnail: '/templates/Cv50.JPG' },
  { id: 'Cv51', name: 'Standard Europass Modern', archetype: 'modern-split', category: 'europass', primary: '#0f4c81', secondary: '#f59e0b', sidebarBg: '#eff6ff', sidebarText: '#1e3a8a', headerStyle: 'sidebar', skillVariant: 'dots', timelineStyle: 'date-rail', dividerStyle: 'left-bar', font: "'Inter', sans-serif", badgeRadius: '4px', density: 'standard', thumbnail: '/templates/Cv51.JPG' },

  // ── Expanded Specialized ATS Templates (Cv52 to Cv100) ──
  { id: 'Cv52', name: 'Silicon Alley Minimalist', archetype: 'minimal-ats', category: 'specialized', primary: '#0f172a', secondary: '#64748b', headerStyle: 'left-bold', skillVariant: 'inline', timelineStyle: 'compact-clean', dividerStyle: 'solid-thin', font: "'Inter', sans-serif", thumbnail: '/templates/Cv52.JPG' },
  { id: 'Cv53', name: 'C-Suite Executive Navy', archetype: 'executive-banner', category: 'specialized', primary: '#1e3a8a', secondary: '#0284c7', headerStyle: 'banner', skillVariant: 'pills', timelineStyle: 'modern-node', dividerStyle: 'double-line', font: "'Outfit', sans-serif", thumbnail: '/templates/Cv53.JPG' },
  { id: 'Cv54', name: 'Machine Learning Architect', archetype: 'tech-grid', category: 'specialized', primary: '#09090b', secondary: '#06b6d4', headerStyle: 'left-bold', skillVariant: 'badges', timelineStyle: 'code-tag', dividerStyle: 'left-bar', font: "'Fira Code', monospace", thumbnail: '/templates/Cv54.JPG' },
  { id: 'Cv55', name: 'HealthCare Clinical Leader', archetype: 'modern-split', category: 'specialized', primary: '#047857', secondary: '#10b981', sidebarBg: '#ecfdf5', sidebarText: '#064e3b', headerStyle: 'sidebar', skillVariant: 'pills', timelineStyle: 'modern-node', dividerStyle: 'solid-thick', font: "'Plus Jakarta Sans', sans-serif", thumbnail: '/templates/Cv55.JPG' },
  { id: 'Cv56', name: 'Legal Counsel Ivory', archetype: 'minimal-ats', category: 'specialized', primary: '#1c1917', secondary: '#78716c', headerStyle: 'centered-classic', skillVariant: 'inline', timelineStyle: 'compact-clean', dividerStyle: 'double-line', font: "'Cinzel', serif", thumbnail: '/templates/Cv56.JPG' },
  { id: 'Cv57', name: 'London FinTech Split', archetype: 'modern-split', category: 'specialized', primary: '#0f172a', secondary: '#d97706', sidebarBg: '#f8fafc', sidebarText: '#1e293b', headerStyle: 'sidebar', skillVariant: 'badges', timelineStyle: 'accent-bullet', dividerStyle: 'left-bar', font: "'Inter', sans-serif", thumbnail: '/templates/Cv57.JPG' },
  { id: 'Cv58', name: 'Zurich Private Wealth', archetype: 'executive-banner', category: 'specialized', primary: '#064e3b', secondary: '#d97706', headerStyle: 'banner', skillVariant: 'dots', timelineStyle: 'subtle-line', dividerStyle: 'solid-thin', font: "'Outfit', sans-serif", thumbnail: '/templates/Cv58.JPG' },
  { id: 'Cv59', name: 'Tokyo Global Executive', archetype: 'compact-euro', category: 'specialized', primary: '#881337', secondary: '#e11d48', headerStyle: 'left-bold', skillVariant: 'pills', timelineStyle: 'date-rail', dividerStyle: 'left-bar', font: "'Plus Jakarta Sans', sans-serif", thumbnail: '/templates/Cv59.JPG' },
  { id: 'Cv60', name: 'Stanford AI Fellow', archetype: 'tech-grid', category: 'specialized', primary: '#4c1d95', secondary: '#8b5cf6', headerStyle: 'left-bold', skillVariant: 'badges', timelineStyle: 'code-tag', dividerStyle: 'double-line', font: "'Outfit', sans-serif", thumbnail: '/templates/Cv60.JPG' },
  { id: 'Cv61', name: 'Site Reliability Engineer', archetype: 'tech-grid', category: 'specialized', primary: '#14532d', secondary: '#22c55e', headerStyle: 'left-bold', skillVariant: 'badges', timelineStyle: 'code-tag', dividerStyle: 'left-bar', font: "'Fira Code', monospace", thumbnail: '/templates/Cv61.JPG' },
  { id: 'Cv62', name: 'Cambridge Biostatistician', archetype: 'minimal-ats', category: 'specialized', primary: '#1e1b4b', secondary: '#3b82f6', headerStyle: 'accent-bracket', skillVariant: 'inline', timelineStyle: 'compact-clean', dividerStyle: 'solid-thin', font: "'Merriweather', serif", thumbnail: '/templates/Cv62.JPG' },
  { id: 'Cv63', name: 'Paris Haute Design', archetype: 'modern-split', category: 'specialized', primary: '#831843', secondary: '#f43f5e', sidebarBg: '#fdf2f8', sidebarText: '#701a75', headerStyle: 'sidebar', skillVariant: 'pills', timelineStyle: 'subtle-line', dividerStyle: 'solid-thin', font: "'Playfair Display', serif", thumbnail: '/templates/Cv63.JPG' },
  { id: 'Cv64', name: 'Stockholm Tech Lead', archetype: 'modern-split', category: 'specialized', sidebarPosition: 'right', primary: '#0284c7', secondary: '#0ea5e9', sidebarBg: '#f0f9ff', sidebarText: '#0c4a6e', headerStyle: 'sidebar', skillVariant: 'badges', timelineStyle: 'modern-node', dividerStyle: 'left-bar', font: "'Plus Jakarta Sans', sans-serif", thumbnail: '/templates/Cv64.JPG' },
  { id: 'Cv65', name: 'Toronto Enterprise Cloud', archetype: 'executive-banner', category: 'specialized', primary: '#1e3a8a', secondary: '#38bdf8', headerStyle: 'banner', skillVariant: 'bars', timelineStyle: 'modern-node', dividerStyle: 'solid-thick', font: "'Outfit', sans-serif", thumbnail: '/templates/Cv65.JPG' },
  { id: 'Cv66', name: 'Cyber Defense Analyst', archetype: 'tech-grid', category: 'specialized', primary: '#18181b', secondary: '#ef4444', headerStyle: 'left-bold', skillVariant: 'badges', timelineStyle: 'code-tag', dividerStyle: 'left-bar', font: "'Inter', sans-serif", thumbnail: '/templates/Cv66.JPG' },
  { id: 'Cv67', name: 'Venture Partner Portfolio', archetype: 'executive-banner', category: 'specialized', primary: '#065f46', secondary: '#d97706', headerStyle: 'banner', skillVariant: 'pills', timelineStyle: 'accent-bullet', dividerStyle: 'double-line', font: "'Outfit', sans-serif", thumbnail: '/templates/Cv67.JPG' },
  { id: 'Cv68', name: 'Austin Startup Founder', archetype: 'modern-split', category: 'specialized', primary: '#c2410c', secondary: '#f97316', sidebarBg: '#fff7ed', sidebarText: '#7c2d12', headerStyle: 'sidebar', skillVariant: 'pills', timelineStyle: 'modern-node', dividerStyle: 'left-bar', font: "'Plus Jakarta Sans', sans-serif", thumbnail: '/templates/Cv68.JPG' },
  { id: 'Cv69', name: 'Quantum Computing Researcher', archetype: 'tech-grid', category: 'specialized', primary: '#312e81', secondary: '#06b6d4', headerStyle: 'left-bold', skillVariant: 'badges', timelineStyle: 'code-tag', dividerStyle: 'solid-thick', font: "'Fira Code', monospace", thumbnail: '/templates/Cv69.JPG' },
  { id: 'Cv70', name: 'Singapore Logistics Director', archetype: 'compact-euro', category: 'specialized', primary: '#0369a1', secondary: '#0284c7', headerStyle: 'left-bold', skillVariant: 'pills', timelineStyle: 'date-rail', dividerStyle: 'solid-thin', font: "'Inter', sans-serif", thumbnail: '/templates/Cv70.JPG' },
  { id: 'Cv71', name: 'Chief Info Security Officer', archetype: 'executive-banner', category: 'specialized', primary: '#0f172a', secondary: '#e11d48', headerStyle: 'banner', skillVariant: 'badges', timelineStyle: 'modern-node', dividerStyle: 'solid-thick', font: "'Outfit', sans-serif", thumbnail: '/templates/Cv71.JPG' },
  { id: 'Cv72', name: 'Principal Front-End Architect', archetype: 'tech-grid', category: 'specialized', primary: '#0891b2', secondary: '#38bdf8', headerStyle: 'left-bold', skillVariant: 'pills', timelineStyle: 'code-tag', dividerStyle: 'left-bar', font: "'Plus Jakarta Sans', sans-serif", thumbnail: '/templates/Cv72.JPG' },
  { id: 'Cv73', name: 'Geneva Global Diplomat', archetype: 'compact-euro', category: 'specialized', primary: '#1e3a8a', secondary: '#60a5fa', headerStyle: 'centered-classic', skillVariant: 'pills', timelineStyle: 'date-rail', dividerStyle: 'double-line', font: "'Cinzel', sans-serif", thumbnail: '/templates/Cv73.JPG' },
  { id: 'Cv74', name: 'Ivy League Provost', archetype: 'minimal-ats', category: 'specialized', primary: '#881337', secondary: '#9f1239', headerStyle: 'centered-classic', skillVariant: 'inline', timelineStyle: 'compact-clean', dividerStyle: 'double-line', font: "'Merriweather', serif", thumbnail: '/templates/Cv74.JPG' },
  { id: 'Cv75', name: 'Blockchain Protocol Engineer', archetype: 'tech-grid', category: 'specialized', primary: '#1e1b4b', secondary: '#10b981', headerStyle: 'left-bold', skillVariant: 'badges', timelineStyle: 'code-tag', dividerStyle: 'left-bar', font: "'Fira Code', monospace", thumbnail: '/templates/Cv75.JPG' },
  { id: 'Cv76', name: 'Renewable Energy Executive', archetype: 'modern-split', category: 'specialized', primary: '#064e3b', secondary: '#34d399', sidebarBg: '#ecfdf5', sidebarText: '#064e3b', headerStyle: 'sidebar', skillVariant: 'bars', timelineStyle: 'modern-node', dividerStyle: 'solid-thin', font: "'Plus Jakarta Sans', sans-serif", thumbnail: '/templates/Cv76.JPG' },
  { id: 'Cv77', name: 'Wall Street Quant Trader', archetype: 'minimal-ats', category: 'specialized', primary: '#0f172a', secondary: '#2563eb', headerStyle: 'minimal-inline', skillVariant: 'badges', timelineStyle: 'compact-clean', dividerStyle: 'double-line', font: "'Inter', sans-serif", density: 'compact', thumbnail: '/templates/Cv77.JPG' },
  { id: 'Cv78', name: 'Berlin Creative Director', archetype: 'modern-split', category: 'specialized', primary: '#b45309', secondary: '#f59e0b', sidebarBg: '#fffbeb', sidebarText: '#78350f', headerStyle: 'sidebar', skillVariant: 'dots', timelineStyle: 'accent-bullet', dividerStyle: 'solid-thick', font: "'Outfit', sans-serif", thumbnail: '/templates/Cv78.JPG' },
  { id: 'Cv79', name: 'Sydney Resources Director', archetype: 'executive-banner', category: 'specialized', primary: '#78350f', secondary: '#d97706', headerStyle: 'banner', skillVariant: 'pills', timelineStyle: 'subtle-line', dividerStyle: 'solid-thin', font: "'Inter', sans-serif", thumbnail: '/templates/Cv79.JPG' },
  { id: 'Cv80', name: 'Dublin EMEA Operations', archetype: 'modern-split', category: 'specialized', primary: '#065f46', secondary: '#1e3a8a', sidebarBg: '#f0fdf4', sidebarText: '#14532d', headerStyle: 'sidebar', skillVariant: 'badges', timelineStyle: 'modern-node', dividerStyle: 'left-bar', font: "'Plus Jakarta Sans', sans-serif", thumbnail: '/templates/Cv80.JPG' },
  { id: 'Cv81', name: 'Aerospace Systems Engineer', archetype: 'tech-grid', category: 'specialized', primary: '#1e3a8a', secondary: '#3b82f6', headerStyle: 'left-bold', skillVariant: 'badges', timelineStyle: 'code-tag', dividerStyle: 'solid-thick', font: "'Inter', sans-serif", thumbnail: '/templates/Cv81.JPG' },
  { id: 'Cv82', name: 'Boston Medical Director', archetype: 'executive-banner', category: 'specialized', primary: '#0f766e', secondary: '#14b8a6', headerStyle: 'banner', skillVariant: 'pills', timelineStyle: 'modern-node', dividerStyle: 'double-line', font: "'Plus Jakarta Sans', sans-serif", thumbnail: '/templates/Cv82.JPG' },
  { id: 'Cv83', name: 'Nordic Renewable Tech', archetype: 'compact-euro', category: 'specialized', primary: '#0284c7', secondary: '#0ea5e9', headerStyle: 'left-bold', skillVariant: 'dots', timelineStyle: 'date-rail', dividerStyle: 'left-bar', font: "'Inter', sans-serif", thumbnail: '/templates/Cv83.JPG' },
  { id: 'Cv84', name: 'San Francisco Growth VP', archetype: 'modern-split', category: 'specialized', primary: '#6d28d9', secondary: '#ec4899', sidebarBg: '#faf5ff', sidebarText: '#4c1d95', headerStyle: 'sidebar', skillVariant: 'pills', timelineStyle: 'accent-bullet', dividerStyle: 'solid-thin', font: "'Outfit', sans-serif", thumbnail: '/templates/Cv84.JPG' },
  { id: 'Cv85', name: 'Edinburgh Academic Fellow', archetype: 'minimal-ats', category: 'specialized', primary: '#581c87', secondary: '#7e22ce', headerStyle: 'centered-classic', skillVariant: 'inline', timelineStyle: 'compact-clean', dividerStyle: 'double-line', font: "'Merriweather', serif", thumbnail: '/templates/Cv85.JPG' },
  { id: 'Cv86', name: 'Tel Aviv Cyber Unit Lead', archetype: 'tech-grid', category: 'specialized', primary: '#1e293b', secondary: '#06b6d4', headerStyle: 'left-bold', skillVariant: 'badges', timelineStyle: 'code-tag', dividerStyle: 'left-bar', font: "'Fira Code', monospace", thumbnail: '/templates/Cv86.JPG' },
  { id: 'Cv87', name: 'Amsterdam Logistics Hub', archetype: 'compact-euro', category: 'specialized', primary: '#c2410c', secondary: '#f97316', headerStyle: 'left-bold', skillVariant: 'pills', timelineStyle: 'date-rail', dividerStyle: 'solid-thick', font: "'Plus Jakarta Sans', sans-serif", thumbnail: '/templates/Cv87.JPG' },
  { id: 'Cv88', name: 'Chicago Corporate Counsel', archetype: 'minimal-ats', category: 'specialized', primary: '#0f172a', secondary: '#1e3a8a', headerStyle: 'left-bold', skillVariant: 'inline', timelineStyle: 'compact-clean', dividerStyle: 'solid-thick', font: "'Cinzel', serif", thumbnail: '/templates/Cv88.JPG' },
  { id: 'Cv89', name: 'Seoul Game Engine Lead', archetype: 'tech-grid', category: 'specialized', primary: '#581c87', secondary: '#e879f9', headerStyle: 'left-bold', skillVariant: 'badges', timelineStyle: 'code-tag', dividerStyle: 'double-line', font: "'Plus Jakarta Sans', sans-serif", thumbnail: '/templates/Cv89.JPG' },
  { id: 'Cv90', name: 'Milan Luxury Retail VP', archetype: 'modern-split', category: 'specialized', primary: '#78350f', secondary: '#d97706', sidebarBg: '#fffbeb', sidebarText: '#451a03', headerStyle: 'sidebar', skillVariant: 'pills', timelineStyle: 'subtle-line', dividerStyle: 'solid-thin', font: "'Playfair Display', serif", thumbnail: '/templates/Cv90.JPG' },
  { id: 'Cv91', name: 'Zurich Pharma Lead', archetype: 'executive-banner', category: 'specialized', primary: '#991b1b', secondary: '#ef4444', headerStyle: 'banner', skillVariant: 'badges', timelineStyle: 'modern-node', dividerStyle: 'left-bar', font: "'Inter', sans-serif", thumbnail: '/templates/Cv91.JPG' },
  { id: 'Cv92', name: 'Munich Automotive Architect', archetype: 'tech-grid', category: 'specialized', primary: '#1e3a8a', secondary: '#2563eb', headerStyle: 'left-bold', skillVariant: 'bars', timelineStyle: 'code-tag', dividerStyle: 'solid-thick', font: "'Inter', sans-serif", thumbnail: '/templates/Cv92.JPG' },
  { id: 'Cv93', name: 'Oxford PPE Scholar', archetype: 'minimal-ats', category: 'specialized', primary: '#1e1b4b', secondary: '#4338ca', headerStyle: 'centered-classic', skillVariant: 'inline', timelineStyle: 'compact-clean', dividerStyle: 'solid-thin', font: "'Merriweather', serif", thumbnail: '/templates/Cv93.JPG' },
  { id: 'Cv94', name: 'Dubai Infrastructure Director', archetype: 'executive-banner', category: 'specialized', primary: '#854d0e', secondary: '#ca8a04', headerStyle: 'banner', skillVariant: 'pills', timelineStyle: 'modern-node', dividerStyle: 'double-line', font: "'Outfit', sans-serif", thumbnail: '/templates/Cv94.JPG' },
  { id: 'Cv95', name: 'Cloud Platform FinOps', archetype: 'tech-grid', category: 'specialized', primary: '#065f46', secondary: '#10b981', headerStyle: 'left-bold', skillVariant: 'dots', timelineStyle: 'code-tag', dividerStyle: 'left-bar', font: "'Plus Jakarta Sans', sans-serif", thumbnail: '/templates/Cv95.JPG' },
  { id: 'Cv96', name: 'Madrid Telecommunications', archetype: 'modern-split', category: 'specialized', primary: '#991b1b', secondary: '#f87171', sidebarBg: '#fef2f2', sidebarText: '#7f1d1d', headerStyle: 'sidebar', skillVariant: 'badges', timelineStyle: 'accent-bullet', dividerStyle: 'solid-thin', font: "'Plus Jakarta Sans', sans-serif", thumbnail: '/templates/Cv96.JPG' },
  { id: 'Cv97', name: 'Federal Defense Clearance', archetype: 'minimal-ats', category: 'specialized', primary: '#18181b', secondary: '#27272a', headerStyle: 'left-bold', skillVariant: 'inline', timelineStyle: 'compact-clean', dividerStyle: 'solid-thick', font: "'Inter', sans-serif", density: 'compact', thumbnail: '/templates/Cv97.JPG' },
  { id: 'Cv98', name: 'Scandinavian Public Policy', archetype: 'compact-euro', category: 'specialized', primary: '#334155', secondary: '#059669', headerStyle: 'left-bold', skillVariant: 'pills', timelineStyle: 'date-rail', dividerStyle: 'solid-thin', font: "'Inter', sans-serif", thumbnail: '/templates/Cv98.JPG' },
  { id: 'Cv99', name: 'Autonomous Robotics Engineer', archetype: 'tech-grid', category: 'specialized', primary: '#d97706', secondary: '#f59e0b', headerStyle: 'left-bold', skillVariant: 'badges', timelineStyle: 'code-tag', dividerStyle: 'double-line', font: "'Fira Code', monospace", thumbnail: '/templates/Cv99.JPG' },
  { id: 'Cv100', name: 'Global Chief Executive Officer', archetype: 'executive-banner', category: 'specialized', primary: '#0f172a', secondary: '#d97706', headerStyle: 'banner', skillVariant: 'pills', timelineStyle: 'modern-node', dividerStyle: 'double-line', font: "'Outfit', sans-serif", density: 'spacious', thumbnail: '/templates/Cv100.JPG' },
];

export const COVER_TEMPLATES: TemplateMeta[] = [
  {
    id: 'Cover1',
    name: 'Executive Classic',
    archetype: 'cover-classic',
    category: 'professional',
    primary: '#2563eb',
    secondary: '#4f46e5',
    thumbnail: '/templates/Cover1.JPG',
    description: 'Centered executive letterhead with blue-indigo gradient accent divider.',
  },
  {
    id: 'Cover2',
    name: 'Modern Left-Aligned',
    archetype: 'cover-modern',
    category: 'modern',
    primary: '#0f172a',
    secondary: '#2563eb',
    thumbnail: '/templates/Cover2.JPG',
    description: 'Crisp, left-aligned executive layout with bold dark horizontal divider.',
  },
  {
    id: 'Cover3',
    name: 'Split Sidebar',
    archetype: 'cover-split',
    category: 'modern',
    primary: '#0f172a',
    secondary: '#2563eb',
    thumbnail: '/templates/Cover3.JPG',
    description: 'Editorial layout with recipient metadata rail and structured sender card.',
  },
  {
    id: 'Cover4',
    name: 'Accent Icons',
    archetype: 'cover-creative',
    category: 'creative',
    primary: '#1e40af',
    secondary: '#d97706',
    thumbnail: '/templates/Cover4.JPG',
    description: 'Modern creative header with vector contact icons and occupation badge.',
  },
];

const BY_ID = new Map(TEMPLATES.map((t) => [t.id, t]));
const COVER_BY_ID = new Map(COVER_TEMPLATES.map((t) => [t.id, t]));

/**
 * Resolve a catalog entry. Unknown ids throw: a resume must never silently
 * render as a different template. Route handlers translate the throw into an
 * explicit "template not found" state.
 */
export function getTemplateMeta(id: string): TemplateMeta {
  const meta = id.startsWith('Cover') ? COVER_BY_ID.get(id) : BY_ID.get(id);
  if (!meta) throw new Error(`Unknown resume template: ${id}`);
  return meta;
}

export function tryGetTemplateMeta(id: string): TemplateMeta | null {
  return (id.startsWith('Cover') ? COVER_BY_ID.get(id) : BY_ID.get(id)) ?? null;
}

export function getAllTemplates(): TemplateMeta[] {
  return TEMPLATES;
}

export function getAllCoverTemplates(): TemplateMeta[] {
  return COVER_TEMPLATES;
}

export function getTemplatesByCategory(category: string): TemplateMeta[] {
  if (!category || category === 'all') return TEMPLATES;
  return TEMPLATES.filter((t) => t.category === category);
}
