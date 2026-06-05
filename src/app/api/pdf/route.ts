import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// 폰트 바이너리 캐시
let cachedFontBytes: ArrayBuffer | null = null;

async function getFontBytes() {
  if (cachedFontBytes) return cachedFontBytes;
  // googlefonts 공식 noto-cjk 레포지토리의 Korean NotoSans CJK OTF 경로로 수정 (가장 확실하게 실존하며 다운로드 가능)
  const fontUrl = 'https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/Korean/NotoSansCJKkr-Regular.otf';
  try {
    const res = await fetch(fontUrl);
    if (!res.ok) {
      throw new Error(`Font server returned status: ${res.status}`);
    }
    cachedFontBytes = await res.arrayBuffer();
    return cachedFontBytes;
  } catch (error) {
    console.error('Failed to download Noto Sans CJK KR font from primary URL:', error);
    // 예비 gstatic fallback 주소 유지
    const fallbackUrl = 'https://fonts.gstatic.com/s/notosanskr/v35/yGy47oWpbf3gURWgcQ2oO7mRL1A.ttf';
    try {
      const fallbackRes = await fetch(fallbackUrl);
      if (!fallbackRes.ok) {
        throw new Error(`Fallback returned status: ${fallbackRes.status}`);
      }
      cachedFontBytes = await fallbackRes.arrayBuffer();
      return cachedFontBytes;
    } catch (fallbackError) {
      console.error('Failed to download Noto Sans KR font from fallback URL:', fallbackError);
      throw new Error('Failed to download Noto Sans KR font from all URLs');
    }
  }
}

// 외부 이미지 임베딩 (서버에서 가져오므로 CORS 문제 없음)
async function embedImageFromUrl(pdfDoc: PDFDocument, url: string) {
  if (!url) {
    return null;
  }
  if (url.startsWith('data:') || url.includes('base64,')) {
    return await embedBase64Image(pdfDoc, url);
  }
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`[embedImageFromUrl] Failed to fetch image: status=${res.status}, url=${url}`);
      return null;
    }
    const arrayBuffer = await res.arrayBuffer();
    
    // URL 확장자 또는 Content-Type 기반으로 png/jpg 판별
    const contentType = res.headers.get('content-type') || '';
    if (url.toLowerCase().endsWith('.png') || contentType.includes('image/png')) {
      return await pdfDoc.embedPng(arrayBuffer);
    } else {
      return await pdfDoc.embedJpg(arrayBuffer);
    }
  } catch (e) {
    console.error('[embedImageFromUrl] Failed to embed image from url:', url, e);
    return null;
  }
}

// base64 서명 이미지 임베딩
async function embedBase64Image(pdfDoc: PDFDocument, base64Data: string) {
  if (!base64Data) {
    return null;
  }
  try {
    let base64Str = base64Data;
    let isPng = true; // 기본값 png로 세팅

    if (base64Data.includes(',')) {
      const parts = base64Data.split(',');
      base64Str = parts[1];
      const header = parts[0];
      if (header.includes('image/jpeg') || header.includes('image/jpg')) {
        isPng = false;
      }
    } else {
      // data: 접두사가 없는 경우 데이터 내용을 통해 png 여부 간이 판별
      if (base64Data.startsWith('/9j/')) {
        isPng = false; // JPEG magic number
      }
    }

    const buffer = Buffer.from(base64Str, 'base64');
    if (isPng) {
      return await pdfDoc.embedPng(buffer);
    } else {
      return await pdfDoc.embedJpg(buffer);
    }
  } catch (e) {
    console.error('[embedBase64Image] Failed to embed base64 image:', e);
    return null;
  }
}

