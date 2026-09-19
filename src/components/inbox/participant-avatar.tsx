import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import type { ConversationParticipant } from '@/lib/types';
import { initials, usableAvatar } from './inbox-utils';

export function PersonAvatar({
  name,
  avatarUrl,
  className,
}: {
  name: string | null | undefined;
  avatarUrl?: string | null;
  className?: string;
}) {
  const src = usableAvatar(avatarUrl);
  return (
    <Avatar className={cn('size-8', className)}>
      {src && <AvatarImage src={src} alt="" />}
      <AvatarFallback className="text-xs font-medium">{initials(name)}</AvatarFallback>
    </Avatar>
  );
}

/** First participant's avatar with a "+N" badge for group conversations. */
export function ParticipantAvatars({ people, className }: { people: ConversationParticipant[]; className?: string }) {
  const [first] = people;
  return (
    <div className={cn('relative shrink-0', className)}>
      <PersonAvatar name={first?.name} avatarUrl={first?.avatar_url} className="size-10" />
      {people.length > 1 && (
        <span className="absolute -right-1 -bottom-1 rounded-full bg-muted px-1 text-[10px] font-semibold leading-4 text-muted-foreground ring-2 ring-card">
          +{people.length - 1}
        </span>
      )}
    </div>
  );
}
