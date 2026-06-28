// OpenCV.js 헬퍼 모듈
// 브라우저 전역에 로드된 cv 객체를 TypeScript에서 사용하기 위한 타입 설정
declare const cv: any;

export interface Point2D {
  x: number;
  y: number;
}

/**
 * OpenCV.js가 로딩되었는지 확인
 */
export const isOpenCVReady = (): boolean => {
  return typeof cv !== 'undefined' && cv.Mat !== undefined;
};

/**
 * 4개의 모서리 좌표를 순서에 맞게 정렬 (좌상, 우상, 우하, 좌하)
 */
export const sortCorners = (points: Point2D[]): Point2D[] => {
  if (points.length !== 4) return points;

  // x + y 합과 x - y 차를 기준으로 정렬
  // 좌상(sum 최소), 우하(sum 최대)
  // 우상(diff 최대), 좌하(diff 최소)
  const sorted = new Array<Point2D>(4);

  const sumList = points.map(p => p.x + p.y);
  const diffList = points.map(p => p.x - p.y);

  // sum 최소 -> 좌상(Top-Left)
  let tlIdx = 0;
  let minSum = sumList[0]!;
  for (let i = 1; i < 4; i++) {
    if (sumList[i]! < minSum) {
      minSum = sumList[i]!;
      tlIdx = i;
    }
  }
  sorted[0] = points[tlIdx]!;

  // sum 최대 -> 우하(Bottom-Right)
  let brIdx = 0;
  let maxSum = sumList[0]!;
  for (let i = 1; i < 4; i++) {
    if (sumList[i]! > maxSum) {
      maxSum = sumList[i]!;
      brIdx = i;
    }
  }
  sorted[2] = points[brIdx]!;

  // diff 최대 -> 우상(Top-Right)
  let trIdx = 0;
  let maxDiff = diffList[0]!;
  for (let i = 1; i < 4; i++) {
    // 이미 할당된 인덱스 제외 필터링 또는 단순히 diff 기반
    if (diffList[i]! > maxDiff) {
      maxDiff = diffList[i]!;
      trIdx = i;
    }
  }
  sorted[1] = points[trIdx]!;

  // diff 최소 -> 좌하(Bottom-Left)
  let blIdx = 0;
  let minDiff = diffList[0]!;
  for (let i = 1; i < 4; i++) {
    if (diffList[i]! < minDiff) {
      minDiff = diffList[i]!;
      blIdx = i;
    }
  }
  sorted[3] = points[blIdx]!;

  // 중복이 발생할 경우 예외 처리 방어코드
  const usedIndices = new Set([tlIdx, trIdx, brIdx, blIdx]);
  if (usedIndices.size < 4) {
    // 중복 발생 시 시계 방향 임시 정렬
    const cx = points.reduce((acc, p) => acc + p.x, 0) / 4;
    const cy = points.reduce((acc, p) => acc + p.y, 0) / 4;
    return points.slice().sort((a, b) => {
      const angleA = Math.atan2(a.y - cy, a.x - cx);
      const angleB = Math.atan2(b.y - cy, b.x - cx);
      return angleA - angleB;
    });
  }

  return sorted;
};

/**
 * 이미지에서 신분증/영수증 문서의 외곽 윤곽선을 검출하고 4개 모서리를 반환
 */
