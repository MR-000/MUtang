import { NextResponse } from 'next/server';
import { withAuth, errorResponse } from '@/lib/bff-helpers';

export async function GET(req: Request) {
  const { response, supabase, user } = await withAuth(req);
  if (response) return response;

  try {
    const { searchParams } = new URL(req.url);
    const adminView = searchParams.get('admin') === 'true';

    if (adminView) {
      const { data, error } = await supabase!
        .from('loans')
        .select('id, amount, repay_amount, status, description, due_date, created_at, updated_at, lender_id, borrower_id, signature_data, verification_evidence, lender:profiles!loans_lender_id_fkey(full_name), borrower:profiles!loans_borrower_id_fkey(full_name)')
        .order('created_at', { ascending: false });

      if (error) return errorResponse(error);
      return NextResponse.json(data);
    }

    const { data, error } = await supabase!
      .from('loans')
      .select('id, amount, repay_amount, status, description, due_date, created_at, lender_id, borrower_id, signature_data, verification_evidence, lender:profiles!loans_lender_id_fkey(full_name, phone, gcash_qr_url, gcash_number, solana_wallet), borrower:profiles!loans_borrower_id_fkey(full_name)')
      .or(`lender_id.eq.${user!.id},borrower_id.eq.${user!.id}`)
      .order('created_at', { ascending: false });

    if (error) return errorResponse(error);
    return NextResponse.json(data);
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
      case 'create': {
        const { data: loan, error } = await supabase!
          .from('loans')
          .insert([{
            lender_id: data.lender_id,
            borrower_id: data.borrower_id,
            amount: data.amount,
            repay_amount: data.repay_amount,
            description: data.description,
            due_date: data.due_date,
            status: 'pending_signature',
            signature_data: data.signature_data,
            verification_evidence: data.verification_evidence,
          }])
          .select('id, amount, status, description, due_date, created_at')
          .single();

        if (error) return errorResponse(error);
        return NextResponse.json(loan);
      }

      case 'update_status': {
        const updates: Record<string, any> = { status: data.status };
        if (data.signature_data !== undefined) updates.signature_data = data.signature_data;
        if (data.verification_evidence !== undefined) updates.verification_evidence = data.verification_evidence;

        const { error } = await supabase!
          .from('loans')
          .update(updates)
          .eq('id', data.loan_id);

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
