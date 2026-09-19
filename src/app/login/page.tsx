'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

// Old login address: the login page is /home now.
export default function LoginPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!isLoading) router.replace(isAuthenticated ? '/' : '/home');
  }, [isAuthenticated, isLoading, router]);
  return null;
}
