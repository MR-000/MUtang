import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function createClient(accessToken?: string | null) {
  const cookieStore = await cookies();

  const globalHeaders: Record<string, string> = {};
  if (accessToken) {
    globalHeaders['Authorization'] = `Bearer ${accessToken}`;
  }

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // The `set` method was called from a Server Component.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch {
            // The `remove` method was called from a Server Component.
          }
        },
      },
      global: {
        headers: globalHeaders,
      },
    }
  );
}

/**
 * Creates a Supabase client for API routes (Route Handlers) using the
 * getAll/setAll pattern. Modifies the response to include auth cookies.
 */
export async function createRouteHandlerClient(
  request: Request,
  response?: NextResponse
) {
  const effectiveResponse = response ?? NextResponse.next();

  const cookieMethods = {
    getAll() {
      const cookieHeader = request.headers.get('cookie');
      if (!cookieHeader) return [];
      return cookieHeader.split(';').map((c) => {
        const eqIdx = c.indexOf('=');
        if (eqIdx === -1) return null;
        return {
          name: c.substring(0, eqIdx).trim(),
          value: c.substring(eqIdx + 1).trim(),
        };
      }).filter(Boolean) as { name: string; value: string }[];
    },
    setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
      cookiesToSet.forEach(({ name, value, options }) => {
        effectiveResponse.cookies.set(name, value, options);
      });
    },
  };

  return {
    supabase: createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: cookieMethods }
    ),
    response: effectiveResponse,
  };
}
