import { NextResponse } from 'next/server';
import { withAuth, errorResponse } from '@/lib/bff-helpers';

export async function GET(req: Request) {
  const { response, supabase, user } = await withAuth(req);
  if (response) return response;

  try {
    const { data, error } = await supabase!
      .from('profiles')
      .select('credit')
      .eq('id', user!.id)
      .single();

    if (error) return errorResponse(error);
    return NextResponse.json({ credit: data?.credit ?? 0 });
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
      case 'deduct': {
        const { error: rpcError } = await supabase!
          .rpc('deduct_credit', {
            p_user_id: data.user_id,
            p_amount: data.amount,
            p_loan_id: data.loan_id ?? null,
          });

        if (rpcError) return errorResponse(rpcError);
        return NextResponse.json({ success: true });
      }

      case 'update': {
        const { data: profileData, error: fetchError } = await supabase!
          .from('profiles')
          .select('credit')
          .eq('id', data.user_id)
          .single();

        if (fetchError) return errorResponse(fetchError);

        const currentCredit = profileData?.credit ? parseFloat(profileData.credit.toString()) : 0;
        const newCredit = Math.max(0, currentCredit - data.amount);

        const { error: updateError } = await supabase!
          .from('profiles')
          .update({ credit: newCredit })
          .eq('id', data.user_id);

        if (updateError) return errorResponse(updateError);
        return NextResponse.json({ success: true, credit: newCredit });
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (e) {
    return errorResponse(e);
  }
}
