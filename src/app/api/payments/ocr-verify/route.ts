import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import Tesseract from 'tesseract.js';

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

    console.log(`[OCR 요원] 검증 시작 - 요청 ID: ${requestId}, 이미지 URL: ${imageUrl}`);

    // 1. 충전 요청 조회
    const { data: depositRequest, error: fetchError } = await supabase
      .from('deposit_requests')
      .select('*')
      .eq('id', requestId)
      .single();

    if (fetchError || !depositRequest) {
      console.error('[OCR 요원] 충전 요청을 찾을 수 없습니다:', fetchError);
      return NextResponse.json({ error: 'Deposit request not found' }, { status: 404 });
    }

    if (depositRequest.status !== 'pending') {
      console.warn('[OCR 요원] 대기 중인 요청이 아닙니다. 상태:', depositRequest.status);
      return NextResponse.json({ error: 'Deposit request is not pending' }, { status: 400 });
    }

    // 2. 이미지 다운로드 및 버퍼 변환
    let imageBuffer: Buffer;
    try {
      const imgRes = await fetch(imageUrl);
      if (!imgRes.ok) {
        throw new Error(`Failed to fetch image: ${imgRes.statusText}`);
      }
      const arrayBuffer = await imgRes.arrayBuffer();
      imageBuffer = Buffer.from(arrayBuffer);
    } catch (fetchErr: any) {
      console.error('[OCR 요원] 이미지 다운로드 실패:', fetchErr);
      return NextResponse.json({ error: 'Failed to download receipt image' }, { status: 400 });
    }

    // 3. Tesseract OCR 구동 (시간 초과 방지를 위해 10초 타임아웃 설정)
    let ocrText = '';
    try {
      const ocrPromise = Tesseract.recognize(imageBuffer, 'eng');
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('OCR Timeout')), 10000)
      );

      const ocrResult = await Promise.race([ocrPromise, timeoutPromise]) as any;
      ocrText = ocrResult?.data?.text || '';
    } catch (ocrErr: any) {
      console.error('[OCR 요원] OCR 판독 엔진 실패:', ocrErr);
      return NextResponse.json({ 
        success: false, 
        reason: 'ocr_engine_error', 
        message: '영수증 문자 분석 중 오류가 발생했습니다. 수동 승인 대기 처리됩니다.' 
      });
    }

    console.log('[OCR 요원] 추출된 영수증 텍스트:\n', ocrText);

    // 4. 입금액 및 참조번호 추출 분석
    const normalizedText = ocrText.toLowerCase();

    // GCash 및 일반 영수증 참조번호 탐색용 정규식
    // 예: "Ref. No. 0000 123 456789" 또는 "Reference No: 9012345678901" 또는 11-13자리 고유 숫자 조합
    const refNoMatch = ocrText.match(/(?:ref(?:\.?\s*no\.?|erence)?|trans(?:\.?\s*no\.?)?)\s*:?\s*([0-9\s-]{11,17})/i);
    let parsedRefNo = '';
    if (refNoMatch) {
      parsedRefNo = refNoMatch[1].replace(/[\s-]/g, '');
    } else {
      // 11~13자리 숫자가 단독으로 쓰인 패턴 백업 서치
      const backupRefMatch = ocrText.match(/\b\d{11,13}\b/);
      if (backupRefMatch) {
        parsedRefNo = backupRefMatch[0];
      }
    }

    const targetAmount = Number(depositRequest.unique_amount);
    const amountStr = targetAmount.toFixed(2);
    
    // 텍스트상에 고유 금액(소수점 포함)이 존재하는지 확인
    const amountMatches = normalizedText.includes(amountStr) || normalizedText.includes(targetAmount.toString());

    console.log(`[OCR 요원] 분석 결과 - 파싱된 참조번호: ${parsedRefNo}, 고유 금액 매칭 여부: ${amountMatches} (기대금액: ${amountStr})`);

    if (!amountMatches) {
      return NextResponse.json({
        success: false,
        reason: 'amount_mismatch',
        message: `입금증 금액이 고유 충전 금액(${amountStr})과 일치하지 않거나 텍스트 판독이 흐릿합니다. 수동 승인 대기 처리됩니다.`
      });
    }

    if (!parsedRefNo) {
      return NextResponse.json({
        success: false,
        reason: 'ref_no_not_found',
        message: '영수증에서 참조번호(Reference No)를 판독하지 못했습니다. 수동 승인 대기 처리됩니다.'
      });
    }

    // 5. Supabase RPC complete_gcash_deposit 실행하여 트랜잭션 안전 처리
    const { data: rpcResult, error: rpcError } = await supabase.rpc('complete_gcash_deposit', {
      p_received_amount: targetAmount,
      p_ref_no: parsedRefNo
    });

    if (rpcError) {
      console.error('[OCR 요원] RPC 입금 처리 실패:', rpcError);
      return NextResponse.json({ error: rpcError.message }, { status: 500 });
    }

    const result = rpcResult as any;
    if (result && !result.success) {
      console.warn('[OCR 요원] RPC 응답 거부:', result.error);
      return NextResponse.json({
        success: false,
        reason: 'rpc_rejected',
        message: result.error || '이미 처리된 참조번호이거나 유효기간이 지난 요청입니다.'
      });
    }

    console.log(`[OCR 요원] 입금 자동 매칭 완료! 유저 ID: ${user.id}, 참조번호: ${parsedRefNo}, 크레딧 지급완료`);
    return NextResponse.json({
      success: true,
      data: {
        refNo: parsedRefNo,
        amount: targetAmount
      }
    });

  } catch (err: any) {
    console.error('[OCR 요원] 내부 처리 에러:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
