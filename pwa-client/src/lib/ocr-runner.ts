import * as ort from 'onnxruntime-web';
import { fetchWithCache } from './cache-helper';

// ORT Wasm 경로 설정 (public 폴더)
ort.env.wasm.wasmPaths = '/';

declare const cv: any;

export interface OcrResultLine {
  text: string;
  confidence: number;
  box: [number, number][]; // 4개 모서리 좌표 [x, y]
}

export class OcrRunner {
  private detSession: ort.InferenceSession | null = null;
  private recSession: ort.InferenceSession | null = null;
  private charDict: string[] = [];
  private isInitialized = false;

  /**
   * OCR 엔진에 필요한 모델 및 딕셔너리 로딩 (오프라인 캐싱 지원)
   */
  async init(
    onProgress?: (message: string) => void
  ): Promise<void> {
    if (this.isInitialized) return;

    try {
      if (onProgress) onProgress('Loading character dictionary...');
      const dictBuffer = await fetchWithCache('/models/ppocr_keys_v1.txt', onProgress);
      const textDecoder = new TextDecoder('utf-8');
      const dictText = textDecoder.decode(dictBuffer);
      
      // 줄바꿈으로 스플릿하여 문자 목록 로드 (공식 PaddleOCR 사전: 첫 글자는 빈 칸 혹은 특정 특수문자이며 CTC blank 대응)
      // 사전 파일의 라인 인덱스가 바로 인코딩 토큰 ID에 매핑됩니다.
      this.charDict = dictText.split(/\r?\n/);
      // CTC blank character 추가 (일반적으로 사전 크기 + 1)
      this.charDict.push(''); 

      if (onProgress) onProgress('Loading PP-OCRv6 Text Detection Model (9.8MB)...');
      const detBuffer = await fetchWithCache('/models/ch_PP-OCRv6_det_infer.onnx', onProgress);
      this.detSession = await ort.InferenceSession.create(detBuffer, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all'
      });

      if (onProgress) onProgress('Loading PP-OCRv6 Text Recognition Model (76.6MB)...');
      const recBuffer = await fetchWithCache('/models/ch_PP-OCRv6_rec_infer.onnx', onProgress);
      this.recSession = await ort.InferenceSession.create(recBuffer, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all'
      });

