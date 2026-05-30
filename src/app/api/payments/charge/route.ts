import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getPhpExchangeRate } from '@/lib/exchange';


export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;

    const supabase = await createClient(token);
    
    let user = null;
    let authError = null;

    if (token) {
      const { data, error } = await supabase.auth.getUser(token);
      user = data.user;
      authError = error;
    } else {
      const { data, error } = await supabase.auth.getUser();
      user = data.user;
      authError = error;
    }

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { amount, method, fromWallet } = body;

    if (!amount || isNaN(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
    }

    if (!['gcash', 'solana_usdt', 'solana_usdc'].includes(method)) {
      return NextResponse.json({ error: 'Invalid payment method' }, { status: 400 });
    }

    const expiresAt = new Date(Date.now() + 3 * 60 * 1000).toISOString();

    let uniqueAmount = Number(amount);

    if (method === 'gcash') {
      const { data: activeRequests, error: dbError } = await supabase
        .from('deposit_requests')
        .select('unique_amount')
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString());

      if (dbError) {
        return NextResponse.json({ error: dbError.message }, { status: 500 });
      }

      const activeUniqueAmounts = new Set(activeRequests?.map(r => Number(r.unique_amount)) || []);

      let found = false;
      const decimals = Array.from({ length: 99 }, (_, i) => (i + 1) / 100);
      decimals.sort(() => Math.random() - 0.5);

      for (const dec of decimals) {
        const candidate = Number(((Number(amount) * 10) + dec).toFixed(2));
        if (!activeUniqueAmounts.has(candidate)) {
          uniqueAmount = candidate;
          found = true;
          break;
        }
      }

      if (!found) {
        return NextResponse.json({ error: 'All unique decimal slots are occupied. Please try again in a few minutes.' }, { status: 409 });
      }
    } else if (method === 'solana_usdt' || method === 'solana_usdc') {
      const token = method === 'solana_usdt' ? 'usdt' : 'usdc';
      const phpRate = await getPhpExchangeRate(token);
      const requiredDollar = (Number(amount) * 10) / phpRate;
      uniqueAmount = Number(requiredDollar.toFixed(4));
    }

    const { data: requestData, error: insertError } = await supabase
      .from('deposit_requests')
      .insert({
        user_id: user.id,
        amount: Number(amount),
        unique_amount: uniqueAmount,
        method,
        from_wallet: fromWallet || null,
        status: 'pending',
        expires_at: expiresAt
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: requestData });
  } catch (error: any) {
    console.error('Charge request error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
