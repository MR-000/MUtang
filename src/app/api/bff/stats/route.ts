import { NextResponse } from 'next/server';
import { withAuth, errorResponse } from '@/lib/bff-helpers';

export async function GET(req: Request) {
  const { response, supabase, user } = await withAuth(req);
  if (response) return response;

  try {
    const [loansRes, customersRes, inventoryRes] = await Promise.all([
      supabase!
        .from('loans')
        .select('id', { count: 'exact', head: true })
        .or(`lender_id.eq.${user!.id},borrower_id.eq.${user!.id}`)
        .in('status', ['pending', 'active', 'waiting_receipt']),
      supabase!
        .from('customers')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user!.id),
      supabase!
        .from('inventory')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user!.id),
    ]);

    return NextResponse.json({
      activeLoans: loansRes.count ?? 0,
      customerCount: customersRes.count ?? 0,
      inventoryCount: inventoryRes.count ?? 0,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
