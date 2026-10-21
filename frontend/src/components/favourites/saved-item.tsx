/**
 * One saved favourite: what it is, its current details (or the details saved
 * with it, labelled as such), when it was saved and where it stands. Actions:
 * open a document in its builder, and remove (the page offers Undo).
 */
import { Link } from 'react-router-dom';
import { Briefcase, CheckCircle2, CircleSlash, ExternalLink, FileText, MapPin, Star, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Favourite } from '@/lib/favourites';
import { favouriteName, savedDate, type FavouriteView } from '@/lib/favourite-display';

// DOM ids are keyed by the saved item, not the stored row: Undo saves a new row for the same item.
const domKey = (item: Pick<Favourite, 'itemId'>) => item.itemId.replace(/\s/g, '_');
export const removeButtonId = (item: Pick<Favourite, 'itemId'>) => `favourite-remove-${domKey(item)}`;
/** The entry's title; focusable from script so focus can return to an entry after Undo. */
export const titleId = (item: Pick<Favourite, 'itemId'>) => `favourite-title-${domKey(item)}`;

const KIND_ICON = { job: Briefcase, resume: FileText, cover: FileText, other: Star } as const;

interface SavedItemProps {
  item: Favourite;
  view: FavouriteView;
  removing: boolean;
  onRemove: (item: Favourite, view: FavouriteView) => void;
}

export function SavedItem({ item, view, removing, onRemove }: SavedItemProps) {
  const headingId = titleId(item);
  const name = favouriteName(view);
  const saved = savedDate(item);
  const { state, open } = view;
  const Icon = KIND_ICON[view.kind];

  return (
    <article aria-labelledby={headingId} className="min-w-0 rounded-xl border border-border bg-surface p-4 shadow-xs">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700" aria-hidden="true">
            <Icon className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-ink-muted">{view.kindLabel}</p>
            <h3 id={headingId} tabIndex={-1} className="break-words text-base font-semibold leading-snug text-ink focus:outline-none">{view.title}</h3>
            {(view.company || view.location) && (
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-ink-secondary">
                {view.company && <span className="break-words">{view.company}</span>}
                {view.location && (
                  <span className="flex min-w-0 items-center gap-1 break-words">
                    <MapPin className="size-3.5 shrink-0" aria-hidden="true" />{view.location}
                  </span>
                )}
              </p>
            )}
            {(saved || state) && (
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-ink-muted">
                {saved && <time dateTime={saved.dateTime}>{saved.label}</time>}
                {state && (
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-medium',
                      state.tone === 'listed' ? 'border-success-100 bg-success-50 text-success-700' : 'border-border bg-canvas-soft text-ink-secondary',
                    )}
                  >
                    {state.tone === 'listed'
                      ? <CheckCircle2 className="size-3.5 shrink-0" aria-hidden="true" />
                      : <CircleSlash className="size-3.5 shrink-0" aria-hidden="true" />}
                    {state.label}
                  </span>
                )}
              </div>
            )}
            {state && state.tone !== 'listed' && <p className="mt-1.5 text-xs text-ink-muted">{state.detail}</p>}
          </div>
        </div>

        {/* Below the text on small screens (aligned with it), beside it from sm up. */}
        <div className="flex shrink-0 flex-wrap items-center gap-2 pl-12 sm:pl-0">
          {open && (
            <Button asChild variant="outline" size="sm">
              <Link to={open.href} aria-label={`${open.label}: ${name}`}>
                <ExternalLink aria-hidden="true" /> {open.label}
              </Link>
            </Button>
          )}
          <Button
            id={removeButtonId(item)}
            variant="ghost"
            size="sm"
            className="text-error-700 hover:bg-error-50 hover:text-error-700"
            aria-label={`Remove ${name} from your saved items`}
            aria-disabled={removing || undefined}
            aria-busy={removing || undefined}
            onClick={() => { if (!removing) onRemove(item, view); }}
          >
            <Trash2 aria-hidden="true" /> {removing ? 'Removing…' : 'Remove'}
          </Button>
        </div>
      </div>
    </article>
  );
}
