import React, { useEffect, useRef, useState } from 'react';
import { Camera, RefreshCw, X, AlertCircle } from 'lucide-react';

interface CameraCaptureProps {
  mode: 'id' | 'selfie' | 'receipt';
  onCapture: (canvas: HTMLCanvasElement) => void;
  onClose: () => void;
}

export const CameraCapture: React.FC<CameraCaptureProps> = ({ mode, onCapture, onClose }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<VideoFacingModeEnum>(
    mode === 'selfie' ? 'user' : 'environment'
  );
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [isStreamActive, setIsStreamActive] = useState<boolean>(false);

  // 카메라 하드웨어 스트림 시작
  const startCamera = async () => {
    // 기존 스트림 중단 방어 코드
    stopCamera();
    setErrorMsg('');

    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 },
          aspectRatio: { ideal: 1.7777777778 } // 16:9
        },
        audio: false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsStreamActive(true);
      }
    } catch (err: any) {
      console.error('Camera stream access failed:', err);
      setErrorMsg('카메라 접근 권한이 없거나 다른 앱에서 사용 중입니다. 권한을 확인해주세요.');
    }
  };

  // 카메라 하드웨어 스트림 중단 (메모리 누수 및 기기 과열 원천 차단)
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop();
        console.log(`[Camera Capture] Track stopped: ${track.label}`);
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsStreamActive(false);
  };

  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, [facingMode]);

  // 전후면 카메라 스위칭
  const toggleFacingMode = () => {
    setFacingMode(prev => (prev === 'user' ? 'environment' : 'user'));
  };

  // 사진 촬영 핸들러
  const capturePhoto = () => {
    if (!videoRef.current || !isStreamActive) return;

    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    
    // 비디오 해상도 크기 그대로 캔버스 설정
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // 렌더링 프레임 그대로 캔버스에 드로잉
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // 상위 오케스트레이션 컴포넌트에 전달
      onCapture(canvas);
      stopCamera();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 text-white select-none">
      {/* 상단 컨트롤바 */}
      <header className="flex items-center justify-between p-4 bg-slate-900/80 backdrop-blur-md">
        <span className="font-bold text-sm">
          {mode === 'selfie' ? '본인 얼굴 촬영' : mode === 'id' ? '신분증 촬영' : '영수증 촬영'}
        </span>
        <div className="flex gap-4">
          <button
            onClick={toggleFacingMode}
            className="p-2 bg-slate-800 hover:bg-slate-700 rounded-full transition"
            title="카메라 전환"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="p-2 bg-slate-800 hover:bg-slate-700 rounded-full transition"
            title="닫기"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* 카메라 뷰포트 영역 */}
      <div className="relative flex-1 flex items-center justify-center overflow-hidden bg-black">
        {errorMsg ? (
          <div className="p-6 text-center max-w-xs space-y-4">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
            <p className="text-sm font-semibold">{errorMsg}</p>
            <button
              onClick={startCamera}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-xl text-xs font-bold transition"
            >
              다시 시도하기
            </button>
          </div>
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
        )}

        {/* 촬영 가이드 오버레이 */}
        {!errorMsg && isStreamActive && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            {mode === 'selfie' ? (
              // 셀피 얼굴 원형 가이드선
              <div className="w-64 h-84 rounded-full border-4 border-dashed border-blue-500 bg-transparent shadow-[0_0_0_9999px_rgba(15,23,42,0.6)]"></div>
            ) : (
              // 신분증/영수증 사각형 가이드선 (3:2 또는 16:9 형태 크롭박스 가이드)
              <div className="w-[85vw] max-w-md aspect-[1.58/1] rounded-3xl border-4 border-dashed border-blue-500 bg-transparent shadow-[0_0_0_9999px_rgba(15,23,42,0.6)] flex items-center justify-center">
                <span className="text-[10px] text-blue-400 font-bold bg-slate-900/90 px-3 py-1 rounded-full">
                  사각형 영역에 수평을 맞춰주세요
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 하단 캡처 컨트롤 영역 */}
      <footer className="p-6 bg-slate-900/90 backdrop-blur-md flex justify-center items-center">
        <button
          onClick={capturePhoto}
          disabled={!isStreamActive}
          className="w-18 h-18 bg-white hover:bg-slate-100 disabled:bg-slate-700 text-slate-950 rounded-full flex items-center justify-center shadow-lg transition active:scale-95 disabled:scale-100"
          title="사진 촬영"
        >
          <Camera className="w-8 h-8" />
        </button>
      </footer>
    </div>
  );
};
export default CameraCapture;
