import * as ort from 'onnxruntime-web';
import { fetchWithCache } from './cache-helper';

ort.env.wasm.wasmPaths = '/';

declare const cv: any;

export interface FaceDetectionResult {
  box: [number, number, number, number]; // [x1, y1, x2, y2]
  score: number;
}

export class FaceRunner {
  private detSession: ort.InferenceSession | null = null;
  private embedSession: ort.InferenceSession | null = null;
  private isInitialized = false;

  /**
   * 얼굴 검출 및 특징 추출 모델 세션 초기화 (오프라인 캐싱 지원)
   */
  async init(
    onProgress?: (message: string) => void
  ): Promise<void> {
    if (this.isInitialized) return;

    try {
      if (onProgress) onProgress('Loading InsightFace SCRFD Detection Model (2.4MB)...');
      const detBuffer = await fetchWithCache('/models/det_500m.onnx', onProgress);
      this.detSession = await ort.InferenceSession.create(detBuffer, {
        executionProviders: ['wasm']
      });

      if (onProgress) onProgress('Loading InsightFace MobileFaceNet Embedding Model (13MB)...');
      const embedBuffer = await fetchWithCache('/models/w600k_mbf.onnx', onProgress);
      this.embedSession = await ort.InferenceSession.create(embedBuffer, {
        executionProviders: ['wasm']
      });

      this.isInitialized = true;
      if (onProgress) onProgress('InsightFace models ready!');
    } catch (err: any) {
      console.error('Failed to initialize Face Runner:', err);
      throw new Error(`Face models initialization failed: ${err.message}`);
    }
  }

  /**
   * 두 이미지 캔버스에 있는 인물의 얼굴 임베딩 벡터를 추출하여 코사인 유사도 반환
   */
  async compareFaces(canvasA: HTMLCanvasElement, canvasB: HTMLCanvasElement): Promise<{
    similarity: number;
    match: boolean;
  }> {
    if (!this.isInitialized || !this.embedSession) {
      throw new Error('Face Runner is not initialized');
    }

    console.log('[Face Verify] Extracting embedding for Image A...');
    const embeddingA = await this.getFaceEmbedding(canvasA);

    console.log('[Face Verify] Extracting embedding for Image B...');
    const embeddingB = await this.getFaceEmbedding(canvasB);

    if (!embeddingA || !embeddingB) {
      throw new Error('Failed to detect face or extract embedding from one of the images.');
    }

    const similarity = this.cosineSimilarity(embeddingA, embeddingB);
    // 임계치 정책: MobileFaceNet의 경우 코사인 유사도 기준 대략 0.40 ~ 0.50 이상이면 동일인으로 판별
    const match = similarity > 0.45;

    return {
      similarity,
      match
    };
  }

  /**
   * 단일 이미지 캔버스에서 얼굴을 검출하고 512차원 임베딩 벡터 추출
   */
  private async getFaceEmbedding(canvas: HTMLCanvasElement): Promise<Float32Array | null> {
    if (!this.detSession || !this.embedSession) return null;

    // 1. 얼굴 검출 (SCRFD)
    // 입력 규격: [1, 3, 640, 640]
    const detSize = 640;
    const { tensor: detInput, scaleX, scaleY } = this.preprocessDet(canvas, detSize, detSize);

    const detOutputs = await this.detSession.run({ input: detInput });
    
    // SCRFD의 출력 텐서 파싱 (간소화 버전)
    // 여러 스케일의 출력 중 가장 스코어가 큰 바운딩 박스를 얼굴로 추정
    const faceBox = this.postprocessDet(detOutputs, scaleX, scaleY);

    // 2. 얼굴 영역 크롭 및 정렬 (Align) 후 Embedding 추출
    const srcMat = cv.imread(canvas);
    let faceMat;

    if (faceBox) {
      // 검출된 얼굴 영역 크롭
      faceMat = this.cropFace(srcMat, faceBox);
    } else {
      // 검출 실패 시: 사용자가 중앙 가이드라인에 얼굴을 맞춰 찍었으므로, 중앙 60% 영역을 크롭하여 폴백 적용
      console.warn('[Face] Detection failed. Falling back to center crop.');
      faceMat = this.cropCenter(srcMat);
    }

    srcMat.delete();

    if (!faceMat || faceMat.cols === 0 || faceMat.rows === 0) {
      if (faceMat) faceMat.delete();
      return null;
    }

    // Embedding 전처리: [1, 3, 112, 112], normalization (-127.5) / 128.0
    const embedInput = this.preprocessEmbed(faceMat, 112, 112);
    faceMat.delete();

    // 512차원 임베딩 추론
    const embedOutputs = await this.embedSession.run({ data: embedInput });
    const outputName = this.embedSession.outputNames[0]!;
    const embeddingTensor = embedOutputs[outputName]!;

    return embeddingTensor.data as Float32Array;
  }

  /**
   * SCRFD 얼굴 검출 전처리: [1, 3, 640, 640] 정규화
   */
  private preprocessDet(canvas: HTMLCanvasElement, targetW: number, targetH: number) {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = targetW;
    tempCanvas.height = targetH;
    const ctx = tempCanvas.getContext('2d')!;
    ctx.drawImage(canvas, 0, 0, targetW, targetH);

    const imgData = ctx.getImageData(0, 0, targetW, targetH);
    const data = imgData.data;

    const floatData = new Float32Array(1 * 3 * targetH * targetW);
    const size = targetW * targetH;

    // Normalization: (x - 127.5) / 128.0
    for (let i = 0; i < size; i++) {
      const r = data[i * 4]!;
      const g = data[i * 4 + 1]!;
      const b = data[i * 4 + 2]!;

      floatData[i] = (r - 127.5) / 128.0;
      floatData[size + i] = (g - 127.5) / 128.0;
      floatData[2 * size + i] = (b - 127.5) / 128.0;
    }

    const tensor = new ort.Tensor('float32', floatData, [1, 3, targetH, targetW]);
    return {
      tensor,
      scaleX: canvas.width / targetW,
      scaleY: canvas.height / targetH
    };
  }