// 텍스트 자동 줄바꿈 헬퍼
function wrapText(text: string, font: any, fontSize: number, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const width = font.widthOfTextAtSize(testLine, fontSize);
    if (width > maxWidth) {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }
  return lines;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    // Authorization 헤더에서 사용자 토큰 추출
    const authHeader = req.headers.get('Authorization');
    const userToken = authHeader?.replace('Bearer ', '') || null;
    
    let {
      id,
      lang,
      lenderName,
      lenderPhone,
      borrowerName,
      transactionDate,
      amount,
      interestRate,
      repayAmount,
      dueDate,
      localTitle,
      enTitle,
      localDescription,
      enDescription,
      localPolicy,
      enPolicy,
      localDisclaimer,
      enDisclaimer,
      lenderSig,
      borrowerSig,
      photos,
      labels
    } = body;

    // photos가 모두 null이면 Supabase DB에서 직접 조회하여 폴백
    const hasPhotos = photos && (photos.front1 || photos.back1 || photos.front2 || photos.back2 || photos.selfie);
    let dbLenderSig = lenderSig;
    let dbBorrowerSig = borrowerSig;
    if (!hasPhotos && id) {
      try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
        const supabase = createSupabaseClient(supabaseUrl, supabaseKey, {
          global: { headers: userToken ? { Authorization: `Bearer ${userToken}` } : {} }
        });
        const { data: loanData, error: loanError } = await supabase
          .from('loans')
          .select('verification_evidence, signature_data')
          .eq('id', id)
          .single();
        if (!loanError && loanData) {
          let evidence = loanData.verification_evidence;
          if (typeof evidence === 'string') {
            try { evidence = JSON.parse(evidence); } catch { evidence = null; }
          }
          if (evidence?.photos) {
            photos = evidence.photos;
          }
          // 서명도 DB에서 폴백
          if (!lenderSig || !borrowerSig) {
            let sigs = loanData.signature_data;
            if (typeof sigs === 'string') {
              try { sigs = JSON.parse(sigs); } catch { sigs = null; }
            }
            dbLenderSig = sigs?.lender || lenderSig;
            dbBorrowerSig = sigs?.borrower || borrowerSig;
          }
        }
      } catch (dbErr) {
        console.error('[PDF API] DB fallback error:', dbErr);
      }
    }
    // DB 폴백 서명 적용
    if (dbLenderSig && !lenderSig) lenderSig = dbLenderSig;
    if (dbBorrowerSig && !borrowerSig) borrowerSig = dbBorrowerSig;

    // 다국어 기본값 세팅
    const defaultLabels = {
      lender: '채권자',
      borrower: '채무자',
      date: '거래 일자',
      termsTitle: '거래 조건 및 세부 규칙',
      principal: '원금',
      interest: '이율',
      repayment: '상환 총액',
      due: '만기일',
      lenderSignature: '채권자 서명',
      borrowerSignature: '채무자 서명',
      noSignature: '서명 미등록',
      description: '거래 내용',
      overdue: '연체 규정'
    };
    const activeLabels = { ...defaultLabels, ...labels };

    // 1. PDF 도큐먼트 초기화 및 폰트 로드
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);
    const fontBytes = await getFontBytes();
    const font = await pdfDoc.embedFont(fontBytes);

    // 2. 공통 드로잉 스타일 도구
    const primaryColor = rgb(0.12, 0.23, 0.54); // #1e3a8a (Navy)
    const textColor = rgb(0.06, 0.09, 0.16); // #0f172a (Dark slate)
    const grayColor = rgb(0.39, 0.45, 0.55); // #64748b (Slate gray)
    const redColor = rgb(0.86, 0.11, 0.28); // #e11d48 (Rose)
    const borderGray = rgb(0.89, 0.91, 0.94); // #e2e8f0
    const lightBackground = rgb(0.97, 0.98, 0.99); // #f8fafc

    // 서명 이미지 미리 임베딩하여 공유
    const lenderSigImg = await embedBase64Image(pdfDoc, lenderSig);
    const borrowerSigImg = await embedBase64Image(pdfDoc, borrowerSig);

    const isEnglishOnly = lang === 'en';

    // ==========================================
    // 1페이지: 현지어 계약서 (한국어/타갈로그어 등) - 영어 선택 시 제외
    // ==========================================
    if (!isEnglishOnly) {
      const page1 = pdfDoc.addPage([612, 792]); // Letter 크기
      
      // 상단 타이틀 영역
      page1.drawText(localTitle || '외상거래 계약서 및 원장 기록', { x: 40, y: 720, size: 18, font, color: primaryColor });
      page1.drawText(`Transaction ID: ${id}`, { x: 40, y: 700, size: 8, font, color: grayColor });
      page1.drawLine({ start: { x: 40, y: 690 }, end: { x: 572, y: 690 }, thickness: 1.5, color: borderGray });

      // 당사자 인적 정보 박스 배경
      page1.drawRectangle({ x: 40, y: 580, width: 532, height: 95, color: lightBackground, borderColor: borderGray, borderWidth: 1 });
      
      // 당사자 정보 텍스트
      page1.drawText(`${activeLabels.lender}:`, { x: 55, y: 650, size: 10, font, color: grayColor });
      page1.drawText(`${lenderName || '-'} (${lenderPhone || '-'})`, { x: 170, y: 650, size: 10, font, color: textColor });
      
      page1.drawText(`${activeLabels.borrower}:`, { x: 55, y: 625, size: 10, font, color: grayColor });
      page1.drawText(`${borrowerName || '-'}`, { x: 170, y: 625, size: 10, font, color: textColor });
      
      page1.drawText(`${activeLabels.date}:`, { x: 55, y: 600, size: 10, font, color: grayColor });
      page1.drawText(`${transactionDate || '-'}`, { x: 170, y: 600, size: 10, font, color: textColor });

      // 거래 조건 표 (Table)
      page1.drawText(activeLabels.termsTitle, { x: 40, y: 550, size: 12, font, color: textColor });
      
      // 표 헤더 배경
      page1.drawRectangle({ x: 40, y: 505, width: 532, height: 30, color: lightBackground, borderColor: borderGray, borderWidth: 1 });
      page1.drawText(activeLabels.principal, { x: 55, y: 517, size: 9, font, color: grayColor });
      page1.drawText(activeLabels.interest, { x: 180, y: 517, size: 9, font, color: grayColor });
      page1.drawText(activeLabels.repayment, { x: 300, y: 517, size: 9, font, color: grayColor });
      page1.drawText(activeLabels.due, { x: 450, y: 517, size: 9, font, color: grayColor });

      // 표 데이터
      page1.drawRectangle({ x: 40, y: 465, width: 532, height: 40, borderColor: borderGray, borderWidth: 1 });
      page1.drawText(amount || '-', { x: 55, y: 480, size: 11, font, color: textColor });
      page1.drawText(interestRate || '-', { x: 180, y: 480, size: 11, font, color: primaryColor });
      page1.drawText(repayAmount || '-', { x: 300, y: 480, size: 11, font, color: textColor });
      page1.drawText(dueDate || '-', { x: 450, y: 480, size: 11, font, color: redColor });

      // 상세 내용 및 연체 규정 박스
      page1.drawRectangle({ x: 40, y: 360, width: 532, height: 90, color: lightBackground, borderColor: borderGray, borderWidth: 1 });
      
      const wrappedLocalDesc = wrapText(`${activeLabels.description}: ${localDescription || '-'}`, font, 10, 500);
      let descY = 430;
      wrappedLocalDesc.slice(0, 2).forEach(line => {
        page1.drawText(line, { x: 55, y: descY, size: 10, font, color: textColor });
        descY -= 16;
      });

      const wrappedLocalPolicy = wrapText(`${activeLabels.overdue}: ${localPolicy || '-'}`, font, 10, 500);
      let policyY = descY - 6;
      wrappedLocalPolicy.slice(0, 2).forEach(line => {
        page1.drawText(line, { x: 55, y: policyY, size: 10, font, color: redColor });
        policyY -= 16;
      });

      // 법적 서약 및 고지 사항
      page1.drawRectangle({ x: 40, y: 220, width: 532, height: 120, color: lightBackground, borderColor: borderGray, borderWidth: 1 });
      const wrappedLocalDisclaimer = wrapText(localDisclaimer || '', font, 9, 500);
      let discLocalY = 320;
      wrappedLocalDisclaimer.slice(0, 6).forEach(line => {
        page1.drawText(line, { x: 55, y: discLocalY, size: 9, font, color: grayColor });
        discLocalY -= 14;
      });

      // 채권자 서명 박스
      page1.drawRectangle({ x: 40, y: 60, width: 250, height: 140, borderColor: borderGray, borderWidth: 1 });
      page1.drawText(activeLabels.lenderSignature, { x: 50, y: 180, size: 10, font, color: grayColor });
      if (lenderSigImg) {
        page1.drawImage(lenderSigImg, { x: 75, y: 90, width: 180, height: 65 });
      } else {
        page1.drawText(activeLabels.noSignature, { x: 120, y: 115, size: 10, font, color: grayColor });
      }
      page1.drawText(lenderName || '-', { x: 50, y: 70, size: 10, font, color: textColor });

      // 채무자 서명 박스
      page1.drawRectangle({ x: 322, y: 60, width: 250, height: 140, borderColor: borderGray, borderWidth: 1 });
      page1.drawText(activeLabels.borrowerSignature, { x: 332, y: 180, size: 10, font, color: grayColor });
      if (borrowerSigImg) {
        page1.drawImage(borrowerSigImg, { x: 357, y: 90, width: 180, height: 65 });
      } else {
        page1.drawText(activeLabels.noSignature, { x: 402, y: 115, size: 10, font, color: grayColor });
      }
      page1.drawText(borrowerName || '-', { x: 332, y: 70, size: 10, font, color: textColor });
    }

    // ==========================================
    // 2페이지 (영어 선택 시 1페이지): 영문 계약서 (English Version)
    // ==========================================
    const page2 = pdfDoc.addPage([612, 792]);
    
    // 상단 타이틀 영역
    page2.drawText(enTitle || 'Credit Transaction Agreement', { x: 40, y: 720, size: 18, font, color: primaryColor });
    page2.drawText(`Transaction ID: ${id}`, { x: 40, y: 700, size: 8, font, color: grayColor });
    page2.drawLine({ start: { x: 40, y: 690 }, end: { x: 572, y: 690 }, thickness: 1.5, color: borderGray });

    // 당사자 인적 정보 박스 배경
    page2.drawRectangle({ x: 40, y: 580, width: 532, height: 95, color: lightBackground, borderColor: borderGray, borderWidth: 1 });
    
    // 당사자 정보 텍스트
    page2.drawText(`Lender:`, { x: 55, y: 650, size: 10, font, color: grayColor });
    page2.drawText(`${lenderName || '-'} (${lenderPhone || '-'})`, { x: 170, y: 650, size: 10, font, color: textColor });
    
    page2.drawText(`Borrower:`, { x: 55, y: 625, size: 10, font, color: grayColor });
    page2.drawText(`${borrowerName || '-'}`, { x: 170, y: 625, size: 10, font, color: textColor });
    
    page2.drawText(`Transaction Date:`, { x: 55, y: 600, size: 10, font, color: grayColor });
    page2.drawText(`${transactionDate || '-'}`, { x: 170, y: 600, size: 10, font, color: textColor });

    // 거래 조건 표 (Table)
    page2.drawText('Financial Terms and Conditions', { x: 40, y: 550, size: 12, font, color: textColor });
    
    // 표 헤더 배경
    page2.drawRectangle({ x: 40, y: 505, width: 532, height: 30, color: lightBackground, borderColor: borderGray, borderWidth: 1 });
    page2.drawText('Principal Amount', { x: 55, y: 517, size: 9, font, color: grayColor });
    page2.drawText('Interest Rate', { x: 180, y: 517, size: 9, font, color: grayColor });
    page2.drawText('Repayment Amount', { x: 300, y: 517, size: 9, font, color: grayColor });
    page2.drawText('Due Date', { x: 450, y: 517, size: 9, font, color: grayColor });

    // 표 데이터
    page2.drawRectangle({ x: 40, y: 465, width: 532, height: 40, borderColor: borderGray, borderWidth: 1 });
    page2.drawText(amount || '-', { x: 55, y: 480, size: 11, font, color: textColor });
    page2.drawText(interestRate || '-', { x: 180, y: 480, size: 11, font, color: primaryColor });
    page2.drawText(repayAmount || '-', { x: 300, y: 480, size: 11, font, color: textColor });
    page2.drawText(dueDate || '-', { x: 450, y: 480, size: 11, font, color: redColor });

    // 상세 내용 및 연체 규정 박스
    page2.drawRectangle({ x: 40, y: 360, width: 532, height: 90, color: lightBackground, borderColor: borderGray, borderWidth: 1 });
    
    const wrappedEnDesc = wrapText(`Description: ${enDescription || '-'}`, font, 10, 500);
    let descEnY = 430;
    wrappedEnDesc.slice(0, 2).forEach(line => {
      page2.drawText(line, { x: 55, y: descEnY, size: 10, font, color: textColor });
      descEnY -= 16;
    });

    const wrappedEnPolicy = wrapText(`Overdue Rules: ${enPolicy || '-'}`, font, 10, 500);
    let policyEnY = descEnY - 6;
    wrappedEnPolicy.slice(0, 2).forEach(line => {
      page2.drawText(line, { x: 55, y: policyEnY, size: 10, font, color: redColor });
      policyEnY -= 16;
    });

    // 법적 서약 및 고지 사항
    page2.drawRectangle({ x: 40, y: 220, width: 532, height: 120, color: lightBackground, borderColor: borderGray, borderWidth: 1 });
    const wrappedEnDisclaimer = wrapText(enDisclaimer || '', font, 9, 500);
    let discEnY2 = 320;
    wrappedEnDisclaimer.slice(0, 6).forEach(line => {
      page2.drawText(line, { x: 55, y: discEnY2, size: 9, font, color: grayColor });
      discEnY2 -= 14;
    });

    // 서명 영역 그리기
    // 채권자 서명 박스
    page2.drawRectangle({ x: 40, y: 60, width: 250, height: 140, borderColor: borderGray, borderWidth: 1 });
    page2.drawText('Lender Signature', { x: 50, y: 180, size: 10, font, color: grayColor });
    if (lenderSigImg) {
      page2.drawImage(lenderSigImg, { x: 75, y: 90, width: 180, height: 65 });
    } else {
      page2.drawText('No Signature', { x: 120, y: 115, size: 10, font, color: grayColor });
    }
    page2.drawText(lenderName || '-', { x: 50, y: 70, size: 10, font, color: textColor });

    // 채무자 서명 박스
    page2.drawRectangle({ x: 322, y: 60, width: 250, height: 140, borderColor: borderGray, borderWidth: 1 });
    page2.drawText('Borrower Signature', { x: 332, y: 180, size: 10, font, color: grayColor });
    if (borrowerSigImg) {
      page2.drawImage(borrowerSigImg, { x: 357, y: 90, width: 180, height: 65 });
    } else {
      page2.drawText('No Signature', { x: 402, y: 115, size: 10, font, color: grayColor });
    }
    page2.drawText(borrowerName || '-', { x: 332, y: 70, size: 10, font, color: textColor });


    // ==========================================
    // 3페이지: 법적 신원 증빙 자료 첨부 (CORS 우회 렌더링)
    // ==========================================
    if (photos && (photos.front1 || photos.back1 || photos.front2 || photos.back2 || photos.selfie)) {
      const page3 = pdfDoc.addPage([612, 792]);
      
      // 상단 타이틀 영역
      page3.drawText('Identity Verification Evidence', { x: 40, y: 720, size: 16, font, color: primaryColor });
      page3.drawText('Transaction Legal Security Records', { x: 40, y: 700, size: 8, font, color: grayColor });
      page3.drawLine({ start: { x: 40, y: 690 }, end: { x: 572, y: 690 }, thickness: 1.5, color: borderGray });

      // 안내 문구
      page3.drawText(
        'The following documents were securely captured and verified through AI ML Kit scanning during transaction',
        { x: 40, y: 665, size: 8, font, color: textColor }
      );
      page3.drawText(
        'agreement to ensure the legal binding and non-repudiation of both parties.',
        { x: 40, y: 652, size: 8, font, color: textColor }
      );

      // 사진 배치 좌표 계산 (그리드 형태)
      const photoKeys = ['front1', 'back1', 'front2', 'back2', 'selfie'];
      const photoLabels: Record<string, string> = {
        front1: 'ID FRONT 1',
        back1: 'ID BACK 1',
        front2: 'ID FRONT 2',
        back2: 'ID BACK 2',
        selfie: 'LIVELINESS SELFIE'
      };

      let xPos = 40;
      let yPos = 460;
      const cardWidth = 150;
      const cardHeight = 150;
      const gap = 20;

      for (const key of photoKeys) {
        const imgUrl = photos[key];
        if (!imgUrl) continue;

        // 서버에서 이미지 바이너리 다운로드하여 삽입 (CORS 없음)
        const embedImg = await embedImageFromUrl(pdfDoc, imgUrl);
        if (embedImg) {
          // 사진 카드 박스 테두리
          page3.drawRectangle({ x: xPos, y: yPos, width: cardWidth, height: cardHeight, borderColor: borderGray, borderWidth: 1 });
          
          // 사진 이미지 렌더링 (비율 맞추어 조정)
          page3.drawImage(embedImg, { x: xPos + 10, y: yPos + 30, width: cardWidth - 20, height: cardHeight - 50 });
          
          // 라벨 쓰기
          page3.drawText(photoLabels[key], { x: xPos + 15, y: yPos + 12, size: 8, font, color: grayColor });

          // 다음 열로 이동
          xPos += cardWidth + gap;
          if (xPos + cardWidth > 572) {
            xPos = 40;
            yPos -= cardHeight + gap; // 다음 행으로 이동
          }
        }
      }
    }

    // 4. PDF 최종 빌드 및 응답 스트림 전송
    const pdfBytes = await pdfDoc.save();
    return new NextResponse(pdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename=Agreement_${id}.pdf`
      }
    });

  } catch (error: any) {
    console.error('Server PDF Generation Error:', error);
    return NextResponse.json({ error: error.message || 'Failed to generate PDF' }, { status: 500 });
  }
}
