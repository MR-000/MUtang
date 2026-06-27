import { NextResponse } from 'next/server';
import { withAuth, errorResponse } from '@/lib/bff-helpers';

export async function GET(req: Request) {
  const { response, supabase, user } = await withAuth(req);
  if (response) return response;

  try {
    const { data, error } = await supabase!
      .from('profiles')
      .select('id, full_name, phone, email, trust_tier, trust_score, is_verified, verification_status, credit, gcash_number, gcash_qr_url, solana_wallet, id_number')
      .eq('id', user!.id)
      .single();

    if (error && error.code !== 'PGRST116') {
      const isAdmin = user!.email === process.env.ADMIN_EMAIL;
      return NextResponse.json({
        id: user!.id,
        full_name: user!.email?.split('@')[0] || '',
        phone: null,
        email: user!.email,
        trust_tier: 'Bronze',
        trust_score: 0,
        is_verified: false,
        verification_status: 'unverified',
        credit: 0,
        gcash_number: null,
        gcash_qr_url: null,
        solana_wallet: null,
        id_number: null,
        is_admin: isAdmin,
      });
    }

    const isAdmin = user!.email === process.env.ADMIN_EMAIL;
    return NextResponse.json({ ...data, is_admin: isAdmin, email: data?.email || user!.email });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: Request) {
  const { response, supabase, user } = await withAuth(req);
  if (response) return response;

  try {
    const body = await req.json();
      const allowed = ['full_name', 'phone', 'email', 'gcash_number', 'gcash_qr_url', 'solana_wallet', 'id_number', 'id_front_url', 'id_back_url', 'id_front_url_2', 'id_back_url_2', 'selfie_url', 'verification_status', 'id_expiry'];
    const updates: Record<string, any> = {};
    for (const key of allowed) {
      if (body[key] !== undefined) updates[key] = body[key];
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    updates.updated_at = new Date().toISOString();

    const { error } = await supabase!
      .from('profiles')
      .update(updates)
      .eq('id', user!.id);

    if (error) return errorResponse(error);
    return NextResponse.json({ success: true });
  } catch (e) {
    return errorResponse(e);
  }
}
