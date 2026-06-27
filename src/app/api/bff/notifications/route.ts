import { NextResponse } from 'next/server';
import { withAuth, errorResponse } from '@/lib/bff-helpers';

export async function POST(req: Request) {
  const { response, supabase } = await withAuth(req);
  if (response) return response;

  try {
    const body = await req.json();
    const { user_id, title, message, type } = body;

    if (!user_id || !title || !message) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const { error } = await supabase!
      .from('notifications')
      .insert([{ user_id, title, message, type: type || 'system' }]);

    if (error) return errorResponse(error);
    return NextResponse.json({ success: true });
  } catch (e) {
    return errorResponse(e);
  }
}
