import { supabase } from './supabase';

export interface KYCResult {
  success: boolean;
  message: string;
  data?: {
    expiry_date?: string;
    id_number?: string;
    full_name?: string;
  };
}

/**
 * 클라이언트 사이드 이미지 압축
 * @param file 원본 파일
 * @param maxWidth 최대 너비 (기본 1280px)
 * @param quality 품질 (0.1 ~ 1.0)
 */
export const compressImage = (file: File, maxWidth = 1280, quality = 0.8): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else reject(new Error('Canvas to Blob conversion failed'));
          },
          'image/jpeg',
          quality
        );
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};

/**
 * 이미지 화질 정밀 분석 (빛반사 및 흐릿함 자동 판별)
 * Canvas API를 활용해 픽셀 명도 분석 및 라플라시안 에지 검출 시뮬레이션을 수행합니다.
 */
export const checkImageQuality = (blob: Blob): Promise<{ success: boolean; message: string }> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({ success: true, message: 'Quality check skipped (Canvas not supported)' });
          return;
        }

        // 분석 속도 최적화를 위해 고정 너비로 축소 후 픽셀 연산 수행
        const width = 300;
        const height = Math.floor((img.height * 300) / img.width);
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);

        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;
        
        let totalBrightness = 0;
        let glarePixels = 0; // 빛반사 의심 픽셀 (밝기 > 242)
        let edgeDeltaSum = 0; // 선명도(에지 강도) 판별을 위한 인접 픽셀 차이값 합산

        const pixelCount = width * height;
        const gray = new Uint8Array(pixelCount);
        
        // 1. 회색조(Grayscale) 변환 및 명도, 빛반사 픽셀 추출 (2픽셀 단위 샘플링으로 연산 부하 50% 절감)
        for (let i = 0; i < pixelCount; i += 2) {
          const r = data[i * 4]!;
          const g = data[i * 4 + 1]!;
          const b = data[i * 4 + 2]!;
          
          // 인간의 시각 인지 특성을 반영한 Luminance 공식 적용
          const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
          gray[i] = brightness;
          if (i + 1 < pixelCount) {
            gray[i + 1] = brightness; // 인접 픽셀 보간으로 메모리 구조 보장
          }
          totalBrightness += brightness * 2;

          // 극도로 밝은 빛반사 픽셀 체크
          if (brightness > 242) {
            glarePixels += 2;
          }
        }

        const avgBrightness = totalBrightness / pixelCount;

        // 2. 인접 픽셀 간 차이를 활용한 선명도(초점) 시뮬레이션 검사 (3픽셀 단위 간격 연산으로 성능 극대화)
        for (let y = 1; y < height - 1; y += 3) {
          for (let x = 1; x < width - 1; x += 3) {
            const idx = y * width + x;
            const val = gray[idx]!;
            const diffX = Math.abs(val - gray[idx + 1]!);
            const diffY = Math.abs(val - gray[idx + width]!);
            edgeDeltaSum += diffX + diffY;
          }
        }
        
        // 평균 에지 강도 (선명도 계수 보정)
        const sharpnessScore = edgeDeltaSum / (pixelCount / 9);

        // [판별 규칙 1] 빛반사 검사 완화 (흰색 반사 영역이 15% 초과할 때 판정)
        const glareRatio = glarePixels / pixelCount;
        if (glareRatio > 0.15) {
          resolve({
            success: false,
            message: '신분증 표면에 강한 빛반사가 감지되었습니다. 조명이 직접 비치지 않는 곳으로 각도를 조절하여 다시 촬영해 주세요.'
          });
          return;
        }

        // [판별 규칙 2] 흐릿함 검사 완화 (선명도 계수가 3.0 이하일 때 흔들림 판정)
        if (sharpnessScore < 3.0) {
          resolve({
            success: false,
            message: '사진이 흔들렸거나 초점이 흐릿합니다. 휴대폰을 고정하고 선명하게 다시 촬영해 주세요.'
          });
          return;
        }

        // [판별 규칙 3] 촬영 환경 밝기 완화 (Luminance 평균 25 이하일 때 어두움 판정)
        if (avgBrightness < 25) {
          resolve({
            success: false,
            message: '촬영된 화면이 너무 어둡습니다. 밝은 조명 아래에서 다시 촬영해 주세요.'
          });
          return;
        }

        resolve({ success: true, message: 'AI 화질 분석 통과 완료' });
      };
      img.onerror = () => resolve({ success: false, message: '화질 검사를 위한 이미지 로드 실패' });
    };
    reader.onerror = () => resolve({ success: false, message: '파일 변환 실패로 화질 검사 건너뜀' });
  });
};

