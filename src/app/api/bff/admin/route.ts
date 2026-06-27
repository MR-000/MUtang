import { NextResponse } from 'next/server';
import { withAuth, errorResponse } from '@/lib/bff-helpers';

async function requireAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase!
    .from('profiles')
    .select('is_admin')
    .eq('id', userId)
    .single();
  if (error || !data?.is_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}

export async function GET(req: Request) {
  const { response, supabase, user } = await withAuth(req);
  if (response) return response;
  const forbidden = await requireAdmin(supabase, user!.id);
  if (forbidden) return forbidden;

  try {
    const { searchParams } = new URL(req.url);
    const resource = searchParams.get('resource');

    switch (resource) {
      case 'profiles': {
        const { data, error } = await supabase!
          .from('profiles')
          .select('id, full_name, phone, email, trust_tier, trust_score, is_verified, credit, verification_status')
          .order('updated_at', { ascending: false });

        if (error) return errorResponse(error);
        return NextResponse.json(data || []);
      }

      case 'deposits': {
        const { data, error } = await supabase!
          .from('deposit_requests')
          .select('id, user_id, amount, unique_amount, method, status, created_at, proof_image_url, profile:profiles!deposit_requests_user_id_fkey(full_name, phone)')
          .order('created_at', { ascending: false });

        if (error) return errorResponse(error);
        return NextResponse.json(data || []);
      }

      case 'payment_proofs': {
        const { data, error } = await supabase!
          .from('payment_proofs')
          .select('id, loan_id, submitter_id, screenshot_url, gcash_reference, amount_claimed, deposited_at, status, created_at')
          .order('created_at', { ascending: false });

        if (error) return errorResponse(error);
        return NextResponse.json(data || []);
      }

      case 'stats': {
        const [
          { count: totalUsers },
          { count: activeLoans },
          { count: overdueLoans },
          { count: pendingDeposits },
          { count: completedDeposits },
          { data: profiles },
        ] = await Promise.all([
          supabase!.from('profiles').select('id', { count: 'exact', head: true }),
          supabase!.from('loans').select('id', { count: 'exact', head: true }).in('status', ['pending', 'active', 'waiting_receipt']),
          supabase!.from('loans').select('id', { count: 'exact', head: true }).eq('status', 'overdue'),
          supabase!.from('deposit_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
          supabase!.from('deposit_requests').select('id', { count: 'exact', head: true }).eq('status', 'completed'),
          supabase!.from('profiles').select('credit'),
        ]);

        const totalCredit = profiles?.reduce((sum, p) => {
          const val = parseFloat(p.credit?.toString() || '0');
          return sum + (isNaN(val) ? 0 : val);
        }, 0) || 0;

        return NextResponse.json({
          totalUsers: totalUsers ?? 0,
          activeLoans: activeLoans ?? 0,
          overdueLoans: overdueLoans ?? 0,
          pendingDeposits: pendingDeposits ?? 0,
          completedDeposits: completedDeposits ?? 0,
          totalCredit,
        });
      }

      default:
        return NextResponse.json({ error: 'Unknown resource' }, { status: 400 });
    }
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  const { response, supabase, user } = await withAuth(req);
  if (response) return response;
  const forbidden = await requireAdmin(supabase, user!.id);
  if (forbidden) return forbidden;

  try {
    const body = await req.json();
    const { action, ...data } = body;

    switch (action) {
      case 'update_user': {
        const updates: Record<string, any> = {};
        if (data.credit !== undefined) updates.credit = data.credit;
        if (data.trust_score !== undefined) updates.trust_score = data.trust_score;
        if (data.trust_tier !== undefined) updates.trust_tier = data.trust_tier;

        const { error } = await supabase!
          .from('profiles')
          .update(updates)
          .eq('id', data.user_id);

        if (error) return errorResponse(error);
        return NextResponse.json({ success: true });
      }

      case 'verify_user': {
        const { error } = await supabase!
          .from('profiles')
          .update({ is_verified: data.is_verified })
          .eq('id', data.user_id);

        if (error) return errorResponse(error);
        return NextResponse.json({ success: true });
      }

      case 'process_deposit': {
        const { data: profileData, error: fetchErr } = await supabase!
          .from('profiles')
          .select('credit')
          .eq('id', data.user_id)
          .single();

        if (fetchErr) return errorResponse(fetchErr);

        const currentCredit = parseFloat(profileData?.credit?.toString() || '0');
        const newCredit = currentCredit + parseFloat(data.amount.toString());

        const { error: updateCreditErr } = await supabase!
          .from('profiles')
          .update({ credit: newCredit })
          .eq('id', data.user_id);

        if (updateCreditErr) return errorResponse(updateCreditErr);

        const { error: updateDepositErr } = await supabase!
          .from('deposit_requests')
          .update({ status: 'completed' })
          .eq('id', data.deposit_id);

        if (updateDepositErr) return errorResponse(updateDepositErr);

        return NextResponse.json({ success: true, credit: newCredit });
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (e) {
    return errorResponse(e);
  }
}
