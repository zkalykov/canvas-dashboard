'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { CircleNotchIcon } from '@phosphor-icons/react';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Developer login: Canvas URL + personal access token.
 * Only rendered when the server runs with MANUAL_MODE=1.
 */
export function ManualLoginForm() {
  const { login } = useAuth();
  const router = useRouter();
  const [canvasUrl, setCanvasUrl] = useState('');
  const [token, setToken] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canvasUrl.trim() || !token.trim()) {
      setError('Enter your Canvas address and an access token.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await login(canvasUrl.trim(), token.trim());
      setToken('');
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="text-left">
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="manual-canvas-url">Canvas address</Label>
          <Input
            id="manual-canvas-url"
            placeholder="https://canvas.your-school.edu"
            autoComplete="url"
            inputMode="url"
            value={canvasUrl}
            onChange={e => setCanvasUrl(e.target.value)}
            disabled={submitting}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="manual-canvas-token">Access token</Label>
          <Input
            id="manual-canvas-token"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="Paste your token"
            value={token}
            onChange={e => setToken(e.target.value)}
            disabled={submitting}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="h-11 w-full text-[15px]" disabled={submitting}>
          {submitting ? <CircleNotchIcon className="mr-2 h-4 w-4 animate-spin" /> : null}
          {submitting ? 'Checking token…' : 'Sign in'}
        </Button>
      </form>
    </div>
  );
}
