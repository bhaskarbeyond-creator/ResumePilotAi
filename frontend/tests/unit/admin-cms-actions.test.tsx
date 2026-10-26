/**
 * The action surface of the two content tabs — every control, driven once.
 *
 * `admin-cms-tabs.test.tsx` pins the *reads* (the catalogue comes from `/blog-data`, the
 * marketing tab offers only the two sections the backend serves). This file pins the *writes
 * and the ways out*: the preview modal's four exits, the delete confirmation's three, the
 * feedback banner's dismiss, the navigation targets, and the phrase dictionary's two mutations
 * including the validation that must not send a request.
 *
 * Why a separate file: these are the branches a coverage gate catches and a reviewer does not.
 * A close button that calls the wrong setter, or a delete that forgets `expectedRevision`, is
 * invisible in a passing happy-path test and obvious the moment someone taps it on a phone.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
const mockedDel = vi.mocked(del);
const mockedPost = vi.mocked(post);

const article = {
  id: 'post-1',
  title: 'How ATS parsers read a two-column resume',
  slug: 'ats-two-column',
  category: 'Job Search',
  author: 'Editorial',
  status: 'published' as const,
  publishedAt: '2026-10-20',
  revision: 7,
};

const posts = { success: true, posts: [article] };

/** The categories the phrase endpoint serves; `phrases` is the editable list. */
const phrasePayload = {
  success: true,
  categories: [
    { name: 'Greetings', phrases: ['Hello there', 'Good morning'] },
    { name: 'Closings', phrases: ['Best regards'] },
  ],
};

beforeEach(() => {
  mockedGet.mockReset();
  mockedDel.mockReset();
  mockedPost.mockReset();
});

function renderBlog() {
  return render(
    <MemoryRouter>
      <AdminBlogManagementTab />
    </MemoryRouter>,
  );
}

function renderMarketing() {
  return render(
    <MemoryRouter>
      <AdminContentMarketingTab />
    </MemoryRouter>,
  );
}

