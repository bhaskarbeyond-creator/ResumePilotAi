import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
/**
 * Content & Marketing CMS Sub-Module Tab
 *
 * Encompasses:
 * 1. ATS Action Phrases Dictionary (Localization & Phrases)
 * 2. Reviews & Testimonials Moderation
 * 3. Trusted By Logo Registry
 * 4. Dynamic Landing Pages Directory
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  BookOpen,
  Star,
  Building,
  Globe,
  Plus,
  CheckCircle2,
  XCircle,
  Trash2,
  ExternalLink,
} from 'lucide-react';

interface PhraseItem {
  id: string;
  phrase: string;
  category: 'Leadership' | 'Technical' | 'Innovation' | 'Operations' | 'Finance';
  impactLevel: 'High' | 'Executive' | 'Standard';
  language: string;
}

interface ReviewItem {
  id: string;
  author: string;
  role: string;
  company: string;
  rating: number;
  content: string;
  status: 'approved' | 'pending' | 'rejected';
  date: string;
}

interface TrustedByItem {
  id: string;
  name: string;
  category: 'Enterprise' | 'Scaleup' | 'Tech' | 'Global';
  logoPlaceholder: string;
  status: 'active' | 'inactive';
  sortOrder: number;
}

interface LandingPageItem {
  id: string;
  slug: string;
  title: string;
  category: string;
  views: number;
  conversionRate: string;
  status: 'published' | 'draft';
}

const INITIAL_PHRASES: PhraseItem[] = [
  { id: 'p1', phrase: 'Spearheaded zero-downtime distributed system migration reducing latency by 42%', category: 'Technical', impactLevel: 'Executive', language: 'en' },
  { id: 'p2', phrase: 'Orchestrated cross-functional product roadmap driving $14M ARR expansion across EMEA', category: 'Leadership', impactLevel: 'Executive', language: 'en' },
  { id: 'p3', phrase: 'Formulated automated QA regression gates cutting bug-escape velocity to sub-0.1%', category: 'Operations', impactLevel: 'High', language: 'en' },
  { id: 'p4', phrase: 'Engineered high-throughput event sourcing pipeline processing 850k events/sec', category: 'Innovation', impactLevel: 'Executive', language: 'en' },
  { id: 'p5', phrase: 'Standardized SOC2 Type II compliance framework across multi-cloud tenant architecture', category: 'Finance', impactLevel: 'High', language: 'en' },
];

const INITIAL_REVIEWS: ReviewItem[] = [
  { id: 'r1', author: 'Elena Rostova', role: 'Principal Architect', company: 'HyperScale Corp', rating: 5, content: 'The Cuba Design system and 12-step resume builder completely streamlined our executive candidate presentations. ATS match jumped instantly.', status: 'approved', date: '2026-10-12' },
  { id: 'r2', author: 'Marcus Vance', role: 'VP of Engineering', company: 'Nexus Logistics', rating: 5, content: 'DOCX high-fidelity export preserved all column layouts flawlessly. Unbelievably accurate ATS phrase suggestions.', status: 'approved', date: '2026-10-15' },
  { id: 'r3', author: 'Aria Chen', role: 'Staff SRE', company: 'CloudWave', rating: 4, content: 'Multi-provider AI failover worked seamlessly when OpenAI experienced quota spikes. Great platform.', status: 'pending', date: '2026-10-17' },
];

const INITIAL_TRUSTED: TrustedByItem[] = [
  { id: 't1', name: 'Google Cloud Partner', category: 'Enterprise', logoPlaceholder: 'GCP', status: 'active', sortOrder: 1 },
  { id: 't2', name: 'NVIDIA Inception', category: 'Tech', logoPlaceholder: 'NVDA', status: 'active', sortOrder: 2 },
  { id: 't3', name: 'Microsoft for Startups', category: 'Enterprise', logoPlaceholder: 'MSFT', status: 'active', sortOrder: 3 },
  { id: 't4', name: 'AWS Activate', category: 'Global', logoPlaceholder: 'AWS', status: 'active', sortOrder: 4 },
  { id: 't5', name: 'Stripe Climate', category: 'Scaleup', logoPlaceholder: 'STRP', status: 'active', sortOrder: 5 },
];

const INITIAL_PAGES: LandingPageItem[] = [
  { id: 'lp1', slug: '/executive-resume-builder', title: 'Executive Resume Builder & ATS Optimizer', category: 'Executive', views: 24190, conversionRate: '14.2%', status: 'published' },
  { id: 'lp2', slug: '/ai-interview-preparation', title: 'AI Mock Interview Coach with Real-Time Audio', category: 'Interview', views: 18450, conversionRate: '18.9%', status: 'published' },
  { id: 'lp3', slug: '/enterprise-talent-cloud', title: 'Multi-Tenant Enterprise Talent Cloud for Organizations', category: 'Enterprise', views: 8900, conversionRate: '9.4%', status: 'published' },
];

export function AdminContentMarketingTab() {
  const [phraseOpen, setPhraseOpen] = useState(false);
  const [subTab, setSubTab] = useState<'phrases' | 'reviews' | 'trusted' | 'landing'>('phrases');
  
  // Phrases State
  const [phrases, setPhrases] = useState<PhraseItem[]>(INITIAL_PHRASES);
  const [searchPhrase, setSearchPhrase] = useState('');
  const [newPhraseText, setNewPhraseText] = useState('');
  const [newPhraseCategory, setNewPhraseCategory] = useState<PhraseItem['category']>('Technical');
  
  // Reviews State
  const [reviews, setReviews] = useState<ReviewItem[]>(INITIAL_REVIEWS);
  
  // Trusted By State
  const [trustedList, setTrustedList] = useState<TrustedByItem[]>(INITIAL_TRUSTED);
  const [newBrandName, setNewBrandName] = useState('');
  
  // Landing Pages State
  const [landingPages] = useState<LandingPageItem[]>(INITIAL_PAGES);

  const handleAddPhrase = () => {
    if (!newPhraseText.trim()) return;
    const item: PhraseItem = {
      id: `p_${Date.now()}`,
      phrase: newPhraseText.trim(),
      category: newPhraseCategory,
      impactLevel: 'High',
      language: 'en',
    };
    setPhrases([item, ...phrases]);
    setNewPhraseText('');
    setPhraseOpen(false);
  };

  const handleDeletePhrase = (id: string) => {
    setPhrases(phrases.filter(p => p.id !== id));
  };

  const handleReviewAction = (id: string, status: 'approved' | 'rejected') => {
    setReviews(reviews.map(r => r.id === id ? { ...r, status } : r));
  };

  const handleToggleTrusted = (id: string) => {
    setTrustedList(trustedList.map(t => t.id === id ? { ...t, status: t.status === 'active' ? 'inactive' : 'active' } : t));
  };

  const handleAddTrusted = () => {
    if (!newBrandName.trim()) return;
    const item: TrustedByItem = {
      id: `t_${Date.now()}`,
      name: newBrandName.trim(),
      category: 'Enterprise',
      logoPlaceholder: newBrandName.trim().slice(0, 4).toUpperCase(),
      status: 'active',
      sortOrder: trustedList.length + 1,
    };
    setTrustedList([...trustedList, item]);
    setNewBrandName('');
  };

  const filteredPhrases = phrases.filter(p =>
    p.phrase.toLowerCase().includes(searchPhrase.toLowerCase()) ||
    p.category.toLowerCase().includes(searchPhrase.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <p role="status" className="rounded-xl border border-border p-3 text-sm">LOCAL DEMO — This existing marketing editor uses sample data and in-memory changes only. Changes are not published to the ATS engine or public website.</p>
      {/* Navigation Sub-Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex gap-2">
          <Button
            variant={subTab === 'phrases' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setSubTab('phrases')}
          >
            <BookOpen className="mr-1.5 size-4" />
            ATS Phrases Dictionary
          </Button>
          <Button
            variant={subTab === 'reviews' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setSubTab('reviews')}
          >
            <Star className="mr-1.5 size-4" />
            Reviews & Testimonials ({reviews.filter(r => r.status === 'pending').length} Pending)
          </Button>
          <Button
            variant={subTab === 'trusted' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setSubTab('trusted')}
          >
            <Building className="mr-1.5 size-4" />
            Trusted By Logos
          </Button>
          <Button
            variant={subTab === 'landing' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setSubTab('landing')}
          >
            <Globe className="mr-1.5 size-4" />
            Landing Pages & SEO
          </Button>
        </div>
      </div>

      {/* ─── 1. ATS Phrases Dictionary ─── */}
      {subTab === 'phrases' && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <BookOpen className="size-4 text-brand-600" />
                Add Semantic Action Phrase to ATS Engine
              </CardTitle>
              <CardDescription>
                Preview semantic phrases in this local editor. Publishing integration is unavailable here.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => setPhraseOpen(true)}>Add ATS Keyword</Button>
              <Dialog open={phraseOpen} onOpenChange={setPhraseOpen}><DialogContent className="w-[calc(100%-2rem)] rounded-2xl md:rounded-3xl bg-surface/95 border-border backdrop-blur-xl motion-reduce:animate-none"><DialogTitle>Add ATS Keyword</DialogTitle><DialogDescription>Local preview only. This does not publish to the ATS service.</DialogDescription>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Input
                  aria-label="Action phrase" placeholder="Enter high-impact action phrase (e.g. Architected resilient multi-region...)"
                  value={newPhraseText}
                  onChange={(e) => setNewPhraseText(e.target.value)}
                  className="flex-1"
                />
                <select
                  aria-label="Phrase category"
                  value={newPhraseCategory}
                  onChange={(e) => setNewPhraseCategory(e.target.value as PhraseItem['category'])}
                  className="rounded-lg border border-border bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="Technical">Technical</option>
                  <option value="Leadership">Leadership</option>
                  <option value="Innovation">Innovation</option>
                  <option value="Operations">Operations</option>
                  <option value="Finance">Finance</option>
                </select>
                <Button variant="primary" onClick={handleAddPhrase}>
                  <Plus className="mr-1.5 size-4" />
                  Add Phrase
                </Button>
              </div>
              </DialogContent></Dialog>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base">Registered Action Phrases ({filteredPhrases.length})</CardTitle>
                <CardDescription>Actionable verbs and high-impact accomplishment templates</CardDescription>
              </div>
              <div className="w-64">
                <Input
                  placeholder="Filter phrases..."
                  value={searchPhrase}
                  onChange={(e) => setSearchPhrase(e.target.value)}
                />
              </div>
            </CardHeader>
            <CardContent>
              <div className="divide-y divide-border rounded-lg border border-border">
                {filteredPhrases.map((phrase) => (
                  <div key={phrase.id} className="flex items-center justify-between p-3 hover:bg-neutral-50 transition-colors">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-ink">{phrase.phrase}</p>
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center rounded-md bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">
                          {phrase.category}
                        </span>
                        <span className="inline-flex items-center rounded-md bg-purple-50 px-2 py-0.5 text-xs font-semibold text-purple-700">
                          {phrase.impactLevel} Impact
                        </span>
                        <span className="text-xs text-ink-muted uppercase">Lang: {phrase.language}</span>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon-sm" onClick={() => handleDeletePhrase(phrase.id)}>
                      <Trash2 className="size-4 text-error-600" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── 2. Reviews & Testimonials ─── */}
      {subTab === 'reviews' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Star className="size-4 text-amber-500 fill-amber-500" />
              Customer Testimonials & Verified Reviews Moderation
            </CardTitle>
            <CardDescription>
              Approved reviews are surfaced across the Surface 1 Public Website and Enterprise landing hubs.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {reviews.map((rev) => (
                <div key={rev.id} className="rounded-xl border border-border p-4 bg-white hover:border-brand-200 transition-colors">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-ink text-sm">{rev.author}</span>
                        <span className="text-xs text-ink-muted">· {rev.role} at {rev.company}</span>
                        <span className={cn(
                          'rounded-full px-2 py-0.5 text-xs font-bold uppercase',
                          rev.status === 'approved' ? 'bg-success-50 text-success-700' :
                          rev.status === 'pending' ? 'bg-amber-50 text-amber-700' :
                          'bg-error-50 text-error-700'
                        )}>
                          {rev.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 my-1.5">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={i}
                            className={cn('size-3.5', i < rev.rating ? 'text-amber-500 fill-amber-500' : 'text-neutral-300')}
                          />
                        ))}
                        <span className="ml-2 text-xs text-ink-muted">{rev.date}</span>
                      </div>
                      <p className="text-sm text-ink-secondary mt-1 italic">"{rev.content}"</p>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {rev.status !== 'approved' && (
                        <Button
                          variant="success"
                          size="xs"
                          onClick={() => handleReviewAction(rev.id, 'approved')}
                        >
                          <CheckCircle2 className="mr-1 size-3.5" />
                          Approve
                        </Button>
                      )}
                      {rev.status !== 'rejected' && (
                        <Button
                          variant="destructive"
                          size="xs"
                          onClick={() => handleReviewAction(rev.id, 'rejected')}
                        >
                          <XCircle className="mr-1 size-3.5" />
                          Reject
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── 3. Trusted By Logos ─── */}
      {subTab === 'trusted' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building className="size-4 text-brand-600" />
              Enterprise & Ecosystem Trust Badges
            </CardTitle>
            <CardDescription>
              Rendered on the Surface 1 landing page trust carousel and employer registration headers.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Partner or Organization Name (e.g. Snowflake, Datadog...)"
                value={newBrandName}
                onChange={(e) => setNewBrandName(e.target.value)}
                className="max-w-md"
              />
              <Button variant="primary" onClick={handleAddTrusted}>
                <Plus className="mr-1.5 size-4" />
                Add Brand Badge
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {trustedList.map((item) => (
                <div key={item.id} className="rounded-xl border border-border p-4 bg-neutral-50/60 flex flex-col justify-between items-center text-center gap-2">
                  <div className="flex size-14 items-center justify-center rounded-xl bg-white shadow-xs border border-border font-extrabold text-brand-700 text-sm">
                    {item.logoPlaceholder}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-ink">{item.name}</p>
                    <span className="text-xs text-ink-muted">{item.category}</span>
                  </div>
                  <Button
                    variant={item.status === 'active' ? 'outline' : 'ghost'}
                    size="xs"
                    onClick={() => handleToggleTrusted(item.id)}
                    className={cn(item.status === 'active' ? 'text-success-700 border-success-200 bg-success-50' : 'text-neutral-500')}
                  >
                    {item.status === 'active' ? 'Active' : 'Disabled'}
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── 4. Landing Pages Directory ─── */}
      {subTab === 'landing' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Globe className="size-4 text-brand-600" />
              Dynamic Landing Pages & Conversion Tracks
            </CardTitle>
            <CardDescription>
              SEO-targeted specialized landing paths with dynamic CTA tracking.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-left text-sm">
                <thead className="bg-neutral-50 text-xs font-semibold uppercase text-ink-muted">
                  <tr>
                    <th className="px-4 py-3">Slug / Path</th>
                    <th className="px-4 py-3">Page Title</th>
                    <th className="px-4 py-3">Audience Category</th>
                    <th className="px-4 py-3">Organic Views</th>
                    <th className="px-4 py-3">Conversion Rate</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-white">
                  {landingPages.map((lp) => (
                    <tr key={lp.id} className="hover:bg-neutral-50/50">
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-brand-600">{lp.slug}</td>
                      <td className="px-4 py-3 font-medium text-ink">{lp.title}</td>
                      <td className="px-4 py-3 text-ink-secondary">{lp.category}</td>
                      <td className="px-4 py-3 text-ink font-mono">{lp.views.toLocaleString()}</td>
                      <td className="px-4 py-3 font-semibold text-success-600">{lp.conversionRate}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-success-50 px-2 py-0.5 text-xs font-bold text-success-700 uppercase">
                          {lp.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="ghost" size="xs" onClick={() => window.open(lp.slug, '_blank')}>
                          <ExternalLink className="mr-1 size-3.5" />
                          Preview
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
