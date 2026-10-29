export interface Listing {
  id: string; title: string; company: string; location: string; type: 'full-time' | 'part-time' | 'contract' | 'internship' | 'remote' | 'unknown';
  description: string; skills: string[]; postedAt: string; featured?: boolean; workplace?: string;
}
const text = (x: unknown) => typeof x === 'string' ? x : '';
export function parseJobListings(value: unknown): Listing[] {
  if (!value || typeof value !== 'object' || !('success' in value) || value.success !== true || !('jobs' in value) || !Array.isArray(value.jobs)) throw new Error('Invalid job listings response');
  return value.jobs.map((item: unknown) => {
    if (!item || typeof item !== 'object') throw new Error('Invalid job listing');
    const row = item as Record<string, unknown>;
    if (typeof row.id !== 'string' || !row.id || typeof row.title !== 'string' || !row.title) throw new Error('Invalid job listing');
    const rawType = text(row.job_type || row.jobType || row.type).toLowerCase().replace(/\s+/g, '-');
    const type = (['full-time', 'part-time', 'contract', 'internship', 'remote'].includes(rawType) ? rawType : 'unknown') as Listing['type'];
    return { id: row.id, title: row.title, company: text(row.company_name || row.companyName || row.company) || 'Company unavailable', location: text(row.location), type,
      description: text(row.description), skills: Array.isArray(row.skills) ? row.skills.filter((skill): skill is string => typeof skill === 'string') : [],
      postedAt: text(row.created_at || row.createdAt || row.postedAt), workplace: text(row.workplace_type || row.workplaceType), featured: row.featured === true || row.featured === 1 };
  });
}
export function filterJobListings(jobs: Listing[], query: string, location: string, type: string): Listing[] {
  const q = query.trim().toLowerCase(); const place = location.trim().toLowerCase();
  return jobs.filter(job => (!q || [job.title, job.company, job.description, ...job.skills].some(v => v.toLowerCase().includes(q))) && (!place || job.location.toLowerCase().includes(place)) && (type === 'All' || job.type === type.toLowerCase() || (type === 'Remote' && job.workplace?.toLowerCase() === 'remote')));
}
