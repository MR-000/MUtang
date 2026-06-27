import { NextResponse } from 'next/server';
import { withAuth, errorResponse } from '@/lib/bff-helpers';

export async function GET(req: Request) {
  const { response, supabase, user } = await withAuth(req);
  if (response) return response;

  try {
    const { searchParams } = new URL(req.url);
    const range = searchParams.get('range') || 'day';
    const type = searchParams.get('type') || 'sale';

    const startDate = new Date();
    if (range === 'day') {
      startDate.setHours(0, 0, 0, 0);
    } else {
      startDate.setDate(startDate.getDate() - 30);
      startDate.setHours(0, 0, 0, 0);
    }

    const { data, error } = await supabase!
      .from('inventory_logs')
      .select('id, created_at, barcode, type, quantity_change, price')
      .eq('user_id', user!.id)
      .eq('type', type)
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: false });

    if (error) return errorResponse(error);
    return NextResponse.json(data || []);
  } catch (e) {
    return errorResponse(e);
  }
}
