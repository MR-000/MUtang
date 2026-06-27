import { NextResponse } from 'next/server';
import { withAuth, errorResponse } from '@/lib/bff-helpers';

export async function GET(req: Request) {
  const { response, supabase, user } = await withAuth(req);
  if (response) return response;

  try {
    const { data, error } = await supabase!
      .from('payments')
      .select('id, debt_id, amount, method, paid_at, status, type, reference, debts ( customers (name) )')
      .eq('user_id', user!.id)
      .order('paid_at', { ascending: false });

    if (error) return errorResponse(error);
    return NextResponse.json(data || []);
  } catch (e) {
    return errorResponse(e);
  }
}