export const detectDocumentCorners = (canvasIdOrElement: HTMLCanvasElement): Point2D[] | null => {
  if (!isOpenCVReady()) {
    console.warn('OpenCV.js is not loaded yet.');
    return null;
  }

  let src = null;
  let gray = null;
  let blurred = null;
  let edged = null;
  let contours = null;
  let hierarchy = null;

  try {
    src = cv.imread(canvasIdOrElement);
    gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    blurred = new cv.Mat();
    const ksize = new cv.Size(5, 5);
    cv.GaussianBlur(gray, blurred, ksize, 0, 0, cv.BORDER_DEFAULT);

    edged = new cv.Mat();
    cv.Canny(blurred, edged, 75, 200, 3, false);

    contours = new cv.MatVector();
    hierarchy = new cv.Mat();
    cv.findContours(edged, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    let maxArea = 0;
    let maxContourIndex = -1;

    for (let i = 0; i < contours.size(); ++i) {
      const cnt = contours.get(i);
      const area = cv.contourArea(cnt);
      if (area > maxArea) {
        maxArea = area;
        maxContourIndex = i;
      }
    }

    if (maxContourIndex === -1 || maxArea < (src.rows * src.cols * 0.05)) {
      // 이미지 크기의 5% 이하인 경우 무효 처리
      return null;
    }

    const maxContour = contours.get(maxContourIndex);
    const peri = cv.arcLength(maxContour, true);
    const approx = new cv.Mat();
    cv.approxPolyDP(maxContour, approx, 0.02 * peri, true);

    if (approx.rows === 4) {
      const corners: Point2D[] = [];
      for (let i = 0; i < 4; ++i) {
        corners.push({
          x: approx.data32S[i * 2]!,
          y: approx.data32S[i * 2 + 1]!
        });
      }
      approx.delete();
      return sortCorners(corners);
    }

    approx.delete();
    return null;
  } catch (err) {
    console.error('Error during document detection:', err);
    return null;
  } finally {
    if (src) src.delete();
    if (gray) gray.delete();
    if (blurred) blurred.delete();
    if (edged) edged.delete();
    if (contours) contours.delete();
    if (hierarchy) hierarchy.delete();
  }
};

/**
 * 4점 투사 변환(Perspective Transform)을 적용하여 보정된 이미지를 출력
 */
export const transformPerspective = (
  srcCanvas: HTMLCanvasElement,
  dstCanvas: HTMLCanvasElement,
  corners: Point2D[]
): boolean => {
  if (!isOpenCVReady() || corners.length !== 4) return false;

  let src = null;
  let dst = null;
  let srcTri = null;
  let dstTri = null;
  let M = null;

  try {
    src = cv.imread(srcCanvas);

    // 보정 후 목표 크기 산출 (좌-우 폭, 상-하 높이 비교하여 최대치 반영)
    const tl = corners[0]!;
    const tr = corners[1]!;
    const br = corners[2]!;
    const bl = corners[3]!;

    const widthA = Math.sqrt(Math.pow(br.x - bl.x, 2) + Math.pow(br.y - bl.y, 2));
    const widthB = Math.sqrt(Math.pow(tr.x - tl.x, 2) + Math.pow(tr.y - tl.y, 2));
    const maxWidth = Math.max(widthA, widthB);

    const heightA = Math.sqrt(Math.pow(tr.x - br.x, 2) + Math.pow(tr.y - br.y, 2));
    const heightB = Math.sqrt(Math.pow(tl.x - bl.x, 2) + Math.pow(tl.y - bl.y, 2));
    const maxHeight = Math.max(heightA, heightB);

    // 정적 규격으로 왜곡 보정 (영수증 및 신분증 분석을 위해 800 * 500 크기로 강제 통일도 가능하나 비율 유지가 나음)
    // 여기서는 계산된 크기를 타겟으로 지정
    const width = Math.round(maxWidth);
    const height = Math.round(maxHeight);

    if (width <= 0 || height <= 0) return false;

    dst = new cv.Mat();
    const dsize = new cv.Size(width, height);

    // 원본 모서리 배열 (Float32)
    srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
      tl.x, tl.y,
      tr.x, tr.y,
      br.x, br.y,
      bl.x, bl.y
    ]);

    // 보정 목표 모서리 배열
    dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
      0, 0,
      width - 1, 0,
      width - 1, height - 1,
      0, height - 1
    ]);

    M = cv.getPerspectiveTransform(srcTri, dstTri);
    cv.warpPerspective(src, dst, M, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());

    cv.imshow(dstCanvas, dst);
    return true;
  } catch (err) {
    console.error('Error during perspective transform:', err);
    return false;
  } finally {
    if (src) src.delete();
    if (dst) dst.delete();
    if (srcTri) srcTri.delete();
    if (dstTri) dstTri.delete();
    if (M) M.delete();
  }
};
