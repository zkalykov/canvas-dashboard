'use client';

import { KeyIcon } from '@phosphor-icons/react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ManualLoginForm } from './manual-login-form';

const STEPS = [
  { title: 'Open Canvas and sign in', text: 'Use your school’s Canvas website, e.g. school.instructure.com.' },
  { title: 'Go to Account → Settings', text: 'Account is in the left menu, then choose Settings.' },
  { title: 'Create a token', text: 'Under Approved Integrations, click “+ New Access Token”, name it, and generate.' },
  { title: 'Paste it below', text: 'Copy the token and enter it with your Canvas address.' },
];

/** Explains how to get a Canvas access token and signs in with it. */
export function TokenLoginDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] gap-5 overflow-y-auto rounded-2xl p-6 sm:max-w-md">
        <DialogHeader className="items-center text-center sm:text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-muted">
            <KeyIcon className="h-6 w-6" />
          </span>
          <DialogTitle className="pt-1 text-[19px]">Log in with a Canvas token</DialogTitle>
          <DialogDescription className="text-[14px]">Use your Canvas address and a personal access token.</DialogDescription>
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

        <ManualLoginForm />

        <p className="text-center text-[12px] text-muted-foreground">
          We check the token with Canvas, then keep it encrypted in a secure cookie that page scripts can’t read. You can
          delete the token in Canvas at any time.
        </p>
      </DialogContent>
    </Dialog>
  );
}
