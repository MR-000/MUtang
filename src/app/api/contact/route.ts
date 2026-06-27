import { NextResponse } from 'next/server';
import { withAuth, errorResponse } from '@/lib/bff-helpers';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || '';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const RESEND_FROM = process.env.RESEND_FROM || 'MUtang <onboarding@resend.dev>';

export async function POST(req: Request) {
  const { response, supabase, user } = await withAuth(req);
  if (response || !supabase || !user) return response;

  try {
    const { subject, message } = await req.json();

    if (!message || message.trim().length === 0) {
      return NextResponse.json({ error: '메시지를 입력해주세요.' }, { status: 400 });
    }

    const safeSubject = subject?.trim() || '문의사항';
    const senderName = user.user_metadata?.full_name || user.email || '알 수 없는 사용자';

    const { data: admins } = await supabase
      .from('profiles')
      .select('id')
      .eq('is_admin', true);

    if (admins && admins.length > 0) {
      const notifications = admins.map((a: { id: string }) => ({
        user_id: a.id,
        title: `📩 ${safeSubject}`,
        message: `[${senderName}] ${message}`,
        type: 'contact',
      }));

      const { error: notifError } = await supabase
        .from('notifications')
        .insert(notifications);

      if (notifError) {
        console.error('[Contact] 알림 생성 실패:', notifError);
      }
    }

    if (RESEND_API_KEY && ADMIN_EMAIL) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: RESEND_FROM,
            to: [ADMIN_EMAIL],
            reply_to: user.email || ADMIN_EMAIL,
            subject: `[MUtang 문의] ${safeSubject}`,
            text: `보낸 사람: ${senderName} (${user.email || '이메일 없음'})\nUID: ${user.id}\n\n${message}`,
          }),
        });
      } catch (emailErr) {
        console.error('[Contact] 이메일 전송 실패:', emailErr);
      }
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    return errorResponse(e);
  }
}
