/**
 * Blog catalogue and marketing content.
 *
 * Both tabs were the last two surfaces rendering invented records: three sample articles in a
 * catalogue whose read called the non-existent `/blog/posts`, and four sections of marketing
 * data (phrases, testimonials, "Trusted By" logos, landing-page analytics) that no table,
 * route or document type backs.
 *
 * Pinned here: the blog read hits `/blog-data`, deleting carries the revision the route
 * requires, a refusal is reported rather than smoothed by a swallowed catch, and the marketing
 * tab offers only the two sections the backend serves.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AdminBlogManagementTab } from '@/components/admin/AdminBlogManagementTab';
import { AdminContentMarketingTab } from '@/components/admin/AdminContentMarketingTab';
import { del, get, post } from '@/lib/api-client';

vi.mock('@/lib/api-client', () => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
}));

const mockedGet = vi.mocked(get);
const mockedPost = vi.mocked(post);
const mockedDel = vi.mocked(del);

const posts = {
  success: true,
  posts: [
    {
      id: 'post-1',
      title: 'How ATS parsers read a two-column resume',
      slug: 'ats-two-column',
      category: 'Job Search',
      status: 'approved',
      publishedAt: '2026-10-20',
      revision: 7,
    },
  ],
};

beforeEach(() => {
  mockedGet.mockReset();
  mockedPost.mockReset();
  mockedDel.mockReset();
});

function renderBlog() {
  return render(
    <MemoryRouter>
      <AdminBlogManagementTab />
    </MemoryRouter>,
  );
}

describe('AdminBlogManagementTab', () => {
  it('reads the mounted blog route and renders the stored posts', async () => {
    mockedGet.mockResolvedValue(posts);
    renderBlog();

    expect(await screen.findByText('How ATS parsers read a two-column resume')).toBeInTheDocument();
    expect(screen.getByText('/blog/ats-two-column')).toBeInTheDocument();
    expect(mockedGet).toHaveBeenCalledWith(
      '/blog-data',
      expect.objectContaining({ limit: 100 }),
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  it('says the catalogue is empty instead of showing sample articles', async () => {
    mockedGet.mockResolvedValue({ success: true, posts: [] });
    renderBlog();

    expect(await screen.findByText('No article yet')).toBeInTheDocument();
  });

  it('reports an unavailable blog store with code and request id', async () => {
    mockedGet.mockRejectedValue({
      response: { status: 503, data: { error: { code: 'BLOG_STORE_UNAVAILABLE', message: 'The blog store is unavailable.', requestId: 'rq-blog-1' } } },
    });
    renderBlog();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('BLOG_STORE_UNAVAILABLE');
    expect(alert).toHaveTextContent('rq-blog-1');
  });

  it('deletes with the revision the route demands and reports a conflict', async () => {
    mockedGet.mockResolvedValue(posts);
    mockedDel.mockRejectedValue({
      response: { status: 409, data: { error: { code: 'CAS_CONFLICT', message: 'The article changed since it was read.', requestId: 'rq-blog-2' } } },
    });
    renderBlog();

    await userEvent.click(await screen.findByTitle('Delete article'));
    await userEvent.click(screen.getByRole('button', { name: 'Delete Article' }));

    expect(mockedDel).toHaveBeenCalledWith('/blog-data/post-1', { expectedRevision: 7 });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('CAS_CONFLICT');
    expect(alert).toHaveTextContent('rq-blog-2');
  });
});

describe('AdminContentMarketingTab', () => {
  it('renders the stored phrase categories and writes the whole category back', async () => {
    mockedGet.mockResolvedValue({
      success: true,
      categories: [{ id: 'technical', name: 'technical', phrases: ['Architected a zero-downtime migration'], revision: 4 }],
    });
    mockedPost.mockResolvedValue({ success: true });

    render(<AdminContentMarketingTab />);
    expect(await screen.findByText('Architected a zero-downtime migration')).toBeInTheDocument();
    expect(mockedGet).toHaveBeenCalledWith('/phrases', undefined, expect.objectContaining({ signal: expect.anything() }));

    await userEvent.type(screen.getByLabelText('New phrase'), 'Reduced p99 latency by 38%');
    await userEvent.click(screen.getByRole('button', { name: /add phrase/i }));

    expect(mockedPost).toHaveBeenCalledWith('/phrases', {
      categories: { technical: ['Architected a zero-downtime migration', 'Reduced p99 latency by 38%'] },
    });
  });

  it('offers only the two sections the backend serves, not invented logo and SEO panels', () => {
    mockedGet.mockResolvedValue({ success: true, categories: [] });
    render(<AdminContentMarketingTab />);

    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'ATS phrase dictionary',
      'Testimonials',
    ]);
    expect(screen.queryByText(/trusted by/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/landing page/i)).not.toBeInTheDocument();
  });

  it('says the dictionary is empty rather than seeding example phrases', async () => {
    mockedGet.mockResolvedValue({ success: true, categories: [] });
    render(<AdminContentMarketingTab />);

    expect(await screen.findByText('No phrase category')).toBeInTheDocument();
  });

  it('reports a refused phrase write with code and request id', async () => {
    mockedGet.mockResolvedValue({
      success: true,
      categories: [{ id: 'technical', name: 'technical', phrases: ['Existing phrase'], revision: 1 }],
    });
    mockedPost.mockRejectedValue({
      response: { status: 403, data: { error: { code: 'INSUFFICIENT_PERMISSION', message: 'system.config.write is required.', requestId: 'rq-cms-1' } } },
    });

    render(<AdminContentMarketingTab />);
    await userEvent.type(await screen.findByLabelText('New phrase'), 'Another phrase');
    await userEvent.click(screen.getByRole('button', { name: /add phrase/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('INSUFFICIENT_PERMISSION');
    expect(alert).toHaveTextContent('rq-cms-1');
  });
});
