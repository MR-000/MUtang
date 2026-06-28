import { NextResponse } from 'next/server';
import { serviceClient } from '@/lib/supabase-service';
import { convertTokenToCredit } from '@/lib/exchange';
import crypto from 'crypto';

const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDT_MINT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";

function verifyHeliusSignature(req: Request, body: string): NextResponse | null {
  const signature = req.headers.get('x-webhook-signature');
  const webhookId = req.headers.get('x-webhook-id');
  const timestamp = req.headers.get('x-webhook-timestamp');
  const secret = process.env.HELIUS_WEBHOOK_SECRET;

  if (!secret) {
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }
  if (!signature || !webhookId || !timestamp) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payload = `${webhookId}.${timestamp}.${body}`;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expectedSignature);
  if (sigBuf.length !== expectedBuf.length) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

export async function POST(req: Request) {
  try {
    const body = await req.text();

    const authError = verifyHeliusSignature(req, body);
    if (authError) return authError;

    const heliusSecret = process.env.HELIUS_WEBHOOK_SECRET;
    const transactions = JSON.parse(body);

    if (!transactions || !Array.isArray(transactions) || transactions.length === 0) {
      return NextResponse.json({ message: "No data" }, { status: 200 });
    }

    const adminEmail = process.env.ADMIN_EMAIL || 'tkdghksl0531@gmail.com';
    const { data: adminProfile } = await serviceClient
      .from('profiles')
      .select('solana_wallet')
      .eq('email', adminEmail)
      .limit(1)
      .maybeSingle();
    const receiverWallet = adminProfile?.solana_wallet;

    for (const tx of transactions) {
      if (!tx.tokenTransfers || tx.tokenTransfers.length === 0) continue;

      for (const transfer of tx.tokenTransfers) {
        const mint = transfer.mint;

        if (mint === USDC_MINT || mint === USDT_MINT) {
          const toWallet = transfer.toUserAccount;
          if (receiverWallet && toWallet !== receiverWallet) {
            console.warn(`[Solana Deposit Webhook] Receiver wallet mismatch. Got: ${toWallet}, Expected: ${receiverWallet}`);
            continue;
          }

          const method = mint === USDC_MINT ? "solana_usdc" : "solana_usdt";
          const dollarAmount = Number(transfer.amount);
          const fromWallet = transfer.fromUserAccount;
          const txId = tx.signature;

          const tokenType = mint === USDC_MINT ? 'usdc' : 'usdt';

          const { data: matchedRequest, error: matchError } = await serviceClient
            .from('deposit_requests')
            .select('id, amount')
            .eq('from_wallet', fromWallet)
            .eq('unique_amount', dollarAmount)
            .eq('method', method)
            .eq('status', 'pending')
            .gt('expires_at', new Date().toISOString())
            .limit(1)
            .maybeSingle();

          let pAmountArgument = dollarAmount;

          if (matchError || !matchedRequest) {
            pAmountArgument = await convertTokenToCredit(dollarAmount, tokenType);
          }

          const { data, error } = await serviceClient.rpc('complete_solana_deposit', {
            p_from_wallet: fromWallet,
            p_amount: pAmountArgument,
            p_tx_id: txId,
            p_method: method,
            p_secret: heliusSecret || null,
          });

          if (error) {
            console.error(`[Solana Deposit Webhook] DB RPC error for tx ${txId}:`, error.message);
          }
        }
      }
    }

    return NextResponse.json({ message: "Webhook received successfully" }, { status: 200 });
  } catch (error) {
    console.error('[Solana Deposit Webhook] Webhook processing failed:', error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
