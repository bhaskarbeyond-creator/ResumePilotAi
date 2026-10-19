/**
 * Template Catalog — Canonical 51 CV Templates
 *
 * Full metadata for templates Cv1 through Cv51 with archetypes,
 * human-readable names, color accents, categories, and thumbnail URLs.
 */

export interface TemplateMeta {
  id: string;
  name: string;
  archetype: 'modern-split' | 'executive-banner' | 'minimal-ats' | 'tech-grid' | 'compact-euro';
  category: 'modern' | 'professional' | 'simple' | 'creative' | 'europass';
  primary: string;
  secondary: string;
  thumbnail: string;
  description?: string;
}

export const TEMPLATE_CATEGORIES = [
  { id: 'all', label: 'All Templates' },
  { id: 'modern', label: 'Modern Split' },
  { id: 'professional', label: 'Executive' },
  { id: 'simple', label: 'Simple / ATS' },
  { id: 'creative', label: 'Creative Tech' },
  { id: 'europass', label: 'Europass' },
] as const;

export const TEMPLATES: TemplateMeta[] = [
  { id: 'Cv1', name: 'Metropolitan Navy', archetype: 'modern-split', category: 'modern', primary: '#1e3a8a', secondary: '#3b82f6', thumbnail: '/templates/Cv1.JPG', description: 'Two-column layout with a crisp contact sidebar and balanced spacing.' },
  { id: 'Cv2', name: 'Nordic Slate', archetype: 'modern-split', category: 'modern', primary: '#0f172a', secondary: '#0ea5e9', thumbnail: '/templates/Cv2.JPG', description: 'Clean slate theme with minimalist two-column architecture.' },
  { id: 'Cv3', name: 'Emerald Executive', archetype: 'modern-split', category: 'modern', primary: '#065f46', secondary: '#10b981', thumbnail: '/templates/Cv3.JPG', description: 'Refined deep emerald styling for senior managers.' },
  { id: 'Cv4', name: 'Harvard Classic ATS', archetype: 'minimal-ats', category: 'simple', primary: '#111827', secondary: '#4b5563', thumbnail: '/templates/Cv4.JPG', description: 'Single-column, ATS-optimized layout with classic serif typography.' },
  { id: 'Cv5', name: 'Stanford Clean ATS', archetype: 'minimal-ats', category: 'simple', primary: '#1e293b', secondary: '#0ea5e9', thumbnail: '/templates/Cv5.JPG', description: 'Single-column, modern sans-serif ATS standard.' },
  { id: 'Cv6', name: 'Wall Street Modern', archetype: 'minimal-ats', category: 'simple', primary: '#0f172a', secondary: '#2563eb', thumbnail: '/templates/Cv6.JPG', description: 'High-density, metrics-focused financial layout.' },
  { id: 'Cv7', name: 'Sapphire Modern Split', archetype: 'modern-split', category: 'modern', primary: '#1d4ed8', secondary: '#60a5fa', thumbnail: '/templates/Cv7.JPG', description: 'Vibrant sapphire accent with structured sidebar.' },
  { id: 'Cv8', name: 'Crown Executive Banner', archetype: 'executive-banner', category: 'professional', primary: '#1e293b', secondary: '#3b82f6', thumbnail: '/templates/Cv8.JPG', description: 'Full-width header banner with structured two-column body.' },
  { id: 'Cv9', name: 'Cobalt Pro Split', archetype: 'modern-split', category: 'modern', primary: '#2563eb', secondary: '#38bdf8', thumbnail: '/templates/Cv9.JPG', description: 'Bold cobalt contrast with dark sidebar.' },
  { id: 'Cv10', name: 'Titanium Executive', archetype: 'executive-banner', category: 'professional', primary: '#334155', secondary: '#64748b', thumbnail: '/templates/Cv10.JPG', description: 'Distinguished grey titanium header with subtle dividers.' },
  { id: 'Cv11', name: 'Prism Executive Banner', archetype: 'executive-banner', category: 'professional', primary: '#4338ca', secondary: '#818cf8', thumbnail: '/templates/Cv11.JPG', description: 'Gradient banner with modern executive authority.' },
  { id: 'Cv12', name: 'Cambridge Minimal', archetype: 'minimal-ats', category: 'simple', primary: '#18181b', secondary: '#71717a', thumbnail: '/templates/Cv12.JPG', description: 'Understated academic single-column structure.' },
  { id: 'Cv13', name: 'Oxford Elegant ATS', archetype: 'minimal-ats', category: 'simple', primary: '#09090b', secondary: '#52525b', thumbnail: '/templates/Cv13.JPG', description: 'Refined editorial styling with immaculate spacing.' },
  { id: 'Cv14', name: 'Geneva Compact', archetype: 'minimal-ats', category: 'simple', primary: '#27272a', secondary: '#3f3f46', thumbnail: '/templates/Cv14.JPG', description: 'Compact single-column European standard.' },
  { id: 'Cv15', name: 'Silicon Valley ATS', archetype: 'minimal-ats', category: 'simple', primary: '#0284c7', secondary: '#0369a1', thumbnail: '/templates/Cv15.JPG', description: 'Tech recruiter-preferred standard resume layout.' },
  { id: 'Cv16', name: 'Apex Executive', archetype: 'executive-banner', category: 'professional', primary: '#0f172a', secondary: '#f59e0b', thumbnail: '/templates/Cv16.JPG', description: 'Executive dark banner with warm amber accents.' },
  { id: 'Cv17', name: 'Vanguard Header', archetype: 'executive-banner', category: 'professional', primary: '#1e1b4b', secondary: '#6366f1', thumbnail: '/templates/Cv17.JPG', description: 'Deep indigo banner with crisp skill chips.' },
  { id: 'Cv18', name: 'Monochrome Essential', archetype: 'minimal-ats', category: 'simple', primary: '#000000', secondary: '#404040', thumbnail: '/templates/Cv18.JPG', description: 'Pure black-and-white minimalist design.' },
  { id: 'Cv19', name: 'Federal Standard ATS', archetype: 'minimal-ats', category: 'simple', primary: '#1e3a8a', secondary: '#1d4ed8', thumbnail: '/templates/Cv19.JPG', description: 'Government and institutional compliance layout.' },
  { id: 'Cv20', name: 'Pacific Blue Split', archetype: 'modern-split', category: 'modern', primary: '#0284c7', secondary: '#38bdf8', thumbnail: '/templates/Cv20.JPG', description: 'Modern two-column layout with breezy cyan accents.' },
  { id: 'Cv21', name: 'Meridian Executive', archetype: 'executive-banner', category: 'professional', primary: '#1c1917', secondary: '#d97706', thumbnail: '/templates/Cv21.JPG', description: 'Warm amber executive banner layout.' },
  { id: 'Cv22', name: 'Helvetica Pure ATS', archetype: 'minimal-ats', category: 'simple', primary: '#18181b', secondary: '#27272a', thumbnail: '/templates/Cv22.JPG', description: 'Swiss typographic clarity for ATS crawlers.' },
  { id: 'Cv23', name: 'Imperial Banner', archetype: 'executive-banner', category: 'professional', primary: '#581c87', secondary: '#a855f7', thumbnail: '/templates/Cv23.JPG', description: 'Regal purple styling with two-column content.' },
  { id: 'Cv24', name: 'Cyberpunk Tech Split', archetype: 'modern-split', category: 'creative', primary: '#0f172a', secondary: '#06b6d4', thumbnail: '/templates/Cv24.JPG', description: 'High-contrast tech grid with terminal styling.' },
  { id: 'Cv25', name: 'Full-Stack Developer Grid', archetype: 'tech-grid', category: 'creative', primary: '#0f172a', secondary: '#10b981', thumbnail: '/templates/Cv25.JPG', description: 'Code-first layout with dedicated repository badges.' },
  { id: 'Cv26', name: 'Slate Teal Modern', archetype: 'modern-split', category: 'modern', primary: '#0f766e', secondary: '#14b8a6', thumbnail: '/templates/Cv26.JPG', description: 'Balanced teal and charcoal two-column presentation.' },
  { id: 'Cv27', name: 'Ruby Creative Split', archetype: 'modern-split', category: 'creative', primary: '#be123c', secondary: '#f43f5e', thumbnail: '/templates/Cv27.JPG', description: 'Eye-catching crimson accent for creative leaders.' },
  { id: 'Cv28', name: 'DevOps Terminal Grid', archetype: 'tech-grid', category: 'creative', primary: '#18181b', secondary: '#22c55e', thumbnail: '/templates/Cv28.JPG', description: 'Matrix green terminal aesthetic with skill meters.' },
  { id: 'Cv29', name: 'Nordic Forest Split', archetype: 'modern-split', category: 'modern', primary: '#14532d', secondary: '#22c55e', thumbnail: '/templates/Cv29.JPG', description: 'Earthy forest tones with clean contact column.' },
  { id: 'Cv30', name: 'Sovereign Executive', archetype: 'executive-banner', category: 'professional', primary: '#1e293b', secondary: '#0ea5e9', thumbnail: '/templates/Cv30.JPG', description: 'C-suite presentation with structured bio section.' },
  { id: 'Cv31', name: 'Europass Academic Classic', archetype: 'compact-euro', category: 'europass', primary: '#0284c7', secondary: '#0369a1', thumbnail: '/templates/Cv31.JPG', description: 'Standard European Commission CV layout with date gutter.' },
  { id: 'Cv32', name: 'Europass Blue Modern', archetype: 'compact-euro', category: 'europass', primary: '#1d4ed8', secondary: '#3b82f6', thumbnail: '/templates/Cv32.JPG', description: 'Modernized Europass standard with enhanced readability.' },
  { id: 'Cv33', name: 'Europass Slate Pro', archetype: 'compact-euro', category: 'europass', primary: '#334155', secondary: '#64748b', thumbnail: '/templates/Cv33.JPG', description: 'Executive grey European layout with date gutter.' },
  { id: 'Cv34', name: 'Metropolis Banner', archetype: 'executive-banner', category: 'professional', primary: '#0f172a', secondary: '#3b82f6', thumbnail: '/templates/Cv34.JPG', description: 'High-contrast modern metropolitan banner.' },
  { id: 'Cv35', name: 'Cloud Architect Grid', archetype: 'tech-grid', category: 'creative', primary: '#1e3a8a', secondary: '#38bdf8', thumbnail: '/templates/Cv35.JPG', description: 'Architectural tech badges and certifications section.' },
  { id: 'Cv36', name: 'Diplomat Executive', archetype: 'executive-banner', category: 'professional', primary: '#1f2937', secondary: '#9ca3af', thumbnail: '/templates/Cv36.JPG', description: 'Formal diplomatic layout with understated elegance.' },
  { id: 'Cv37', name: 'Europass Forest Green', archetype: 'compact-euro', category: 'europass', primary: '#166534', secondary: '#22c55e', thumbnail: '/templates/Cv37.JPG', description: 'Environmental and academic European curriculum vitae.' },
  { id: 'Cv38', name: 'Princeton Clean ATS', archetype: 'minimal-ats', category: 'simple', primary: '#111827', secondary: '#ea580c', thumbnail: '/templates/Cv38.JPG', description: 'Single-column Ivy League layout with subtle orange highlight.' },
  { id: 'Cv39', name: 'Indigo Modern Split', archetype: 'modern-split', category: 'modern', primary: '#3730a3', secondary: '#6366f1', thumbnail: '/templates/Cv39.JPG', description: 'Executive electric indigo palette with sidebar.' },
  { id: 'Cv40', name: 'Data Scientist Tech Grid', archetype: 'tech-grid', category: 'creative', primary: '#0f172a', secondary: '#a855f7', thumbnail: '/templates/Cv40.JPG', description: 'Layout optimized for algorithms, modeling, and publications.' },
  { id: 'Cv41', name: 'Europass Burgundy Classic', archetype: 'compact-euro', category: 'europass', primary: '#881337', secondary: '#e11d48', thumbnail: '/templates/Cv41.JPG', description: 'Distinguished burgundy academic European format.' },
  { id: 'Cv42', name: 'AI Engineer Matrix', archetype: 'tech-grid', category: 'creative', primary: '#09090b', secondary: '#06b6d4', thumbnail: '/templates/Cv42.JPG', description: 'High-tech AI/ML engineering resume with model badges.' },
  { id: 'Cv43', name: 'Europass Navy Academic', archetype: 'compact-euro', category: 'europass', primary: '#1e3a8a', secondary: '#2563eb', thumbnail: '/templates/Cv43.JPG', description: 'Classic university researcher curriculum vitae.' },
  { id: 'Cv44', name: 'Times Minimal ATS', archetype: 'minimal-ats', category: 'simple', primary: '#171717', secondary: '#525252', thumbnail: '/templates/Cv44.JPG', description: 'Traditional newsprint serif clarity with zero ATS friction.' },
  { id: 'Cv45', name: 'Fullstack React Grid', archetype: 'tech-grid', category: 'creative', primary: '#082f49', secondary: '#0284c7', thumbnail: '/templates/Cv45.JPG', description: 'Front-end and full-stack component portfolio layout.' },
  { id: 'Cv46', name: 'Cybersecurity Analyst Grid', archetype: 'tech-grid', category: 'creative', primary: '#1c1917', secondary: '#ef4444', thumbnail: '/templates/Cv46.JPG', description: 'Security certifications, clearance, and audit-focused grid.' },
  { id: 'Cv47', name: 'Coral Modern Split', archetype: 'modern-split', category: 'modern', primary: '#9f1239', secondary: '#f43f5e', thumbnail: '/templates/Cv47.JPG', description: 'Warm coral accent with structured contact rail.' },
  { id: 'Cv48', name: 'Onyx Sleek Split', archetype: 'modern-split', category: 'modern', primary: '#09090b', secondary: '#3b82f6', thumbnail: '/templates/Cv48.JPG', description: 'Ultra-modern dark aesthetic with electric blue highlight.' },
  { id: 'Cv49', name: 'Product Manager Grid', archetype: 'tech-grid', category: 'creative', primary: '#1e293b', secondary: '#8b5cf6', thumbnail: '/templates/Cv49.JPG', description: 'Metrics, OKRs, and cross-functional leadership focus.' },
  { id: 'Cv50', name: 'Verdant Modern Split', archetype: 'modern-split', category: 'modern', primary: '#064e3b', secondary: '#10b981', thumbnail: '/templates/Cv50.JPG', description: 'Refreshing botanical emerald two-column presentation.' },
  { id: 'Cv51', name: 'Europass Executive Modern', archetype: 'modern-split', category: 'europass', primary: '#1e3a8a', secondary: '#0ea5e9', thumbnail: '/templates/Cv51.JPG', description: 'The flagship Europass Modern Split with complete contact rail.' },
];

const BY_ID = new Map(TEMPLATES.map((t) => [t.id, t]));

export function getTemplateMeta(id: string): TemplateMeta {
  return BY_ID.get(id) || TEMPLATES[0];
}

export function getAllTemplates(): TemplateMeta[] {
  return TEMPLATES;
}

export function getTemplatesByCategory(category: string): TemplateMeta[] {
  if (!category || category === 'all') return TEMPLATES;
  return TEMPLATES.filter((t) => t.category === category);
}
