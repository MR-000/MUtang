import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { z } from 'zod';

const OCR_SERVER_URL = process.env.OCR_SERVER_URL || 'http://localhost:8000';

const faceCompareSchema = z.object({
  idImageUrl: z.string().url().startsWith('https://'),
  selfieImageUrl: z.string().url().startsWith('https://'),
});

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
    const supabase = await createClient(token);

    let user = null;
    if (token) {
      const { data } = await supabase.auth.getUser(token);
      user = data.user;
    } else {
      const { data } = await supabase.auth.getUser();
      user = data.user;
    }

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const parsed = faceCompareSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({
        success: false,
        match: null,
        message: '유효하지 않은 이미지 URL입니다.',
      });
    }

    const { idImageUrl, selfieImageUrl } = parsed.data;

    if (!OCR_SERVER_URL) {
      return NextResponse.json({
        success: false,
        match: null,
        message: '얼굴 비교 서비스가 구성되지 않았습니다. 수동 검토가 필요합니다.',
      });
    }

    const [idRes, selfieRes] = await Promise.all([
      fetch(idImageUrl),
      fetch(selfieImageUrl),
    ]);

    if (!idRes.ok || !selfieRes.ok) {
      return NextResponse.json({
        success: false,
        match: null,
        message: '이미지를 다운로드할 수 없습니다.',
      });
    }

    const [idBlob, selfieBlob] = await Promise.all([
      idRes.arrayBuffer(),
      selfieRes.arrayBuffer(),
    ]);

    const formData = new FormData();
    formData.append('id_image', new Blob([idBlob], { type: 'image/jpeg' }), 'id.jpg');
    formData.append('selfie_image', new Blob([selfieBlob], { type: 'image/jpeg' }), 'selfie.jpg');

    const faceRes = await fetch(`${OCR_SERVER_URL}/face-verify`, {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(30000),
    });

    if (!faceRes.ok) {
      const errText = await faceRes.text();
      console.error('[Face Compare] InsightFace server error:', errText);
      return NextResponse.json({
        success: false,
        match: null,
        message: '얼굴 비교 서비스 호출에 실패했습니다. 수동 검토가 필요합니다.',
      });
    }

    const result = await faceRes.json();

    return NextResponse.json({
      success: result.success === true,
      match: result.match === true,
      confidence: result.confidence || 0,
      reason: result.message || '',
    });
  } catch (err: any) {
    console.error('[Face Compare] Error:', err);
    return NextResponse.json({
      success: false,
      match: null,
      message: err.message || '얼굴 비교 중 오류가 발생했습니다.',
    });
  }
}
