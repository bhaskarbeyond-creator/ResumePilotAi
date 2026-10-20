/**
 * The other participant's picture (the server only returns http(s) addresses it
 * has checked) or initials. Decorative: the name is always shown next to it.
 */
import { useState } from 'react';
import { cn } from '@/lib/utils';

export interface ParticipantView {
  name: string;
  avatar: string;
}

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || '?';

export function ParticipantAvatar({ participant, className }: { participant: ParticipantView | undefined; className?: string }) {
  const [failedSrc, setFailedSrc] = useState('');
  const avatar = participant?.avatar ?? '';
  const showImage = /^https?:\/\//i.test(avatar) && failedSrc !== avatar;
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-100 text-sm font-semibold text-brand-800 dark:bg-brand-900/50 dark:text-brand-100',
        className,
      )}
    >
      {showImage ? (
        <img src={avatar} alt="" className="size-full object-cover" referrerPolicy="no-referrer" onError={() => setFailedSrc(avatar)} />
      ) : participant ? (
        initialsOf(participant.name)
      ) : (
        <span className="size-full animate-pulse bg-neutral-200 dark:bg-neutral-700" />
      )}
    </span>
  );
}
