import { NextResponse } from 'next/server';
import { withAuth, errorResponse } from '@/lib/bff-helpers';

export async function POST(req: Request) {
  const { response, supabase, user } = await withAuth(req);
  if (response) return response;

  try {
    const body = await req.json();
    const { loan_id, screenshot_url, gcash_reference, amount_claimed, payment_method, wallet_address } = body;

    if (!loan_id || !amount_claimed) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const depositedAt = new Date().toISOString();
    const autoConfirmDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase!
      .from('payment_proofs')
      .insert([{
        loan_id,
        submitter_id: user!.id,
        screenshot_url: screenshot_url || null,
        gcash_reference: gcash_reference || null,
        amount_claimed,
        deposited_at: depositedAt,
        status: 'submitted',
        auto_confirm_deadline: autoConfirmDeadline,
        payment_method: payment_method || null,
        wallet_address: wallet_address || null,
      }])
      .select('id, status, created_at')
      .single();

    if (error) return errorResponse(error);
    return NextResponse.json(data);
  } catch (e) {
    return errorResponse(e);
  }
}
