"use client";

import React, { useRef, useState, useEffect } from 'react';
import { Button } from './button';
import { useAuth } from '@/contexts/AuthContext';

interface SignaturePadProps {
  onSave: (dataUrl: string) => void;
  onClear?: () => void;
}

export const SignaturePad: React.FC<SignaturePadProps> = ({ onSave, onClear }) => {
  const { t } = useAuth();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);

  useEffect(() => {
    // memory-leak 디버거 연동 리소스 마운트 이벤트 방출
    window.dispatchEvent(new CustomEvent('utang-event-canvas-mount'));

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size for mobile
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2.5; // 가독성 대비 강화를 위해 두께 소폭 조정
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    return () => {
      window.dispatchEvent(new CustomEvent('utang-event-canvas-unmount'));
    };
  }, []);

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    const { x, y } = getCoordinates(e);
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;

    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
    setHasDrawn(true);
    setIsConfirmed(false);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const { x, y } = getCoordinates(e);
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const confirmSignature = () => {
    if (!hasDrawn) return;
    if (canvasRef.current) {
      // 최종 확인 버튼 클릭 시에만 단 1회 무거운 toDataURL() 변환을 수행하여 CPU 병목 원천 해결
      onSave(canvasRef.current.toDataURL());
      setIsConfirmed(true);
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
    setIsConfirmed(false);
    if (onClear) onClear();
  };

  return (
    <div className="space-y-4">
      <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl overflow-hidden bg-white relative">
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseOut={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className="w-full h-40 touch-none cursor-crosshair"
        />
        {isConfirmed && (
          <div className="absolute inset-0 bg-emerald-500/10 backdrop-blur-[1px] flex items-center justify-center pointer-events-none">
            <span className="bg-emerald-500 text-white font-bold text-xs px-3 py-1 rounded-full shadow-md">
              [서명 완료]
            </span>
          </div>
        )}
      </div>
      <div className="flex justify-between items-center">
        <p className="text-[10px] text-slate-400 font-bold">
          {hasDrawn ? (isConfirmed ? '서명이 성공적으로 완료되었습니다.' : '서명 후 반드시 확인 버튼을 눌러주세요.') : '여기에 서명하십시오.'}
        </p>
        <div className="flex space-x-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={clearCanvas}
            className="text-xs rounded-xl"
          >
            {t('clear') || 'Clear'}
          </Button>
          <Button 
            variant={isConfirmed ? 'outline' : 'default'}
            size="sm" 
            disabled={!hasDrawn}
            onClick={confirmSignature}
            className={`text-xs rounded-xl font-bold transition-all ${isConfirmed ? 'border-emerald-500 text-emerald-500 hover:bg-emerald-50' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
          >
            {isConfirmed ? '서명 수정' : '서명 완료 확인'}
          </Button>
        </div>
      </div>
    </div>
  );
};
