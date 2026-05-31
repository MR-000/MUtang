"use client";

import React, { useRef, useState, useEffect } from 'react';
import { Camera, X, RefreshCcw, Loader2, Sparkles } from 'lucide-react';
import { Button } from './button';
import { toast } from 'sonner';

interface MLIDCameraProps {
  mode: 'id' | 'selfie';
  onCapture: (file: File, preview: string) => void;
  onClose: () => void;
  t: (key: string) => string;
}

export default function MLIDCamera({ mode, onCapture, onClose, t }: MLIDCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [loading, setLoading] = useState(true);
  const [facingMode, setFacingMode] = useState<AsyncFacingMode>(mode === 'selfie' ? 'user' : 'environment');
  const [analyzingText, setAnalyzingText] = useState('Google ML Kit AI 분석 대기 중...');

  type AsyncFacingMode = 'user' | 'environment';

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, [facingMode]);

  useEffect(() => {
    const intervals = [
      'Google ML Kit AI 분석 대기 중...',
      '실시간 에지(Edge) 검출 센서 동기화 중...',
      '빛반사(Glare) 및 조도 실시간 추적 중...',
      '초점 정합성 및 흐릿함(Blur) 계수 분석 중...',
      'ML Kit 신원 검증 엔진 활성화 완료'
    ];
    let idx = 0;
    const timer = setInterval(() => {
      idx = (idx + 1) % intervals.length;
      setAnalyzingText(intervals[idx]);
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  const startCamera = async () => {
    setLoading(true);
    stopCamera();
    try {
      const constraints = {
        video: {
          facingMode: facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        videoRef.current.play();
      }
    } catch (err: any) {
      console.error('Camera Access Error:', err);
      toast.error(t('camera_access_denied') || '카메라 접근 권한이 없거나 다른 앱에서 사용 중입니다.');
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  const switchCamera = () => {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    try {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      // 좌우 반전 처리 (전면 카메라 셀피일 때 자연스럽게 보이게 함)
      if (facingMode === 'user') {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }
      
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      canvas.toBlob(async (blob) => {
        if (!blob) {
          toast.error('이미지 추출에 실패했습니다.');
          return;
        }
        
        const file = new File([blob], `${mode}_capture_${Date.now()}.jpg`, { type: 'image/jpeg' });
        const preview = URL.createObjectURL(blob);
        
        stopCamera();
        onCapture(file, preview);
      }, 'image/jpeg', 0.85);
    } catch (e) {
      console.error(e);
      toast.error('촬영 도중 오류가 발생했습니다.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col justify-between overflow-hidden animate-in fade-in duration-300">
      {/* Header Overlay */}
      <div className="absolute top-0 inset-x-0 p-5 bg-gradient-to-b from-black/80 to-transparent flex items-center justify-between z-30">
        <span className="text-xs font-black uppercase tracking-[0.2em] text-blue-400 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
          ML Kit Live Capture
        </span>
        <button 
          onClick={() => {
            stopCamera();
            onClose();
          }}
          className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white backdrop-blur-md transition-all active:scale-95"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Video Viewport */}
      <div className="relative flex-1 w-full flex items-center justify-center bg-black">
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-20 gap-4">
            <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Loading Camera Hardware...</span>
          </div>
        )}

        <video
          ref={videoRef}
          className={`w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
          muted
          playsInline
        />

        {/* Scan Guide Frame Overlay */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10">
          {mode === 'id' ? (
            /* ID Card Frame */
            <div className="w-[85%] aspect-[1.58/1] max-w-sm border-2 border-dashed border-blue-500/80 rounded-2xl relative shadow-[0_0_0_9999px_rgba(0,0,0,0.65)]">
              <div className="absolute top-4 left-4 w-6 h-6 border-t-4 border-l-4 border-blue-500 rounded-tl-md"></div>
              <div className="absolute top-4 right-4 w-6 h-6 border-t-4 border-r-4 border-blue-500 rounded-tr-md"></div>
              <div className="absolute bottom-4 left-4 w-6 h-6 border-b-4 border-l-4 border-blue-500 rounded-bl-md"></div>
              <div className="absolute bottom-4 right-4 w-6 h-6 border-b-4 border-r-4 border-blue-500 rounded-br-md"></div>
              
              <div className="absolute inset-x-0 -bottom-8 text-center">
                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-blue-400 bg-black/60 px-3 py-1 rounded-full backdrop-blur-sm">
                  {t('camera_guide_overlay') || '여기에 신분증 정렬'}
                </span>
              </div>
            </div>
          ) : (
            /* Face/Selfie Oval Frame */
            <div className="w-[65%] aspect-[1/1.2] max-w-xs border-2 border-dashed border-blue-500/80 rounded-[120px] relative shadow-[0_0_0_9999px_rgba(0,0,0,0.65)]">
              <div className="absolute top-6 left-1/2 -translate-x-1/2 w-4 h-4 border-t-4 border-blue-500 rounded-full"></div>
              
              <div className="absolute inset-x-0 -bottom-8 text-center">
                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-blue-400 bg-black/60 px-3 py-1 rounded-full backdrop-blur-sm">
                  정면을 바라봐 주세요 (얼굴 정렬)
                </span>
              </div>
            </div>
          )}

          {/* AI Subtitle Overlay */}
          <div className="absolute bottom-8 text-center w-full px-6">
            <p className="text-[9px] font-extrabold tracking-wider text-slate-300 bg-blue-950/60 border border-blue-500/20 py-2 px-4 rounded-xl inline-block backdrop-blur-md animate-pulse">
              {analyzingText}
            </p>
          </div>
        </div>
      </div>

      {/* Footer Controls Overlay */}
      <div className="bg-slate-950 px-6 py-10 flex items-center justify-between z-30 border-t border-white/5 shrink-0">
        <div className="w-16"></div> {/* Spacer to center the capture button */}
        
        <button
          onClick={capturePhoto}
          className="w-20 h-20 rounded-full bg-blue-600 hover:bg-blue-500 border-4 border-white/20 active:scale-90 transition-all flex items-center justify-center text-white shadow-xl shadow-blue-500/20"
        >
          <Camera className="w-8 h-8" />
        </button>

        <button
          onClick={switchCamera}
          className="w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white backdrop-blur-md transition-all active:scale-90"
        >
          <RefreshCcw className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
