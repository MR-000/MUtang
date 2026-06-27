import { NextResponse } from 'next/server';
import { withAuth, errorResponse } from '@/lib/bff-helpers';

export async function GET(req: Request) {
  const { response, supabase } = await withAuth(req);
  if (response) return response;

  try {
    const { searchParams } = new URL(req.url);
    const key = searchParams.get('key');

    if (key) {
      const { data, error } = await supabase!
        .from('system_settings')
        .select('key, value, description')
        .eq('key', key)
        .single();

      if (error) return errorResponse(error);
      return NextResponse.json(data);
    }

    const { data, error } = await supabase!
      .from('system_settings')
      .select('key, value, description');

    if (error) return errorResponse(error);
    return NextResponse.json(data || {});
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  const { response, supabase } = await withAuth(req);
  if (response) return response;

  try {
    const body = await req.json();
    const { action, ...data } = body;

    switch (action) {
      case 'update': {
        const { error } = await supabase!
          .from('system_settings')
          .update({ value: data.value, description: data.description })
          .eq('key', data.key);

        if (error) return errorResponse(error);
        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (e) {
    return errorResponse(e);
  }
}
