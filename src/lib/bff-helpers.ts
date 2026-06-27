import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function withAuth(req: Request) {
  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
  const supabase = await createClient(token);

  let user;
  if (token) {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), supabase: null, user: null };
    }
    user = data.user;
  } else {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), supabase: null, user: null };
    }
    user = data.user;
  }

  return { response: null, supabase, user };
}

export function errorResponse(error: unknown, status = 500) {
  let message = 'Internal Server Error';
  if (error instanceof Error) {
    message = error.message;
  } else if (typeof error === 'object' && error !== null) {
    const obj = error as Record<string, unknown>;
    if (typeof obj.message === 'string') message = obj.message;
    else if (typeof obj.code === 'string' && typeof obj.details === 'string') {
      message = `[${obj.code}] ${obj.details || obj.message || 'Unknown error'}`;
    }
  }
  return NextResponse.json({ error: message }, { status });
}
