import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

const OCR_SERVER_URL = process.env.OCR_SERVER_URL || 'http://localhost:8000';

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
    const { requestId, imageUrl } = body;

    if (!requestId || !imageUrl) {
      return NextResponse.json({ error: 'Missing requestId or imageUrl' }, { status: 400 });
    }

    console.log(`[OCR] 검증 시작 - 요청 ID: ${requestId}, 이미지 URL: ${imageUrl}`);

    const { data: depositRequest, error: fetchError } = await supabase
      .from('deposit_requests')
      .select('*')
      .eq('id', requestId)
      .single();

    if (fetchError || !depositRequest) {
      console.error('[OCR] 충전 요청을 찾을 수 없습니다:', fetchError);
      return NextResponse.json({ error: 'Deposit request not found' }, { status: 404 });
    }

    if (depositRequest.status !== 'pending') {
      console.warn('[OCR] 대기 중인 요청이 아닙니다. 상태:', depositRequest.status);
      return NextResponse.json({ error: 'Deposit request is not pending' }, { status: 400 });
    }

    let imageBuffer: Buffer;
    try {
      const imgRes = await fetch(imageUrl);
      if (!imgRes.ok) {
        throw new Error(`Failed to fetch image: ${imgRes.statusText}`);
      }
      const arrayBuffer = await imgRes.arrayBuffer();
      imageBuffer = Buffer.from(arrayBuffer);
    } catch (fetchErr: any) {
      console.error('[OCR] 이미지 다운로드 실패:', fetchErr);
      return NextResponse.json({ error: 'Failed to download receipt image' }, { status: 400 });
    }

    const targetAmount = Number(depositRequest.unique_amount);
    const amountStr = targetAmount.toFixed(2);

    const formData = new FormData();
    formData.append('file', new Blob([imageBuffer], { type: 'image/jpeg' }), 'receipt.jpg');
    formData.append('expected_amount', amountStr);

    let ocrResult;
    try {
      const ocrRes = await fetch(`${OCR_SERVER_URL}/gcash-ocr`, {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(20000),
      });

      if (!ocrRes.ok) {
        throw new Error(`OCR server error: ${ocrRes.status}`);
      }
      ocrResult = await ocrRes.json();
    } catch (ocrErr: any) {
      console.error('[OCR] PaddleOCR 서버 호출 실패:', ocrErr);
      return NextResponse.json({
        success: false,
        reason: 'ocr_engine_error',
        message: '영수증 문자 분석 중 오류가 발생했습니다. 수동 승인 대기 처리됩니다.',
      });
    }

    console.log('[OCR] PaddleOCR 분석 결과:', ocrResult);

    const parsedRefNo = ocrResult.parsed_ref_no || '';
    const amountMatches = ocrResult.amount_matches === true;

    if (!amountMatches) {
      return NextResponse.json({
        success: false,
        reason: 'amount_mismatch',
        message: `입금증 금액이 고유 충전 금액(${amountStr})과 일치하지 않거나 텍스트 판독이 흐릿합니다. 수동 승인 대기 처리됩니다.`,
      });
    }

    if (!parsedRefNo) {
      return NextResponse.json({
        success: false,
        reason: 'ref_no_not_found',
        message: '영수증에서 참조번호(Reference No)를 판독하지 못했습니다. 수동 승인 대기 처리됩니다.',
      });
    }

    const { data: rpcResult, error: rpcError } = await supabase.rpc('complete_gcash_deposit', {
      p_received_amount: targetAmount,
      p_ref_no: parsedRefNo,
    });

    if (rpcError) {
      console.error('[OCR] RPC 입금 처리 실패:', rpcError);
      return NextResponse.json({ error: rpcError.message }, { status: 500 });
    }

    const result = rpcResult as any;
    if (result && !result.success) {
      console.warn('[OCR] RPC 응답 거부:', result.error);
      return NextResponse.json({
        success: false,
        reason: 'rpc_rejected',
        message: result.error || '이미 처리된 참조번호이거나 유효기간이 지난 요청입니다.',
      });
    }

    console.log(`[OCR] 입금 자동 매칭 완료! 유저 ID: ${user.id}, 참조번호: ${parsedRefNo}, 크레딧 지급완료`);
    return NextResponse.json({
      success: true,
      data: {
        refNo: parsedRefNo,
        amount: targetAmount,
        ocr_engine: ocrResult.ocr_engine || 'PP-OCRv6 Medium',
      },
    });
  } catch (err: any) {
    console.error('[OCR] 내부 처리 에러:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
