import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

const ALLOWED_REDIRECT_PATHS = ['/', '/dashboard', '/settings', '/debts', '/customers', '/inventory', '/deposit', '/marketplace', '/admin'];

function isSafeRedirect(path: string): boolean {
  try {
    const url = new URL(path, 'http://localhost');
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    if (url.hostname !== 'localhost') return false;
    return ALLOWED_REDIRECT_PATHS.includes(url.pathname);
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  const safeNext = isSafeRedirect(next) ? next : '/';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${safeNext}`);
    }
  }

  return NextResponse.redirect(`${origin}/auth/auth-error`);
}