/**
 * PaddleOCR + PP-StructureV3 연동 (FastAPI)
 */
export const analyzeWithOCR = async (blob: Blob): Promise<KYCResult> => {
  try {
    const formData = new FormData();
    formData.append('file', blob, 'id_capture.jpg');

    const ocrUrl = process.env.NEXT_PUBLIC_OCR_URL || 'http://localhost:8000/ocr';

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    const response = await fetch(ocrUrl, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`OCR Server HTTP error: ${response.status}`);
    }

    const resData = await response.json();

    const fullText = resData.text || '';
    const lines = resData.lines || [];
    const fullName = extractField(fullText, ['name', 'full name', 'surname', 'given names']);
    const idNumber = extractField(fullText, ['id number', 'id no', 'identification', 'tin', 'sss', 'umid']);
    const expiryDate = extractField(fullText, ['expiry', 'expiration', 'valid until', 'date of expiry']);

    if (!fullName && !idNumber) {
      return {
        success: false,
        message: 'OCR 결과에서 필요한 정보를 추출할 수 없습니다. 신분증이 선명하게 보이도록 다시 촬영해 주세요.',
      };
    }

    return {
      success: true,
      message: `OCR Analysis Complete (${resData.ocr_engine || 'PP-OCRv6 Medium'})`,
      data: {
        full_name: fullName || '',
        id_number: idNumber || '',
        expiry_date: expiryDate || '',
      },
    };
  } catch (error: any) {
    console.error('[OCR] 서버 연결 실패:', error.message);
    return {
      success: false,
      message: '신분증 인식 서버에 연결할 수 없습니다. 잠시 후 다시 시도하거나 관리자에게 문의해 주세요.',
    };
  }
};

/**
 * 문서 구조 분석 (PP-StructureV3)
 */
export const analyzeDocumentStructure = async (blob: Blob): Promise<{
  success: boolean;
  elements: { type: string; text: string }[];
  message: string;
}> => {
  try {
    const formData = new FormData();
    formData.append('file', blob, 'document.jpg');

    const url = process.env.NEXT_PUBLIC_OCR_URL
      ? process.env.NEXT_PUBLIC_OCR_URL.replace('/ocr', '/structure')
      : 'http://localhost:8000/structure';

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(url, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Structure Server HTTP error: ${response.status}`);
    }

    const resData = await response.json();

    return {
      success: true,
      elements: (resData.elements || []).map((el: any) => ({
        type: el.type || 'unknown',
        text: el.text || '',
      })),
      message: `PP-StructureV3 분석 완료 (${resData.element_count || 0}개 요소)`,
    };
  } catch (error: any) {
    console.error('[Structure] 서버 연결 실패:', error.message);
    return {
      success: false,
      elements: [],
      message: '문서 구조 분석 서버에 연결할 수 없습니다.',
    };
  }
};

function extractField(text: string, keywords: string[]): string {
  const lines = text.split('\n');
  for (const line of lines) {
    const lower = line.toLowerCase().trim();
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        const after = line.substring(line.toLowerCase().indexOf(kw) + kw.length).trim();
        if (after && after.length < 60) {
          return after.replace(/^[:.\s\-]+/, '').trim();
        }
      }
    }
  }
  return '';
}

/**
 * 최종 신분증 검수 및 프로필 업데이트 (셀피 이미지 포함)
 */
export const verifyIDDocument = async (userId: string, paths: string[]): Promise<KYCResult> => {
  try {
    const { error } = await supabase
      .from('profiles')
      .update({
        id_front_url: paths[0],
        id_back_url: paths[1],
        id_front_url_2: paths[2],
        id_back_url_2: paths[3],
        selfie_url: paths[4], // 5단계 셀피 이미지 경로 추가 저장
        verification_status: 'pending',
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (error) throw error;

    return {
      success: true,
      message: 'Verification documents submitted'
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message
    };
  }
};
