import { NextResponse } from 'next/server';
import { withAuth, errorResponse } from '@/lib/bff-helpers';

export async function GET(req: Request) {
  const { response, supabase, user } = await withAuth(req);
  if (response) return response;

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const adminView = searchParams.get('admin') === 'true';

    if (adminView) {
      const { data, error } = await supabase!
        .from('deposit_requests')
        .select('id, user_id, amount, unique_amount, method, from_wallet, status, created_at, expires_at, proof_image_url')
        .order('created_at', { ascending: false });

      if (error) return errorResponse(error);
      return NextResponse.json(data || []);
    }

    if (id) {
      const { data, error } = await supabase!
        .from('deposit_requests')
        .select('id, amount, unique_amount, method, from_wallet, status, expires_at, proof_image_url')
        .eq('id', id)
        .single();

      if (error) return errorResponse(error);
      return NextResponse.json(data);
    }

    const { data, error } = await supabase!
      .from('deposit_requests')
      .select('id, amount, unique_amount, method, from_wallet, status, expires_at, proof_image_url')
      .eq('user_id', user!.id)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1);

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
    const { action, ...data } = body;

    switch (action) {
      case 'update_proof': {
        const { error } = await supabase!
          .from('deposit_requests')
          .update({ proof_image_url: data.proof_image_url })
          .eq('id', data.id);

        if (error) return errorResponse(error);
        return NextResponse.json({ success: true });
      }

      case 'expire': {
        const { error } = await supabase!
          .from('deposit_requests')
          .update({ status: 'expired' })
          .eq('id', data.id);

        if (error) return errorResponse(error);
        return NextResponse.json({ success: true });
      }

      case 'complete': {
        const { error } = await supabase!
          .from('deposit_requests')
          .update({ status: 'completed' })
          .eq('id', data.id);

        if (error) return errorResponse(error);
        return NextResponse.json({ success: true });
      }

      case 'reject': {
        const { error } = await supabase!
          .from('deposit_requests')
          .update({ status: 'rejected' })
          .eq('id', data.id);

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