      this.isInitialized = true;
      if (onProgress) onProgress('OCR Engine ready!');
    } catch (err: any) {
      console.error('Failed to initialize OCR Runner:', err);
      throw new Error(`OCR initialization failed: ${err.message}`);
    }
  }

  /**
   * 입력 캔버스의 이미지를 분석하여 OCR 인식 결과 목록을 반환
   */
  async run(canvas: HTMLCanvasElement): Promise<OcrResultLine[]> {
    if (!this.isInitialized || !this.detSession || !this.recSession) {
      throw new Error('OCR Runner is not initialized');
    }

    // 1. Text Detection (DBNet) 전처리 및 실행
    const detWidth = 960;
    const detHeight = 960;
    const { tensor: detInputTensor, scaleX, scaleY } = this.preprocessDet(canvas, detWidth, detHeight);

    console.log('[OCR Det] Running detection model...');
    const detOutputs = await this.detSession.run({ x: detInputTensor });
    const detOutputName = this.detSession.outputNames[0]!;
    const detOutputTensor = detOutputs[detOutputName]!;
    
    // 2. Detection 후처리 (바운딩 박스 윤곽선 찾기)
    const boxes = this.postprocessDet(
      detOutputTensor.data as Float32Array,
      detWidth,
      detHeight,
      canvas.width,
      canvas.height,
      scaleX,
      scaleY
    );

    console.log(`[OCR Det] Found ${boxes.length} text regions.`);

    // 3. Text Recognition (SVTR) 개별 영역 크롭 및 판독
    const results: OcrResultLine[] = [];
    
    // OpenCV.js를 활용하여 이미지 크롭 및 전처리
    const srcMat = cv.imread(canvas);

    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i]!;
      
      // 각 바운딩 박스 영역에 맞춰 투사 변환 또는 회전 왜곡 보정 크롭 적용
      const croppedMat = this.cropTextRegion(srcMat, box);
      if (!croppedMat || croppedMat.cols === 0 || croppedMat.rows === 0) {
        if (croppedMat) croppedMat.delete();
        continue;
      }

      // Recognition 모델 전처리: [1, 3, 48, W] (높이 48px 고정, 비율 유지 너비)
      const recWidth = Math.max(80, Math.min(320, Math.round((croppedMat.cols * 48) / croppedMat.rows)));
      const recInputTensor = this.preprocessRec(croppedMat, recWidth, 48);
      croppedMat.delete();

      // Rec 추론
      const recOutputs = await this.recSession.run({ x: recInputTensor });
      const recOutputName = this.recSession.outputNames[0]!;
      const recOutputTensor = recOutputs[recOutputName]!;

      // CTC Decoder (Greedy Decoding) 적용하여 텍스트 복원
      const { text, confidence } = this.ctcDecode(
        recOutputTensor.data as Float32Array,
        recOutputTensor.dims as number[]
      );

      if (text.trim().length > 0 && confidence > 0.3) {
        results.push({
          text,
          confidence,
          box
        });
      }
    }

    srcMat.delete();

    // 영수증이나 신분증 분석을 위해 텍스트 상자 위치 기준(위에서 아래, 좌에서 우) 정렬
    results.sort((a, b) => {
      const cyA = (a.box[0]![1] + a.box[2]![1]) / 2;
      const cyB = (b.box[0]![1] + b.box[2]![1]) / 2;
      if (Math.abs(cyA - cyB) < 15) {
        // 같은 라인으로 판단될 때 좌측 정렬
        return a.box[0]![0] - b.box[0]![0];
      }
      return cyA - cyB;
    });

    return results;
  }

  /**
   * Detection 입력 전처리: 960x960 이미지 크기 정규화 및 [1, 3, 960, 960] 텐서 생성
   */
  private preprocessDet(canvas: HTMLCanvasElement, targetW: number, targetH: number) {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = targetW;
    tempCanvas.height = targetH;
    const ctx = tempCanvas.getContext('2d')!;
    ctx.drawImage(canvas, 0, 0, targetW, targetH);

    const imgData = ctx.getImageData(0, 0, targetW, targetH);
    const data = imgData.data;

    // NCHW format float32 array
    const floatData = new Float32Array(1 * 3 * targetH * targetW);

    // Image normalization parameters (PaddleOCR standard: Mean [0.485, 0.456, 0.406], Std [0.229, 0.224, 0.225])
    const mean = [0.485, 0.456, 0.406];
    const std = [0.229, 0.224, 0.225];

    const size = targetW * targetH;
    for (let i = 0; i < size; i++) {
      const r = data[i * 4]! / 255.0;
      const g = data[i * 4 + 1]! / 255.0;
      const b = data[i * 4 + 2]! / 255.0;

      floatData[i] = (r - mean[0]!) / std[0]!;                 // R channel
      floatData[size + i] = (g - mean[1]!) / std[1]!;          // G channel
      floatData[2 * size + i] = (b - mean[2]!) / std[2]!;      // B channel
    }

    const tensor = new ort.Tensor('float32', floatData, [1, 3, targetH, targetW]);
    return {
      tensor,
      scaleX: canvas.width / targetW,
      scaleY: canvas.height / targetH
    };
  }

  /**
   * Detection 모델 출력인 960x960 Probability Map에서 Contours를 찾아 다각형 바운딩 박스를 복원
   */
  private postprocessDet(
    predData: Float32Array,
    predW: number,
    predH: number,
    origW: number,
    origH: number,
    scaleX: number,
    scaleY: number
  ): [number, number][][] {
    // 1. 임계값(0.3) 적용하여 8비트 마스크 이미지 생성
    const size = predW * predH;
    const u8Data = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
      u8Data[i] = predData[i]! > 0.3 ? 255 : 0;
    }

    // OpenCV.js를 사용한 이진 맵 컨투어 검출
    const mat = cv.matFromArray(predH, predW, cv.CV_8UC1, u8Data);
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();

    cv.findContours(mat, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

    const boxes: [number, number][][] = [];

    for (let i = 0; i < contours.size(); ++i) {
      const cnt = contours.get(i);
      const area = cv.contourArea(cnt);
      if (area < 20) {
        // 너무 작은 노이즈 영역 제거
        continue;
      }

      // 다각형 근사화 및 최소 면적 사각형 구하기
      const rect = cv.minAreaRect(cnt);
      const vertices = cv.RotatedRect.points(rect);

      // 모서리 4개 도출
      const box: [number, number][] = [];
      for (let j = 0; j < 4; j++) {
        const pt = vertices[j]!;
        // 원본 이미지 크기 비율로 스케일 복원
        const origX = Math.max(0, Math.min(origW - 1, pt.x * scaleX));
        const origY = Math.max(0, Math.min(origH - 1, pt.y * scaleY));
        box.push([origX, origY]);
      }
      
      // 시계 방향 정렬
      boxes.push(this.sortBox(box));
    }

    mat.delete();
    contours.delete();
    hierarchy.delete();

    return boxes;
  }

  /**
   * 바운딩 박스를 시계방향 순서(좌상, 우상, 우하, 좌하)로 정렬
   */
  private sortBox(box: [number, number][]): [number, number][] {
    const cx = box.reduce((acc, p) => acc + p[0], 0) / 4;
    const cy = box.reduce((acc, p) => acc + p[1], 0) / 4;
    return box.slice().sort((a, b) => {
      const angleA = Math.atan2(a[1] - cy, a[0] - cx);
      const angleB = Math.atan2(b[1] - cy, b[0] - cx);
      return angleA - angleB;
    });
  }

  /**
   * 원본 Mat 이미지로부터 4개 모서리 정보를 기반으로 비스듬히 누운 텍스트 패치를 수평으로 크롭
   */
  private cropTextRegion(srcMat: any, box: [number, number][]): any {
    const pts = box;
    const widthA = Math.sqrt(Math.pow(pts[2]![0] - pts[3]![0], 2) + Math.pow(pts[2]![1] - pts[3]![1], 2));
    const widthB = Math.sqrt(Math.pow(pts[1]![0] - pts[0]![0], 2) + Math.pow(pts[1]![1] - pts[0]![1], 2));
    const maxWidth = Math.max(widthA, widthB);

    const heightA = Math.sqrt(Math.pow(pts[1]![0] - pts[2]![0], 2) + Math.pow(pts[1]![1] - pts[2]![1], 2));
    const heightB = Math.sqrt(Math.pow(pts[0]![0] - pts[3]![0], 2) + Math.pow(pts[0]![1] - pts[3]![1], 2));
    const maxHeight = Math.max(heightA, heightB);

    const width = Math.round(maxWidth);
    const height = Math.round(maxHeight);

    if (width <= 5 || height <= 5) return null;

    const dstMat = new cv.Mat();
    const dsize = new cv.Size(width, height);

    const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
      pts[0]![0], pts[0]![1],
      pts[1]![0], pts[1]![1],
      pts[2]![0], pts[2]![1],
      pts[3]![0], pts[3]![1]
    ]);

    const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
      0, 0,
      width - 1, 0,
      width - 1, height - 1,
      0, height - 1
    ]);

    const M = cv.getPerspectiveTransform(srcTri, dstTri);
    cv.warpPerspective(srcMat, dstMat, M, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());

    srcTri.delete();
    dstTri.delete();
    M.delete();

    // 텍스트 인식을 위해 세로 방향 텍스트일 때 회전 처리 방어코드 (보통 가로 텍스트 위주)
    if (height > width * 1.5) {
      const rotated = new cv.Mat();
      cv.rotate(dstMat, rotated, cv.ROTATE_90_CLOCKWISE);
      dstMat.delete();
      return rotated;
    }

    return dstMat;
  }

  /**
   * Recognition 입력 전처리: 크롭된 Mat 이미지 [H=48, W] 리사이즈 후 정규화 및 [1, 3, 48, W] 텐서 생성
   */
  private preprocessRec(croppedMat: any, targetW: number, targetH: number): ort.Tensor {
    const resized = new cv.Mat();
    const dsize = new cv.Size(targetW, targetH);
    cv.resize(croppedMat, resized, dsize, 0, 0, cv.INTER_LINEAR);

    // RGB 변환
    const rgb = new cv.Mat();
    cv.cvtColor(resized, rgb, cv.COLOR_RGBA2RGB);

    const size = targetW * targetH;
    const floatData = new Float32Array(1 * 3 * targetH * targetW);

    // Normalization parameters (Mean 0.5, Std 0.5)
    // PaddleOCR Rec standard: normalized to [-1.0, 1.0] -> (x / 255.0 - 0.5) / 0.5
    for (let i = 0; i < size; i++) {
      const idx = i * 3;
      const r = rgb.data[idx]! / 255.0;
      const g = rgb.data[idx + 1]! / 255.0;
      const b = rgb.data[idx + 2]! / 255.0;

      floatData[i] = (r - 0.5) / 0.5;
      floatData[size + i] = (g - 0.5) / 0.5;
      floatData[2 * size + i] = (b - 0.5) / 0.5;
    }

    resized.delete();
    rgb.delete();

    return new ort.Tensor('float32', floatData, [1, 3, targetH, targetW]);
  }

  /**
   * CTC 디코딩: 인공지능 출력 텐서에서 중복 및 Blank를 제거하고 텍스트 문자와 정확도를 디코딩
   */
  private ctcDecode(data: Float32Array, dims: number[]): { text: string; confidence: number } {
    // dims shape: [1, seqLen, numClasses] (e.g. [1, 40, 6625])
    const seqLen = dims[1]!;
    const numClasses = dims[2]!;

    let text = '';
    let totalScore = 0;
    let ignoredCharsCount = 0;
    let lastIdx = -1;

    for (let t = 0; t < seqLen; t++) {
      const startIdx = t * numClasses;
      
      // 최댓값(ArgMax)과 Softmax 근사 확률 추출
      let maxVal = -Infinity;
      let maxIdx = -1;
      
      for (let c = 0; c < numClasses; c++) {
        const val = data[startIdx + c]!;
        if (val > maxVal) {
          maxVal = val;
          maxIdx = c;
        }
      }

      // Softmax 확률 근사화 (CTC 스코어 보정)
      let sum = 0;
      for (let c = 0; c < numClasses; c++) {
        sum += Math.exp(data[startIdx + c]! - maxVal);
      }
      const prob = 1.0 / sum; // softmax max probability

      // CTC 규칙: Blank index는 마지막 인덱스이거나 사전 범위를 넘어선 인덱스
      const isBlank = maxIdx === numClasses - 1 || maxIdx >= this.charDict.length;

      if (!isBlank && maxIdx !== lastIdx) {
        const char = this.charDict[maxIdx]!;
        text += char;
        totalScore += prob;
      } else if (isBlank) {
        ignoredCharsCount++;
      }
      lastIdx = maxIdx;
    }

    const decodedLen = text.length;
    const confidence = decodedLen > 0 ? totalScore / decodedLen : 0;

    return {
      text,
      confidence
    };
  }
}
