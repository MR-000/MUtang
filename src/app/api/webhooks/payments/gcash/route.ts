import { NextResponse } from 'next/server';
import { serviceClient } from '@/lib/supabase-service';
import crypto from 'crypto';

function verifyWebhookAuth(req: Request): NextResponse | null {
  const apiKey = req.headers.get('x-api-key');
  const expectedKey = process.env.WEBHOOK_API_KEY;
  if (!expectedKey) {
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }
  if (apiKey !== expectedKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

export async function POST(req: Request) {
  try {
    const authError = verifyWebhookAuth(req);
    if (authError) return authError;

    const { message } = await req.json();

    if (!message) {
      return NextResponse.json({ message: "No message content" }, { status: 200 });
    }

    const amountRegex = /received\s+([0-9.]+)\s*PHP/i;
    const amountMatch = message.match(amountRegex);

    const refRegex = /Ref\.\s*No\.\s*([0-9]+)/i;
    const refMatch = message.match(refRegex);

    if (!amountMatch) {
      return NextResponse.json({ message: "Not a valid transaction message" }, { status: 200 });
    }

    const receivedAmount = parseFloat(amountMatch[1]);
    const referenceNo = refMatch ? refMatch[1] : `TEMP_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;

    const gcashSecret = process.env.GCASH_WEBHOOK_SECRET;
    const { data, error } = await serviceClient.rpc('complete_gcash_deposit', {
      p_received_amount: receivedAmount,
      p_ref_no: referenceNo,
      p_secret: gcashSecret || null,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ message: "Payment webhook processed" }, { status: 200 });
  } catch (error) {
    console.error('[GCash SMS Webhook] Webhook processing failed:', error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
