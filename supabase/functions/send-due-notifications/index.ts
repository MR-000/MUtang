// @ts-ignore
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// @ts-ignore
import { createClient } from "jsr:@supabase/supabase-js@2";

declare const Deno: any;

// Web Push 유틸리티 (VAPID 서명)
async function sendWebPush(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: string,
  vapidPublicKey: string,
  vapidPrivateKey: string,
  vapidSubject: string,
): Promise<boolean> {
  try {
    // VAPID JWT 생성
    const audience = new URL(subscription.endpoint).origin;
    const expiration = Math.floor(Date.now() / 1000) + 12 * 60 * 60; // 12시간

    const header = { typ: "JWT", alg: "ES256" };
    const claims = {
      aud: audience,
      exp: expiration,
      sub: vapidSubject,
    };

    const encoder = new TextEncoder();

    // Base64URL 인코딩
    const base64url = (data: Uint8Array | string): string => {
      const bytes =
        typeof data === "string" ? encoder.encode(data) : data;
      let str = "";
      bytes.forEach((b) => (str += String.fromCharCode(b)));
      return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
    };

    const signingInput =
      base64url(JSON.stringify(header)) +
      "." +
      base64url(JSON.stringify(claims));

    // VAPID 비밀키로 서명
    const privateKeyBytes = Uint8Array.from(
      atob(vapidPrivateKey.replace(/-/g, "+").replace(/_/g, "/")),
      (c) => c.charCodeAt(0),
    );

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      privateKeyBytes,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"],
    );

    const signature = await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      cryptoKey,
      encoder.encode(signingInput),
    );

    const jwt =
      signingInput + "." + base64url(new Uint8Array(signature));

    const vapidHeader = `vapid t=${jwt},k=${vapidPublicKey}`;

    // 암호화된 페이로드 없이 단순 헤더만으로 전송 (알림 텍스트는 별도)
    const response = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        Authorization: vapidHeader,
        "Content-Type": "application/json",
        TTL: "86400",
      },
      body: payload,
    });

    return response.status === 201 || response.status === 200;
  } catch (error) {
    console.error("Push send error:", error);
    return false;
  }
}

Deno.serve(async (req: Request) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
    const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
    const VAPID_SUBJECT =
      Deno.env.get("VAPID_SUBJECT") || "mailto:admin@mutang.com";

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // D-1 (내일)
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];

    // D-2 (모레)
    const dayAfter = new Date(today);
    dayAfter.setDate(dayAfter.getDate() + 2);
    const dayAfterStr = dayAfter.toISOString().split("T")[0];

    // D-1, D-2 만기 대출 조회
    const { data: loans, error: loansError } = await supabase
      .from("loans")
      .select(
        "id, lender_id, borrower_id, amount, due_date, repay_amount, status",
      )
      .in("due_date", [tomorrowStr, dayAfterStr])
      .eq("status", "active");

    if (loansError) {
      console.error("Loans query error:", loansError);
      return new Response(JSON.stringify({ error: loansError.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!loans || loans.length === 0) {
      return new Response(
        JSON.stringify({ message: "만기 임박 대출 없음", processed: 0 }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    let notificationsInserted = 0;
    let pushSent = 0;

    for (const loan of loans) {
      const daysUntilDue =
        loan.due_date === tomorrowStr ? 1 : 2;
      const daysText = daysUntilDue === 1 ? "내일" : "모레";

      // 빌린 사람(borrower)에게 알림
      if (loan.borrower_id) {
        const title = `상환 만기 ${daysText}까지 (D-${daysUntilDue})`;
        const message = `₱${Number(loan.repay_amount || loan.amount).toLocaleString()} 상환이 ${daysText}(${loan.due_date}) 만기입니다.`;

        // 앱 내 알림 INSERT
        const { error: notifError } = await supabase
          .from("notifications")
          .insert({
            user_id: loan.borrower_id,
            title,
            message,
            type: "due_reminder",
          });

        if (!notifError) notificationsInserted++;

        // 휴대폰 푸시 알림
        const { data: subData } = await supabase
          .from("push_subscriptions")
          .select("subscription")
          .eq("user_id", loan.borrower_id)
          .single();

        if (subData?.subscription) {
          const payload = JSON.stringify({ title, body: message });
          const success = await sendWebPush(
            subData.subscription as any,
            payload,
            VAPID_PUBLIC_KEY,
            VAPID_PRIVATE_KEY,
            VAPID_SUBJECT,
          );
          if (success) pushSent++;
        }
      }

      // 빌려준 사람(lender)에게도 알림
      if (loan.lender_id) {
        const title = `대출 만기 ${daysText}까지 (D-${daysUntilDue})`;
        const message = `₱${Number(loan.repay_amount || loan.amount).toLocaleString()} 상환 만기일이 ${daysText}(${loan.due_date})입니다.`;

        await supabase.from("notifications").insert({
          user_id: loan.lender_id,
          title,
          message,
          type: "due_reminder",
        });

        notificationsInserted++;
      }
    }

    return new Response(
      JSON.stringify({
        message: "알림 발송 완료",
        loans_processed: loans.length,
        notifications_inserted: notificationsInserted,
        push_sent: pushSent,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Edge function error:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
