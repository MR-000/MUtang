import { supabase } from '@/lib/supabase';

async function getToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function bffGet<T = any>(path: string): Promise<T> {
  const token = await getToken();
  const res = await fetch(path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `BFF GET ${path} failed: ${res.status}`);
  }
  return res.json();
}

export async function bffPost<T = any>(path: string, body?: any): Promise<T> {
  const token = await getToken();
  const res = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(errBody.error || `BFF POST ${path} failed: ${res.status}`);
  }
  return res.json();
}

export async function bffPatch<T = any>(path: string, body?: any): Promise<T> {
  const token = await getToken();
  const res = await fetch(path, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(errBody.error || `BFF PATCH ${path} failed: ${res.status}`);
  }
  return res.json();
}
