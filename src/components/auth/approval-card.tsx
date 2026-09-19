import { CheckIcon, CircleNotchIcon, TelegramLogoIcon, XIcon } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

/**
 * What the website shows while a one-time Telegram link waits for approval.
 * Used by LinkApprovalDialog.
 */

export type ApprovalPhase = 'checking' | 'waiting' | 'approved' | 'denied' | 'expired' | 'error';
export type Access = 'view' | 'full';

const STEPS = ['Check the link', 'Approve in Telegram', 'Open your dashboard'];

export function approvalCopy(phase: ApprovalPhase, access: Access | null, errorText = '') {
  switch (phase) {
    case 'checking':
      return { title: 'Checking your link…', text: 'One moment.' };
    case 'waiting':
      return { title: 'Approve on Telegram', text: 'We sent a message to your Telegram. Choose View only or Full access there.' };
    case 'approved': {
      const level = access === 'full' ? 'full access' : 'view only';
      return {
        title: access === 'full' ? 'Approved with full access' : 'Approved as view only',
        text: `Opening your dashboard with ${level}…`,
      };
    }
    case 'denied':
      return { title: 'Login denied', text: 'You tapped Deny in Telegram, so nobody was signed in.' };
    case 'expired':
      return { title: 'Request expired', text: 'The login wasn’t approved in time. Send /portal to the bot for a new link.' };
    default:
      return { title: "This link didn't work", text: errorText };
  }
}

export function ApprovalCard({
  phase,
  access,
  remaining,
  errorText,
  titleAs: Title = 'h2',
  descriptionAs: Description = 'p',
}: {
  phase: ApprovalPhase;
  access: Access | null;
  remaining: number | null;
  errorText?: string;
  titleAs?: React.ElementType;
  descriptionAs?: React.ElementType;
}) {
  const failed = phase === 'denied' || phase === 'expired' || phase === 'error';
  const finished = phase === 'approved' || failed;
  const stepIndex = phase === 'checking' || phase === 'error' ? 0 : phase === 'approved' ? 2 : 1;
  const copy = approvalCopy(phase, access, errorText);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col items-center text-center">
        <span
          className={cn(
            'relative grid h-14 w-14 place-items-center rounded-full',
            failed ? 'bg-destructive/10 text-destructive' : phase === 'approved' ? 'bg-success/15 text-success' : 'bg-muted'
          )}
        >
          {phase === 'waiting' && <span className="absolute inset-0 animate-ping rounded-full bg-muted-foreground/15" />}
          {phase === 'checking' && <CircleNotchIcon className="h-6 w-6 animate-spin" />}
          {phase === 'waiting' && <TelegramLogoIcon className="relative h-6 w-6" />}
          {phase === 'approved' && <CheckIcon className="h-6 w-6" weight="bold" />}
          {failed && <XIcon className="h-6 w-6" weight="bold" />}
        </span>
        <Title className="mt-4 text-[20px] font-semibold leading-tight">{copy.title}</Title>
        <Description className="mt-1 max-w-xs text-[14px] text-muted-foreground">{copy.text}</Description>
      </div>

      <ol className="rounded-2xl bg-muted/70 p-1.5">
        {STEPS.map((label, index) => {
          const done = index < stepIndex || (phase === 'approved' && index === stepIndex);
          const active = !finished && index === stepIndex;
          const bad = failed && index === stepIndex;
          return (
            <li key={label} className="flex items-center gap-3 rounded-xl px-3 py-2.5">
              <span
                className={cn(
                  'grid h-5 w-5 shrink-0 place-items-center rounded-full border',
                  done && 'border-transparent bg-foreground text-background',
                  bad && 'border-transparent bg-destructive text-white',
                  active && 'border-transparent',
                  !done && !bad && !active && 'border-input'
                )}
              >
                {done && <CheckIcon className="h-3 w-3" weight="bold" />}
                {bad && <XIcon className="h-3 w-3" weight="bold" />}
                {active && <CircleNotchIcon className="h-4 w-4 animate-spin text-muted-foreground" />}
              </span>
              <span className={cn('flex-1 text-left text-[14px]', !done && !active && !bad && 'text-muted-foreground', bad && 'text-destructive')}>
                {label}
                {index === 1 && phase === 'approved' && access && (
                  <span className="ml-1.5 text-muted-foreground">· {access === 'full' ? 'Full access' : 'View only'}</span>
                )}
              </span>
              {active && index === 1 && remaining !== null && (
                <span className="text-[12px] tabular-nums text-muted-foreground">
                  {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')} left
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
