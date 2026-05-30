import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(req: Request) {
  try {
    const { message, sender } = await req.json();

    console.log(`[GCash SMS Webhook] Received from ${sender}: "${message}"`);

    if (!message) {
      return NextResponse.json({ message: "No message content" }, { status: 200 });
    }

    const amountRegex = /received\s+([0-9.]+)\s*PHP/i;
    const amountMatch = message.match(amountRegex);

    const refRegex = /Ref\.\s*No\.\s*([0-9]+)/i;
    const refMatch = message.match(refRegex);

    if (!amountMatch) {
      console.warn(`[GCash SMS Webhook] Not a valid transaction message: "${message}"`);
      return NextResponse.json({ message: "Not a valid transaction message" }, { status: 200 });
    }

    const receivedAmount = parseFloat(amountMatch[1]);
    const referenceNo = refMatch ? refMatch[1] : `TEMP_${Date.now()}`;

    console.log(`[GCash SMS Webhook] Parsed Amount: ${receivedAmount} PHP, Ref No: ${referenceNo}`);

    const { data, error } = await supabase.rpc('complete_gcash_deposit', {
      p_received_amount: receivedAmount,
      p_ref_no: referenceNo
    });

    if (error) {
      console.error(`[GCash SMS Webhook] DB RPC error:`, error);
    } else {
      console.log(`[GCash SMS Webhook] DB RPC result:`, data);
    }

    return NextResponse.json({ message: "Payment webhook processed" }, { status: 200 });
  } catch (error: any) {
    console.error('[GCash SMS Webhook] Webhook processing failed:', error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
