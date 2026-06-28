import { useEffect, useState, useRef } from 'react';
import { CameraCapture } from './components/CameraCapture';
import { OcrRunner } from './lib/ocr-runner';
import type { OcrResultLine } from './lib/ocr-runner';
import { FaceRunner } from './lib/face-runner';
import { detectDocumentCorners, transformPerspective, isOpenCVReady } from './lib/opencv-helper';
import { supabase } from './lib/supabase';
import { ShieldCheck, Receipt, Cpu, Check, AlertTriangle, FileText, User, RefreshCw, Key, LogOut } from 'lucide-react';

// 캔버스를 Blob 이미지 파일로 변환하는 헬퍼 함수
const canvasToBlob = (canvas: HTMLCanvasElement): Promise<Blob> => {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
    }, 'image/jpeg', 0.8);
  });
};

export default function App() {
  // AI 엔진 인스턴스 (컴포넌트 리렌더링 시 재생성 방지)
  const ocrRunnerRef = useRef<OcrRunner>(new OcrRunner());
  const faceRunnerRef = useRef<FaceRunner>(new FaceRunner());

  // 상태 관리
  const [initStatus, setInitStatus] = useState<string>('OpenCV.js 및 AI 엔진 초기화 대기 중...');
  const [engineReady, setEngineReady] = useState(false);
  const [currentTab, setCurrentTab] = useState<'receipt' | 'kyc'>('receipt');
  
  // 카메라 촬영 모달 제어
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraMode, setCameraMode] = useState<'id' | 'selfie' | 'receipt'>('receipt');

  // 이미지 캔버스 보관
  const rawCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const warpedCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const selfieCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // 영수증 OCR 상태
  const [isProcessingOcr, setIsProcessingOcr] = useState(false);
  const [ocrLines, setOcrLines] = useState<OcrResultLine[]>([]);
  const [parsedAmount, setParsedAmount] = useState<string>('');
  const [parsedRefNo, setParsedRefNo] = useState<string>('');
  const [parsedDate, setParsedDate] = useState<string>('');

  // KYC 상태
  const [hasIdImage, setHasIdImage] = useState(false);
  const [isComparingFace, setIsComparingFace] = useState(false);
  const [faceSimilarity, setFaceSimilarity] = useState<number | null>(null);
  const [isFaceMatched, setIsFaceMatched] = useState<boolean | null>(null);

  // Supabase Auth 세션 관리
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [sessionUser, setSessionUser] = useState<any>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // 실시간 원장 동기화 상태 관리
  const [dbRechargeStatus, setDbRechargeStatus] = useState<string>('');
  const [isRecharging, setIsRecharging] = useState(false);
  const [dbKycStatus, setDbKycStatus] = useState<string>('');
  const [isSubmittingKyc, setIsSubmittingKyc] = useState(false);

  useEffect(() => {
    // 1. OpenCV.js 로딩 완료 확인 리스너 등록
    if (isOpenCVReady()) {
      initAiEngines();
    } else {
      const handleCvReady = () => {
        initAiEngines();
      };
      document.addEventListener('opencv-ready', handleCvReady);
      return () => {
        document.removeEventListener('opencv-ready', handleCvReady);
      };
    }
  }, []);

  useEffect(() => {
    // 2. Supabase Auth 로그인 세션 복구 및 리스너 등록
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSessionUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // ONNX Runtime Web AI 모델들 초기화
  const initAiEngines = async () => {
    try {
      setInitStatus('PaddleOCR 및 InsightFace 모델 불러오는 중...');
      await ocrRunnerRef.current.init((msg) => setInitStatus(msg));
      await faceRunnerRef.current.init((msg) => setInitStatus(msg));
      setEngineReady(true);
      setInitStatus('모든 추론 엔진이 정상 로딩되었습니다.');
    } catch (err: any) {
      console.error(err);
      setInitStatus(`초기화 실패: ${err.message}`);
    }
  };

  // 모바일 Supabase 로그인 처리
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      alert('성공적으로 연결되었습니다.');
    } catch (err: any) {
      alert(`로그인 실패: ${err.message}`);
    } finally {
      setIsLoggingIn(false);
    }
  };

  // 로그아웃 처리
  const handleLogout = async () => {
    await supabase.auth.signOut();
    alert('로그아웃되었습니다.');
  };

  // 카메라 캡처 결과 콜백
  const handleCameraCapture = (capturedCanvas: HTMLCanvasElement) => {
    setCameraOpen(false);

    if (cameraMode === 'receipt') {
      setOcrLines([]);
      setParsedAmount('');
      setParsedRefNo('');
      setParsedDate('');
      setDbRechargeStatus('');
      
      const rawCtx = rawCanvasRef.current?.getContext('2d');
      if (rawCanvasRef.current && rawCtx) {
        rawCanvasRef.current.width = capturedCanvas.width;
        rawCanvasRef.current.height = capturedCanvas.height;
        rawCtx.drawImage(capturedCanvas, 0, 0);
      }

      runPerspectiveCorrection();
    } 
    else if (cameraMode === 'id') {
      setFaceSimilarity(null);
      setIsFaceMatched(null);
      setDbKycStatus('');

      const idCtx = rawCanvasRef.current?.getContext('2d');
      if (rawCanvasRef.current && idCtx) {
        rawCanvasRef.current.width = capturedCanvas.width;
        rawCanvasRef.current.height = capturedCanvas.height;
        idCtx.drawImage(capturedCanvas, 0, 0);
        setHasIdImage(true);
      }
    } 
    else if (cameraMode === 'selfie') {
      const selfieCtx = selfieCanvasRef.current?.getContext('2d');
      if (selfieCanvasRef.current && selfieCtx) {
        selfieCanvasRef.current.width = capturedCanvas.width;
        selfieCanvasRef.current.height = capturedCanvas.height;
        selfieCtx.drawImage(capturedCanvas, 0, 0);
      }

      setTimeout(() => {
        runFaceVerification();
      }, 500);
    }
  };

  // OpenCV를 이용한 사각형 문서 검출 및 투사 왜곡 보정
  const runPerspectiveCorrection = () => {
    if (!rawCanvasRef.current || !warpedCanvasRef.current) return;

    const corners = detectDocumentCorners(rawCanvasRef.current);

    if (corners) {
      console.log('[OpenCV] 사각형 4점 모서리 검출 성공:', corners);
      const success = transformPerspective(rawCanvasRef.current, warpedCanvasRef.current, corners);
      if (success) {
        runOcrInference();
        return;
      }
    }

    console.warn('[OpenCV] 사각형 모서리 검출 실패. 원본 이미지를 그대로 OCR 처리합니다.');
    const dstCtx = warpedCanvasRef.current.getContext('2d')!;
    warpedCanvasRef.current.width = rawCanvasRef.current.width;
    warpedCanvasRef.current.height = rawCanvasRef.current.height;
    dstCtx.drawImage(rawCanvasRef.current, 0, 0);

    runOcrInference();
  };

  // ONNX Runtime Web 기반 OCR 판독 및 데이터 정규표현식 후처리
  const runOcrInference = async () => {
    if (!warpedCanvasRef.current) return;

    setIsProcessingOcr(true);
    try {
      const results = await ocrRunnerRef.current.run(warpedCanvasRef.current);
      setOcrLines(results);

      const combinedText = results.map(r => r.text).join('\n');
      console.log('[OCR Full Text]:', combinedText);

      parseReceiptMetadata(combinedText);
    } catch (err: any) {
      alert(`OCR 오류: ${err.message}`);
    } finally {
      setIsProcessingOcr(false);
    }
  };

  // 영수증 메타데이터 후처리 추출 필터 (날짜, 참조번호, 금액)
  const parseReceiptMetadata = (text: string) => {
    const cleanedText = text.replace(/[\s-]/g, '');
    const refMatch = cleanedText.match(/\b\d{11,13}\b/);
    if (refMatch) {
      setParsedRefNo(refMatch[0]!);
    } else {
      const lines = text.split('\n');
      for (const line of lines) {
        const match = line.match(/(?:ref|trans|reference)\s*:?\s*([0-9\s-]{11,17})/i);
        if (match) {
          setParsedRefNo(match[1]!.replace(/[\s-]/g, ''));
          break;
        }
      }
    }

    const amountRegex = /(?:₱|PHP|pesos)?\s*([0-9,]+\.[0-9]{2})\s*(?:PHP|Pesos|₱)?/i;
    const amountMatch = text.match(amountRegex);
    if (amountMatch) {
      setParsedAmount(amountMatch[1]!.replace(/,/g, ''));
    } else {
      const floatMatches = text.match(/\b\d+,\d{3}\.\d{2}\b|\b\d+\.\d{2}\b/g);
      if (floatMatches) {
        const amounts = floatMatches.map(val => parseFloat(val.replace(/,/g, '')));
        const maxVal = Math.max(...amounts);
        if (maxVal > 0) setParsedAmount(maxVal.toFixed(2));
      }
    }

    const dateRegex = /\b(\d{4}[-/.]\d{2}[-/.]\d{2})|\b(\d{2}[-/.]\d{2}[-/.]\d{4})\b/;
    const dateMatch = text.match(dateRegex);
    if (dateMatch) {
      setParsedDate(dateMatch[0]!);
    } else {
      const engDateMatch = text.match(/(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}/i);
      if (engDateMatch) {
        setParsedDate(engDateMatch[0]!);
      }
    }
  };

  // 실서버 Supabase 원장 RPC 크레딧 충전 요청 수행
  const handleDbRecharge = async () => {
    if (!parsedAmount || !parsedRefNo) {
      alert('판독된 영수증 금액과 승인 참조번호가 존재해야 승인 요청이 가능합니다.');
      return;
    }

    setIsRecharging(true);
    setDbRechargeStatus('원장 중복 방지 제약 검증 및 자동 크레딧 충전 요청 중...');
    try {
      const targetAmount = parseFloat(parsedAmount);

      const { data, error } = await supabase.rpc('complete_gcash_deposit', {
        p_received_amount: targetAmount,
        p_ref_no: parsedRefNo
      });

      if (error) throw error;

      if (data && !data.success) {
        setDbRechargeStatus(`승인 거절: ${data.error || '이미 승인되었거나 만료된 요청입니다.'}`);
      } else {
        setDbRechargeStatus(`충전 매칭 성공! 크레딧 적립이 완수되었습니다.`);
        alert(`원장 충전이 성공적으로 반영되었습니다. 적립액: ${data.credited_amount} Credits`);
      }
    } catch (err: any) {
      console.error(err);
      setDbRechargeStatus(`충전 처리 오류: ${err.message}`);
    } finally {
      setIsRecharging(false);
    }
  };

  // InsightFace를 이용한 안면 일치율 계산
  const runFaceVerification = async () => {
    if (!rawCanvasRef.current || !selfieCanvasRef.current) return;

    setIsComparingFace(true);
    setFaceSimilarity(null);
    setIsFaceMatched(null);

    try {
      const { similarity, match } = await faceRunnerRef.current.compareFaces(
        rawCanvasRef.current,
        selfieCanvasRef.current
      );
      setFaceSimilarity(similarity);
      setIsFaceMatched(match);
    } catch (err: any) {
      alert(`얼굴 대조 오류: ${err.message}`);
    } finally {
      setIsComparingFace(false);
    }
  };

  // 실서버 Supabase 스토리지 이미지 업로드 및 profiles 테이블 KYC 승인대기 등록 연동
  const handleKycSubmit = async () => {
    if (!rawCanvasRef.current || !selfieCanvasRef.current || !sessionUser) {
      alert('신분증 촬영 이미지, 셀카 이미지 및 본인 연결 계정 로그인이 유효해야 제출이 가능합니다.');
      return;
    }

    setIsSubmittingKyc(true);
    setDbKycStatus('신분증 및 얼굴 셀카 원본 이미지 클라우드 보안 업로드 중...');
    try {
      const idBlob = await canvasToBlob(rawCanvasRef.current);
      const selfieBlob = await canvasToBlob(selfieCanvasRef.current);

      const idPath = `${sessionUser.id}/id_front_${Date.now()}.jpg`;
      const selfiePath = `${sessionUser.id}/selfie_${Date.now()}.jpg`;

      // 1. Supabase Storage 'user-ids' 버킷에 이미지 업로드
      const { error: idUploadError } = await supabase.storage
        .from('user-ids')
        .upload(idPath, idBlob, { contentType: 'image/jpeg', upsert: true });
      if (idUploadError) throw idUploadError;

      const { error: selfieUploadError } = await supabase.storage
        .from('user-ids')
        .upload(selfiePath, selfieBlob, { contentType: 'image/jpeg', upsert: true });
      if (selfieUploadError) throw selfieUploadError;

      // 2. Profiles DB 테이블의 KYC 업로드 주소 정보와 승인 대기 상태(pending) 업데이트
      setDbKycStatus('데이터베이스 프로필의 KYC 검토 승인 대기(pending) 상태 업데이트 중...');
      const { error: dbError } = await supabase
        .from('profiles')
        .update({
          id_front_url: idPath,
          selfie_url: selfiePath,
          verification_status: 'pending',
          updated_at: new Date().toISOString()
        })
        .eq('id', sessionUser.id);

      if (dbError) throw dbError;

      setDbKycStatus('KYC 안면 매칭 정보 및 증빙 서류가 최종 승인 대기 상태로 인계 등록되었습니다.');
      alert('KYC 인증 자료 제출 완료!');
    } catch (err: any) {
      console.error(err);
      setDbKycStatus(`제출 실패: ${err.message}`);
    } finally {
      setIsSubmittingKyc(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      {/* 글로벌 헤더 */}
      <header className="border-b border-slate-900 bg-slate-900/50 backdrop-blur-md sticky top-0 z-40 p-4">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center font-black shadow-lg shadow-blue-500/20">
              M
            </div>
            <div>
              <h1 className="text-base font-black tracking-tight leading-none">MUtang OCR Portal</h1>
              <span className="text-[10px] text-slate-500 font-medium">로컬 브라우저 보안 독립 추론</span>
            </div>
          </div>
          <div className="flex items-center gap-1 bg-slate-900 rounded-full p-1 border border-slate-800">
            <button
              onClick={() => setCurrentTab('receipt')}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${currentTab === 'receipt' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
            >
              영수증 OCR
            </button>
            <button
              onClick={() => setCurrentTab('kyc')}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${currentTab === 'kyc' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
            >
              KYC 얼굴대조
            </button>
          </div>
        </div>
      </header>

      {/* 엔진 로딩 배너 */}
      {!engineReady && (
        <div className="bg-blue-950/40 border-b border-blue-900/50 p-4">
          <div className="max-w-md mx-auto flex items-start gap-3">
            <Cpu className="w-5 h-5 text-blue-400 shrink-0 mt-0.5 animate-pulse" />
            <div className="space-y-1">
              <p className="text-xs font-bold text-blue-200">로컬 AI 추론 엔진 준비 중</p>
              <p className="text-[11px] text-blue-400 font-medium leading-normal animate-pulse">
                {initStatus}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 모바일 세션 계정 로그인 연결창 */}
      <div className="bg-slate-900/40 border-b border-slate-900 p-4">
        <div className="max-w-md mx-auto">
          {sessionUser ? (
            <div className="flex items-center justify-between bg-slate-950/80 p-3 rounded-2xl border border-slate-900 text-xs">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-green-500" />
                <span className="text-slate-400">계정 연결됨:</span>
                <span className="font-bold text-green-400">{sessionUser.email}</span>
              </div>
              <button
                onClick={handleLogout}
                className="flex items-center gap-1 text-red-400 hover:text-red-300 font-bold"
              >
                <LogOut className="w-3.5 h-3.5" /> 로그아웃
              </button>
            </div>
          ) : (
            <form onSubmit={handleLogin} className="flex gap-2 bg-slate-950/80 p-3 rounded-2xl border border-slate-900 text-xs">
              <div className="flex-1 flex gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="본인 이메일"
                  required
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 outline-none focus:border-blue-500 text-[11px]"
                />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="비밀번호"
                  required
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 outline-none focus:border-blue-500 text-[11px]"
                />
              </div>
              <button
                type="submit"
                disabled={isLoggingIn}
                className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl px-3.5 py-1.5 font-bold transition flex items-center gap-1"
              >
                <Key className="w-3.5 h-3.5" /> 연결
              </button>
            </form>
          )}
        </div>
      </div>

      {/* 메인 뷰포트 */}
      <main className="flex-1 max-w-md w-full mx-auto p-4 space-y-6 pb-24">
        {currentTab === 'receipt' ? (
          // [영수증 OCR 탭]
          <div className="space-y-6">
            <div className="bg-slate-900/60 border border-slate-900 rounded-3xl p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-blue-500" />
                <h3 className="font-black text-sm">입금 영수증 자동 판독</h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed font-medium">
                안드로이드 SMS 알림이 유실되거나 지연될 시, GCash 입금 확인증 이미지를 직접 업로드하면 ONNX Runtime Web을 통해 브라우저 내부에서 즉시 판독 및 승인이 이뤄집니다.
              </p>

              <button
                onClick={() => {
                  setCameraMode('receipt');
                  setCameraOpen(true);
                }}
                disabled={!engineReady}
                className="w-full h-14 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-800 text-white rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <span>영수증 카메라 촬영</span>
              </button>
            </div>

            {/* 이미지 미리보기 캔버스 */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider pl-2">원본 촬영본</span>
                <div className="aspect-[1.58/1] rounded-2xl overflow-hidden border border-slate-900 bg-slate-950 flex items-center justify-center">
                  <canvas ref={rawCanvasRef} className="w-full h-full object-contain" />
                </div>
              </div>
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider pl-2">왜곡 보정본 (OpenCV.js)</span>
                <div className="aspect-[1.58/1] rounded-2xl overflow-hidden border border-slate-900 bg-slate-950 flex items-center justify-center">
                  <canvas ref={warpedCanvasRef} className="w-full h-full object-contain" />
                </div>
              </div>
            </div>

            {/* OCR 처리 상황 및 분석 결과 카드 */}
            {isProcessingOcr && (
              <div className="p-6 bg-slate-900/50 border border-slate-900 rounded-3xl text-center space-y-3">
                <div className="w-8 h-8 rounded-full border-2 border-slate-800 border-t-blue-500 animate-spin mx-auto"></div>
                <p className="text-xs font-bold text-blue-400">PP-OCRv6 로컬 텍스트 해독 중...</p>
              </div>
            )}

            {!isProcessingOcr && (parsedAmount || parsedRefNo) && (
              <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-xl">
                <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
                  <FileText className="w-4 h-4 text-blue-500" />
                  <h4 className="font-bold text-xs">AI 추출 정보 (정규식 필터링)</h4>
                </div>

                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="bg-slate-950 p-3 rounded-2xl space-y-1">
                    <span className="text-[9px] font-bold text-slate-500">인식 금액</span>
                    <p className="text-sm font-black text-blue-400">
                      {parsedAmount ? `₱${parseFloat(parsedAmount).toFixed(2)}` : '미검출'}
                    </p>
                  </div>
                  <div className="bg-slate-950 p-3 rounded-2xl space-y-1">
                    <span className="text-[9px] font-bold text-slate-500">참조번호</span>
                    <p className="text-sm font-black text-blue-400 font-mono">
                      {parsedRefNo || '미검출'}
                    </p>
                  </div>
                  <div className="bg-slate-950 p-3 rounded-2xl space-y-1">
                    <span className="text-[9px] font-bold text-slate-500">거래 날짜</span>
                    <p className="text-xs font-black text-blue-400">
                      {parsedDate || '미검출'}
                    </p>
                  </div>
                </div>

                {/* 원장 반영 버튼 (Supabase RPC 연결) */}
                <div className="pt-2">
                  <button
                    onClick={handleDbRecharge}
                    disabled={isRecharging}
                    className="w-full h-12 bg-green-600 hover:bg-green-700 disabled:bg-slate-800 text-white rounded-2xl font-black text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {isRecharging ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>입금 처리 중...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        <span>확인증 실서버 원장 충전 승인</span>
                      </>
                    )}
                  </button>

                  {dbRechargeStatus && (
                    <p className="text-[10px] text-center font-bold text-slate-400 mt-2.5 leading-normal">
                      {dbRechargeStatus}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* 전체 판독 라인 리스트 */}
            {ocrLines.length > 0 && (
              <div className="bg-slate-900/40 border border-slate-900 rounded-3xl p-5 space-y-3">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block border-b border-slate-800/80 pb-2">
                  판독 텍스트 전체 라인 ({ocrLines.length}개)
                </span>
                <div className="max-h-60 overflow-y-auto space-y-1.5 pr-2 font-mono text-[10px] text-slate-400">
                  {ocrLines.map((line, idx) => (
                    <div key={idx} className="flex justify-between items-center bg-slate-950/60 p-2 rounded-xl border border-slate-900/50">
                      <span>{line.text}</span>
                      <span className="text-slate-600 font-bold shrink-0">{(line.confidence * 100).toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          // [KYC 본인 얼굴 대조 탭]
          <div className="space-y-6">
            <div className="bg-slate-900/60 border border-slate-900 rounded-3xl p-5 space-y-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-blue-500" />
                <h3 className="font-black text-sm">실시간 KYC 얼굴 대조</h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed font-medium">
                신분증 상의 얼굴 사진과 실제 촬영한 셀피 사진을 InsightFace ONNX 인공지능을 통해 1대1 대조하여 동일인 여부를 실시간으로 분석합니다.
              </p>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => {
                    setCameraMode('id');
                    setCameraOpen(true);
                  }}
                  disabled={!engineReady}
                  className="h-14 bg-blue-600/10 hover:bg-blue-600/20 border border-blue-500/20 text-blue-400 rounded-2xl font-black text-xs flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <span>1단계: 신분증 촬영</span>
                </button>
                <button
                  onClick={() => {
                    setCameraMode('selfie');
                    setCameraOpen(true);
                  }}
                  disabled={!engineReady || !hasIdImage}
                  className="h-14 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-800 text-white rounded-2xl font-black text-xs flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <span>2단계: 셀카 촬영</span>
                </button>
              </div>
            </div>

            {/* 신분증 및 셀카 이미지 뷰포트 */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider pl-2 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-blue-400" /> 신분증 얼굴 이미지
                </span>
                <div className="aspect-[1.12/1] rounded-2xl overflow-hidden border border-slate-900 bg-slate-950 flex items-center justify-center">
                  <canvas ref={rawCanvasRef} className="w-full h-full object-contain" />
                </div>
              </div>
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider pl-2 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-blue-400" /> 본인 실물 셀카
                </span>
                <div className="aspect-[1.12/1] rounded-2xl overflow-hidden border border-slate-900 bg-slate-950 flex items-center justify-center">
                  <canvas ref={selfieCanvasRef} className="w-full h-full object-contain" />
                </div>
              </div>
            </div>

            {/* 안면 대조 진행 중 */}
            {isComparingFace && (
              <div className="p-6 bg-slate-900/50 border border-slate-900 rounded-3xl text-center space-y-3">
                <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mx-auto" />
                <p className="text-xs font-bold text-blue-400">InsightFace 안면 대조 판독 중...</p>
              </div>
            )}

            {/* 분석 일치율 결과 카드 및 DB KYC 제출 버튼 */}
            {!isComparingFace && faceSimilarity !== null && (
              <div className="space-y-4">
                <div className={`p-5 rounded-3xl border text-center space-y-3 transition-all shadow-xl ${isFaceMatched ? 'bg-green-950/20 border-green-500/30 text-green-300' : 'bg-red-950/20 border-red-500/30 text-red-300'}`}>
                  {isFaceMatched ? (
                    <div className="flex flex-col items-center gap-1">
                      <Check className="w-10 h-10 text-green-500 bg-green-500/10 p-2 rounded-full border border-green-500/20 mb-2" />
                      <span className="text-xs font-black uppercase tracking-wider text-green-500">인증 일치 성공</span>
                      <p className="text-base font-black mt-1">신분증과 셀피가 일치합니다.</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-1">
                      <AlertTriangle className="w-10 h-10 text-red-500 bg-red-500/10 p-2 rounded-full border border-red-500/20 mb-2" />
                      <span className="text-xs font-black uppercase tracking-wider text-red-500">인증 일치 실패</span>
                      <p className="text-base font-black mt-1">동일 인물이 아닐 가능성이 높습니다.</p>
                    </div>
                  )}
                  
                  <div className="bg-slate-950/80 p-3 rounded-2xl w-32 mx-auto border border-slate-900">
                    <span className="text-[9px] font-bold text-slate-500 block">매칭 신뢰도</span>
                    <span className="text-lg font-black font-mono">{(faceSimilarity * 100).toFixed(1)}%</span>
                  </div>
                </div>

                {/* KYC 제출 버튼 */}
                <div className="bg-slate-900/60 border border-slate-900 rounded-3xl p-5 space-y-3">
                  <button
                    onClick={handleKycSubmit}
                    disabled={isSubmittingKyc || !sessionUser}
                    className="w-full h-14 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-800 text-white rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition cursor-pointer"
                  >
                    {isSubmittingKyc ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>KYC 자료 업로드 등록 중...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        <span>KYC 증빙 서류 최종 업로드 완료</span>
                      </>
                    )}
                  </button>
                  {!sessionUser && (
                    <p className="text-[10px] text-red-400 text-center font-bold">
                      KYC 증빙 서류를 업로드하려면 상단 로그인 영역에서 이메일 계정을 먼저 연결해야 합니다.
                    </p>
                  )}
                  {dbKycStatus && (
                    <p className="text-[10px] text-center font-bold text-slate-400 mt-2 leading-normal">
                      {dbKycStatus}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* 카메라 촬영 모달 */}
      {cameraOpen && (
        <CameraCapture
          mode={cameraMode}
          onCapture={handleCameraCapture}
          onClose={() => setCameraOpen(false)}
        />
      )}
    </div>
  );
}