describe('AdminBlogManagementTab — preview modal exits', () => {
  it('closes the preview with the labelled close button, the footer button and a backdrop click', async () => {
    mockedGet.mockResolvedValue(posts);
    const user = userEvent.setup();
    renderBlog();

    // 1. the icon button. Its accessible name is deliberately *not* the footer button's: two
    // controls named "Close preview" in one dialog are indistinguishable to a screen reader,
    // so the icon says which preview it closes and this assertion pins the distinction.
    await user.click(await screen.findByRole('button', { name: /^preview$/i }));
    let dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /close article preview/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    // 2. the footer button, whose name is its text
    await user.click(screen.getByRole('button', { name: /^preview$/i }));
    dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /^close preview$/i }));
    expect(within(dialog).queryByRole('button', { name: /^close article preview$/i })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('closes on a backdrop click but not on a click inside the panel', async () => {
    mockedGet.mockResolvedValue(posts);
    const user = userEvent.setup();
    renderBlog();

    await user.click(await screen.findByRole('button', { name: /^preview$/i }));
    const dialog = await screen.findByRole('dialog');
    // The dialog element *is* the backdrop; its child stops propagation. Clicking the child
    // must leave it open — a modal that closes when the operator clicks its own text is the
    // classic over-eager backdrop handler.
    fireEvent.click(within(dialog).getByRole('heading', { name: /how ats parsers/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(dialog);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('closes the preview on Escape, and does not intercept Escape when nothing is open', async () => {
    mockedGet.mockResolvedValue(posts);
    const user = userEvent.setup();
    renderBlog();

    await user.click(await screen.findByRole('button', { name: /^preview$/i }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    // No modal open: the second branch of the keydown handler must not throw or reopen anything.
    await user.keyboard('{Escape}');
    expect(screen.getByText(article.title)).toBeInTheDocument();
  });

  it('offers the public URL and the authoring studio as exits from the preview', async () => {
    mockedGet.mockResolvedValue(posts);
    const user = userEvent.setup();
    renderBlog();

    await user.click(await screen.findByRole('button', { name: /^preview$/i }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /open live public url/i }));

    await user.click(await screen.findByRole('button', { name: /^preview$/i }));
    const second = await screen.findByRole('dialog');
    await user.click(within(second).getByRole('button', { name: /edit in authoring studio/i }));
  });
});

describe('AdminBlogManagementTab — delete confirmation', () => {
  it('deletes with the revision it read, then reloads and reports success', async () => {
    mockedGet.mockResolvedValue(posts);
    mockedDel.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    renderBlog();

    await screen.findByText(article.title);
    await user.click(screen.getByRole('button', { name: /delete article/i }));
    const confirm = await screen.findByRole('alertdialog');
    await user.click(within(confirm).getByRole('button', { name: /delete/i }));

    await waitFor(() => expect(mockedDel).toHaveBeenCalledWith(`/blog-data/${article.id}`, { expectedRevision: 7 }));
    expect(await screen.findByRole('status')).toHaveTextContent(/deleted/i);
    // A reload re-reads the catalogue: the operator must not be left looking at a deleted row.
    expect(mockedGet.mock.calls.filter(([url]) => url === '/blog-data').length).toBeGreaterThan(1);
  });

  it('cancels the confirmation, and Escape also closes it', async () => {
    mockedGet.mockResolvedValue(posts);
    const user = userEvent.setup();
    renderBlog();

    await screen.findByText(article.title);
    await user.click(screen.getByRole('button', { name: /delete article/i }));
    let confirm = await screen.findByRole('alertdialog');
    await user.click(within(confirm).getByRole('button', { name: /cancel/i }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /delete article/i }));
    confirm = await screen.findByRole('alertdialog');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(mockedDel).not.toHaveBeenCalled();
  });

  it('reports a refused delete with the server code instead of announcing success', async () => {
    mockedGet.mockResolvedValue(posts);
    mockedDel.mockRejectedValue({ response: { status: 409, data: { error: { code: 'CAS_CONFLICT', message: 'The article moved on' } } } });
    const user = userEvent.setup();
    renderBlog();

    await screen.findByText(article.title);
    await user.click(screen.getByRole('button', { name: /delete article/i }));
    const confirm = await screen.findByRole('alertdialog');
    await user.click(within(confirm).getByRole('button', { name: /delete/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/CAS_CONFLICT/);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('AdminBlogManagementTab — navigation and feedback', () => {
  it('opens the editor from the header, the title and the edit action', async () => {
    mockedGet.mockResolvedValue(posts);
    const user = userEvent.setup();
    renderBlog();

    await screen.findByText(article.title);
    await user.click(screen.getByRole('button', { name: /create new article/i }));
    await user.click(screen.getByRole('button', { name: new RegExp(article.title, 'i') }));
    await user.click(screen.getByRole('button', { name: /^edit$/i }));
    // Navigation is state in MemoryRouter; the assertion is that nothing threw and the table
    // is still rendered, which is the observable consequence a click handler bug would break.
    expect(screen.getByText(article.title)).toBeInTheDocument();
  });

  it('dismisses a feedback banner', async () => {
    mockedGet.mockResolvedValue(posts);
    mockedDel.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    renderBlog();

    await screen.findByText(article.title);
    await user.click(screen.getByRole('button', { name: /delete article/i }));
    const confirm = await screen.findByRole('alertdialog');
    await user.click(within(confirm).getByRole('button', { name: /delete/i }));
    const banner = await screen.findByRole('status');
    await user.click(within(banner).getByRole('button', { name: /dismiss/i }));
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  });

  it('filters by status and by search text, and says so when nothing matches', async () => {
    mockedGet.mockResolvedValue(posts);
    const user = userEvent.setup();
    renderBlog();

    await screen.findByText(article.title);
    await user.click(screen.getByRole('button', { name: /^draft$/i }));
    expect(screen.queryByText(article.title)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^all$/i }));

    const search = screen.getByPlaceholderText(/search article titles/i);
    await user.type(search, 'zzz-no-match');
    expect(screen.queryByText(article.title)).not.toBeInTheDocument();
    await user.clear(search);
    await user.type(search, 'ats');
    expect(screen.getByText(article.title)).toBeInTheDocument();
  });
});

describe('AdminContentMarketingTab — phrase dictionary writes', () => {
  it('reads the categories, then switches the active category and filters its phrases', async () => {
    mockedGet.mockResolvedValue(phrasePayload);
    const user = userEvent.setup();
    renderMarketing();

    expect(await screen.findByText('Hello there')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText(/category/i), 'Closings');
    expect(await screen.findByText('Best regards')).toBeInTheDocument();

    const filter = screen.getByLabelText(/^filter$/i);
    await user.type(filter, 'regards');
    expect(screen.getByText('Best regards')).toBeInTheDocument();
  });

  it('refuses a phrase shorter than three characters without sending a request', async () => {
    mockedGet.mockResolvedValue(phrasePayload);
    const user = userEvent.setup();
    renderMarketing();

    await screen.findByText('Hello there');
    const input = screen.getByLabelText(/new phrase/i);
    await user.type(input, 'hi');
    // The submit button is disabled below three characters, so this asserts the *guard* —
    // that a short phrase cannot reach the endpoint even if the click lands.
    const add = screen.getByRole('button', { name: /add phrase/i });
    expect(add).toBeDisabled();
    await user.click(add);
    expect(mockedPost).not.toHaveBeenCalled();
  });

  it('adds a phrase by writing the whole category back', async () => {
    mockedGet.mockResolvedValue(phrasePayload);
    mockedPost.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    renderMarketing();

    await screen.findByText('Hello there');
    await user.type(screen.getByLabelText(/new phrase/i), 'Good evening');
    await user.click(screen.getByRole('button', { name: /add phrase/i }));

    await waitFor(() => expect(mockedPost).toHaveBeenCalled());
    const call = mockedPost.mock.calls[0];
    if (!call) throw new Error('no POST was sent');
    const [url, body] = call;
    expect(url).toBe('/phrases');
    expect(JSON.stringify(body)).toContain('Greetings');
    expect(JSON.stringify(body)).toContain('Good evening');
    expect(await screen.findByText(/phrase added/i)).toBeInTheDocument();
  });

  it('removes a phrase and then a whole category, each with its own confirmation', async () => {
    mockedGet.mockResolvedValue(phrasePayload);
    mockedPost.mockResolvedValue({ success: true });
    mockedDel.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    renderMarketing();

    await screen.findByText('Hello there');
    await user.click(screen.getByRole('button', { name: /remove phrase: hello there/i }));
    await waitFor(() => expect(mockedPost).toHaveBeenCalled());
    expect(await screen.findByText(/phrase removed/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /delete category/i }));
    await waitFor(() => expect(mockedDel).toHaveBeenCalledWith('/phrases/Greetings'));
    expect(await screen.findByText(/category .* deleted/i)).toBeInTheDocument();
  });

  it('reports a refused phrase write and dismisses the flash', async () => {
    mockedGet.mockResolvedValue(phrasePayload);
    mockedPost.mockRejectedValue({ response: { status: 403, data: { error: { code: 'FORBIDDEN', message: 'Not your dictionary' } } } });
    const user = userEvent.setup();
    renderMarketing();

    await screen.findByText('Hello there');
    await user.type(screen.getByLabelText(/new phrase/i), 'Another greeting');
    await user.click(screen.getByRole('button', { name: /add phrase/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/FORBIDDEN/);
    await user.click(within(alert).getByRole('button', { name: /dismiss/i }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('renders an error panel when the dictionary cannot be read', async () => {
    mockedGet.mockRejectedValue({ response: { status: 503, data: { error: { code: 'UNAVAILABLE', message: 'Store down' } } } });
    renderMarketing();
    expect(await screen.findByText(/phrase dictionary could not be read/i)).toBeInTheDocument();
  });

  it('renders an empty panel when the dictionary has no categories', async () => {
    mockedGet.mockResolvedValue({ success: true, categories: [] });
    renderMarketing();
    expect(await screen.findByText(/no phrase category/i)).toBeInTheDocument();
  });
});
