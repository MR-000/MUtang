import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { convertTokenToCredit } from '@/lib/exchange';

const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDT_MINT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";

export async function POST(req: Request) {
  try {
    const transactions = await req.json();

    if (!transactions || !Array.isArray(transactions) || transactions.length === 0) {
      return NextResponse.json({ message: "No data" }, { status: 200 });
    }

    for (const tx of transactions) {
      if (tx.type !== "TOKEN_TRANSFER" || !tx.tokenTransfers) {
        continue;
      }

      for (const transfer of tx.tokenTransfers) {
        const mint = transfer.mint;

        if (mint === USDC_MINT || mint === USDT_MINT) {
          const method = mint === USDC_MINT ? "solana_usdc" : "solana_usdt";
          const dollarAmount = Number(transfer.amount);
          const fromWallet = transfer.fromUserAccount;
          const txId = tx.signature;

          console.log(`[Solana Deposit Webhook] Received deposit: ${method}, Dollar Amount: ${dollarAmount}, From: ${fromWallet}, TxID: ${txId}`);

          const tokenType = mint === USDC_MINT ? 'usdc' : 'usdt';

          const { data: matchedRequest, error: matchError } = await supabase
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
            console.log(`[Solana Deposit Webhook] Direct transfer detected. Converted ${dollarAmount} ${tokenType.toUpperCase()} to ${pAmountArgument} Credits`);
          } else {
            console.log(`[Solana Deposit Webhook] 3-Min Fixed Price Request found! Will credit fixed ${matchedRequest.amount} Credits for dollar amount ${dollarAmount}`);
          }

          const { data, error } = await supabase.rpc('complete_solana_deposit', {
            p_from_wallet: fromWallet,
            p_amount: pAmountArgument,
            p_tx_id: txId,
            p_method: method
          });

          if (error) {
            console.error(`[Solana Deposit Webhook] DB RPC error:`, error);
          } else {
            console.log(`[Solana Deposit Webhook] DB RPC result:`, data);
          }
        }
      }
    }

    return NextResponse.json({ message: "Webhook received successfully" }, { status: 200 });
  } catch (error: any) {
    console.error('[Solana Deposit Webhook] Webhook processing failed:', error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
