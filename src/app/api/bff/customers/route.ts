import { NextResponse } from 'next/server';
import { withAuth, errorResponse } from '@/lib/bff-helpers';

export async function GET(req: Request) {
  const { response, supabase, user } = await withAuth(req);
  if (response) return response;

  try {
    const { data, error } = await supabase!
      .from('customers')
      .select('id, name, phone, notes')
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false });

    if (error) return errorResponse(error);
    return NextResponse.json(data || []);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  const { response, supabase, user } = await withAuth(req);
  if (response) return response;

  try {
    const body = await req.json();
    const { name, phone, notes } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const { data, error } = await supabase!
      .from('customers')
      .insert([{ user_id: user!.id, name: name.trim(), phone: phone || null, notes: notes || null }])
      .select('id, name, phone, notes')
      .single();

    if (error) return errorResponse(error);
    return NextResponse.json(data);
  } catch (e) {
    return errorResponse(e);
  }
}