  /**
   * SCRFD 얼굴 검출 후처리: 가장 높은 스코어를 가진 얼굴 바운딩 박스 좌표 반환
   */
  private postprocessDet(
    outputs: Record<string, ort.Tensor>,
    scaleX: number,
    scaleY: number
  ): [number, number, number, number] | null {
    // det_500m 모델은 보통 복수의 스케일 피처 맵을 가집니다.
    // 출력 이름 중 점수(score)를 담은 텐서들을 탐색합니다.
    // 간소화 매커니즘: 출력 이름 중 점수 텐서를 확인해 가장 스코어가 높게 감출된 인덱스 추적
    let bestScore = -Infinity;
    let bestBox: [number, number, number, number] | null = null;

    try {
      // ONNX 모델 출력 노드 중 score 및 bbox 관련 텐서를 찾아냅니다.
      // SCRFD 모델 아웃풋의 특성상 score 출력 노드는 보통 크기가 작은 편(1차원/2차원 스코어 확률)입니다.
      // 가장 단순한 접근으로, 모델 출력 텐서들을 순회하며 최댓값 스코어 포인트 좌표를 바탕으로 640x640 격자 맵상의 얼굴을 역산합니다.
      const keys = Object.keys(outputs);
      
      let scoreTensor: ort.Tensor | null = null;
      let bboxTensor: ort.Tensor | null = null;

      // SCRFD 출력을 단순화하여, 점수가 0.5 이상 검출된 첫번째 바운딩 박스를 리턴하는 heuristic 처리
      for (const k of keys) {
        if (k.includes('score')) scoreTensor = outputs[k]!;
        if (k.includes('bbox')) bboxTensor = outputs[k]!;
      }

      if (scoreTensor && bboxTensor) {
        const scores = scoreTensor.data as Float32Array;
        const bboxes = bboxTensor.data as Float32Array;
        const totalPredictions = scores.length;

        for (let i = 0; i < totalPredictions; i++) {
          const score = scores[i]!;
          if (score > 0.5 && score > bestScore) {
            bestScore = score;
            const idx = i * 4;
            const x1 = bboxes[idx]! * scaleX;
            const y1 = bboxes[idx + 1]! * scaleY;
            const x2 = bboxes[idx + 2]! * scaleX;
            const y2 = bboxes[idx + 3]! * scaleY;
            bestBox = [x1, y1, x2, y2];
          }
        }
      }
    } catch (e) {
      console.warn('[Face Postprocess] Advanced parsing skipped, applying heuristic crop fallback.', e);
    }

    return bestBox;
  }

  /**
   * 얼굴 바운딩 박스를 기반으로 OpenCV.js 크롭
   */
  private cropFace(srcMat: any, box: [number, number, number, number]): any {
    const x1 = Math.max(0, Math.round(box[0]));
    const y1 = Math.max(0, Math.round(box[1]));
    const x2 = Math.min(srcMat.cols - 1, Math.round(box[2]));
    const y2 = Math.min(srcMat.rows - 1, Math.round(box[3]));

    const w = x2 - x1;
    const h = y2 - y1;

    if (w <= 0 || h <= 0) return null;

    const rect = new cv.Rect(x1, y1, w, h);
    return srcMat.roi(rect);
  }

  /**
   * 검출 실패 시 중앙 영역 크롭 (폴백)
   */
  private cropCenter(srcMat: any): any {
    const w = srcMat.cols;
    const h = srcMat.rows;
    
    // 중앙 60% 가로세로 크롭
    const cropW = Math.round(w * 0.6);
    const cropH = Math.round(h * 0.6);
    const x = Math.round((w - cropW) / 2);
    const y = Math.round((h - cropH) / 2);

    const rect = new cv.Rect(x, y, cropW, cropH);
    return srcMat.roi(rect);
  }

  /**
   * Embedding 모델 입력 전처리: [1, 3, 112, 112] normalization (-127.5) / 128.0
   */
  private preprocessEmbed(croppedMat: any, targetW: number, targetH: number): ort.Tensor {
    const resized = new cv.Mat();
    const dsize = new cv.Size(targetW, targetH);
    cv.resize(croppedMat, resized, dsize, 0, 0, cv.INTER_LINEAR);

    const rgb = new cv.Mat();
    cv.cvtColor(resized, rgb, cv.COLOR_RGBA2RGB);

    const size = targetW * targetH;
    const floatData = new Float32Array(1 * 3 * targetH * targetW);

    // InsightFace Embedding Normalization: (x - 127.5) / 128.0
    for (let i = 0; i < size; i++) {
      const idx = i * 3;
      const r = rgb.data[idx]!;
      const g = rgb.data[idx + 1]!;
      const b = rgb.data[idx + 2]!;

      floatData[i] = (r - 127.5) / 128.0;
      floatData[size + i] = (g - 127.5) / 128.0;
      floatData[2 * size + i] = (b - 127.5) / 128.0;
    }

    resized.delete();
    rgb.delete();

    return new ort.Tensor('float32', floatData, [1, 3, targetH, targetW]);
  }

  /**
   * 두 임베딩 벡터 간 코사인 유사도(Cosine Similarity) 연산
   */
  private cosineSimilarity(vecA: Float32Array, vecB: Float32Array): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      const a = vecA[i]!;
      const b = vecB[i]!;
      dotProduct += a * b;
      normA += a * a;
      normB += b * b;
    }

    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}
