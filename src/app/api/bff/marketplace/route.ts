import { NextResponse } from 'next/server';
import { withAuth, errorResponse } from '@/lib/bff-helpers';

export async function GET(req: Request) {
  const { response, supabase, user } = await withAuth(req);
  if (response) return response;

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const myPosts = searchParams.get('myposts') === 'true';

    if (id) {
      const { data, error } = await supabase!
        .from('matching_requests')
        .select('id, lender_id, borrower_id, amount, interest_rate, status, type, created_at, description, due_date, overdue_policy, poster_profile:profiles!matching_requests_borrower_id_fkey(full_name, tier, trust_score, is_id_verified)')
        .eq('id', id)
        .single();

      if (error) return errorResponse(error);
      return NextResponse.json(data);
    }

    const todayStr = new Date().toISOString().split('T')[0];

    if (myPosts) {
      const { data, error } = await supabase!
        .from('matching_requests')
        .select('id, lender_id, borrower_id, amount, interest_rate, status, type, created_at, description, due_date, overdue_policy, poster_profile:profiles!matching_requests_borrower_id_fkey(full_name, tier, trust_score, is_id_verified)')
        .eq('status', 'pending')
        .is('lender_id', null);

      if (error) return errorResponse(error);
      return NextResponse.json(data);
    }

    const [borrowerPosts, lenderPosts] = await Promise.all([
      supabase!
        .from('matching_requests')
        .select('id, lender_id, borrower_id, amount, interest_rate, status, type, created_at, description, due_date, overdue_policy, poster_profile:profiles!matching_requests_borrower_id_fkey(full_name, tier, trust_score, is_id_verified)')
        .eq('status', 'pending')
        .is('lender_id', null)
        .or(`due_date.gte.${todayStr},due_date.is.null`)
        .order('created_at', { ascending: false }),
      supabase!
        .from('matching_requests')
        .select('id, lender_id, borrower_id, amount, interest_rate, status, type, created_at, description, due_date, overdue_policy, poster_profile:profiles!matching_requests_lender_id_fkey(full_name, tier, trust_score, is_id_verified)')
        .eq('status', 'pending')
        .is('borrower_id', null)
        .or(`due_date.gte.${todayStr},due_date.is.null`)
        .order('created_at', { ascending: false }),
    ]);

    if (borrowerPosts.error) return errorResponse(borrowerPosts.error);
    if (lenderPosts.error) return errorResponse(lenderPosts.error);

    return NextResponse.json({ borrowerPosts: borrowerPosts.data || [], lenderPosts: lenderPosts.data || [] });
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
        const { data: post, error } = await supabase!
          .from('matching_requests')
          .insert([{
            amount: data.amount,
            interest_rate: data.interest_rate,
            description: data.description,
            due_date: data.due_date,
            overdue_policy: data.overdue_policy,
            status: 'pending',
            type: data.type,
            borrower_id: data.borrower_id,
            lender_id: data.lender_id,
          }])
          .select('id, amount, status, created_at')
          .single();

        if (error) return errorResponse(error);
        return NextResponse.json(post);
      }

      case 'update': {
        const { error } = await supabase!
          .from('matching_requests')
          .update({
            amount: data.amount,
            interest_rate: data.interest_rate,
            description: data.description,
            due_date: data.due_date,
            overdue_policy: data.overdue_policy,
            type: data.type,
          })
          .eq('id', data.id)
          .select();

        if (error) return errorResponse(error);
        return NextResponse.json({ success: true });
      }

      case 'complete': {
        const { error } = await supabase!
          .from('matching_requests')
          .update({ status: 'completed' })
          .eq('id', data.id);

        if (error) return errorResponse(error);
        return NextResponse.json({ success: true });
      }

      case 'delete': {
        const { error } = await supabase!
          .from('matching_requests')
          .delete()
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
