import { NextResponse } from 'next/server';
import { withAuth, errorResponse } from '@/lib/bff-helpers';

export async function GET(req: Request) {
  const { response, supabase, user } = await withAuth(req);
  if (response) return response;

  try {
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get('mode') || 'all';
    const barcode = searchParams.get('barcode');
    const excludeId = searchParams.get('exclude_id');

    if (barcode) {
      const { data, error } = await supabase!
        .from('inventory')
        .select('id, sku, name, price, stock, user_id')
        .eq('user_id', user!.id)
        .eq('sku', barcode)
        .single();

      if (error) return errorResponse(error);
      return NextResponse.json(data);
    }

    if (mode === 'names') {
      const { data, error } = await supabase!
        .from('inventory')
        .select('sku, name')
        .eq('user_id', user!.id);

      if (error) return errorResponse(error);
      return NextResponse.json(data || []);
    }

    if (mode === 'check_sku') {
      const query = supabase!
        .from('inventory')
        .select('id')
        .eq('user_id', user!.id)
        .eq('sku', barcode);
      if (excludeId) query.neq('id', excludeId);
      const { data, error } = await query.maybeSingle();

      if (error) return errorResponse(error);
      return NextResponse.json({ exists: !!data, id: data?.id ?? null });
    }

    const { data, error } = await supabase!
      .from('inventory')
      .select('id, sku, name, price, stock')
      .eq('user_id', user!.id)
      .order('name', { ascending: true });

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
      case 'register': {
        const { error } = await supabase!
          .from('inventory')
          .insert([{ user_id: user!.id, sku: data.sku, name: data.name, price: data.price, stock: data.stock || 0 }]);

        if (error) return errorResponse(error);
        return NextResponse.json({ success: true });
      }

      case 'update_stock': {
        const { error } = await supabase!
          .from('inventory')
          .update({ stock: data.stock })
          .eq('sku', data.sku)
          .eq('user_id', user!.id);

        if (error) return errorResponse(error);
        return NextResponse.json({ success: true });
      }

      case 'update': {
        const { error } = await supabase!
          .from('inventory')
          .update({ sku: data.sku, name: data.name, price: data.price, stock: data.stock })
          .eq('id', data.id)
          .eq('user_id', user!.id);

        if (error) return errorResponse(error);
        return NextResponse.json({ success: true });
      }

      case 'log_transaction': {
        const { error } = await supabase!
          .from('inventory_logs')
          .insert([{
            user_id: user!.id,
            barcode: data.barcode,
            type: data.type,
            quantity_change: data.quantity_change,
            price: data.price,
          }]);

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
