'use client';

import { TelegramLogoIcon } from '@phosphor-icons/react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export const TELEGRAM_BOT_URL = 'https://t.me/canvas_sonungo_com_bot';

const STEPS = [
  { title: 'Open our Telegram bot', text: '@canvas_sonungo_com_bot' },
  { title: 'Connect Canvas (first time only)', text: 'Send /start. The bot asks for your school and a Canvas access token.' },
  { title: 'Send /portal', text: 'The bot replies with a one-time login link.' },
  { title: 'Open the link, then approve', text: 'Tap Approve in Telegram and you’re in. Links expire in 30 seconds.' },
];

/** Explains how Telegram login works, with a button that opens the bot. */
export function TelegramLoginDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-5 rounded-2xl p-6 sm:max-w-md">
        <DialogHeader className="items-center text-center sm:text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-muted">
            <TelegramLogoIcon className="h-6 w-6" />
          </span>
          <DialogTitle className="pt-1 text-[19px]">Log in with Telegram</DialogTitle>
          <DialogDescription className="text-[14px]">No password. Our bot sends you a one-time login link.</DialogDescription>
        </DialogHeader>

        <ol className="rounded-2xl bg-muted/70 p-1.5">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex items-start gap-3 rounded-xl px-3 py-2.5">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-background text-[12px] font-medium tabular-nums">
                {index + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-[14px] font-medium">{step.title}</span>
                <span className="block text-[13px] text-muted-foreground">{step.text}</span>
              </span>
            </li>
          ))}
        </ol>

        <a
          href={TELEGRAM_BOT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-11 w-full items-center justify-center gap-2.5 rounded-full bg-foreground text-[15px] font-medium text-background transition-opacity hover:opacity-85"
        >
          <TelegramLogoIcon className="h-5 w-5" />
          Open Telegram
        </a>

        <p className="text-center text-[12px] text-muted-foreground">
          Your Canvas token is stored encrypted and never reaches your browser.
        </p>

      </DialogContent>
    </Dialog>
  );
}
