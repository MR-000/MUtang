"use client";

import React, { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader, NotFoundException } from '@zxing/library';
import { Camera, X } from 'lucide-react';
import { Button } from './button';

interface BarcodeScannerProps {
  onScan: (barcode: string) => void;
  onClose: () => void;
}

export function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string>('');
  const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null);
  
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('utang-event-scanner-mount'));
    
    // 싱글톤 브라우저 스캐너 생성 및 보관
    const codeReader = new BrowserMultiFormatReader();
    codeReaderRef.current = codeReader;
    
    const startScanner = async () => {
      try {
        const videoInputDevices = await codeReader.listVideoInputDevices();
        if (videoInputDevices.length === 0) {
          setError("카메라 기기를 찾을 수 없습니다.");
          return;
        }

        // 후면 카메라 우선 선택 로직
        let selectedDeviceId = videoInputDevices[0].deviceId;
        for (const device of videoInputDevices) {
          const label = device.label.toLowerCase();
          if (label.includes('back') || label.includes('environment') || label.includes('rear') || label.includes('후면')) {
            selectedDeviceId = device.deviceId;
            break;
          }
        }

        if (videoRef.current) {
          // zxing 라이브러리를 통해 카메라 스트림을 안전하게 decode 하도록 연결
          await codeReader.decodeFromVideoDevice(selectedDeviceId, videoRef.current, (result, err) => {
            if (result) {
              onScan(result.getText());
              // 한 번 스캔 성공 시 안전하게 정리하고 스캐너 종료
              codeReader.reset();
              onClose();
            }
            if (err && !(err instanceof NotFoundException)) {
              console.error(err);
            }
          });
        }
      } catch (err: any) {
        console.error("Camera init error:", err);
        setError("카메라 접근 권한이 없거나, 다른 앱에서 카메라를 사용 중입니다. 권한을 허용해 주세요.");
      }
    };

    startScanner();

    return () => {
      window.dispatchEvent(new CustomEvent('utang-event-scanner-unmount'));
      if (codeReaderRef.current) {
        codeReaderRef.current.reset();
        codeReaderRef.current = null;
      }
    };
  }, [onScan, onClose]);

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      <div className="flex justify-between items-center p-4 bg-black/50 text-white z-10 absolute top-0 left-0 right-0">
        <h3 className="font-bold text-lg flex items-center gap-2">
          <Camera className="w-5 h-5" />
          바코드 스캔
        </h3>
        <Button variant="ghost" size="icon" onClick={onClose} className="text-white hover:bg-white/20">
          <X className="w-6 h-6" />
        </Button>
      </div>

      <div className="relative flex-1 flex items-center justify-center overflow-hidden">
        {error ? (
          <div className="text-red-500 font-bold p-6 bg-white/10 rounded-2xl text-center backdrop-blur-md max-w-xs mx-auto leading-relaxed text-xs">
            {error}
          </div>
        ) : (
          <video 
            ref={videoRef} 
            className="w-full h-full object-cover"
            playsInline
            muted
          />
        )}

        {/* Scanner overlay frame */}
        <div className="absolute inset-0 border-[40px] border-black/40 pointer-events-none">
          <div className="w-full h-full border-2 border-green-500 relative">
            {/* Corner markers */}
            <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-green-500" />
            <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-green-500" />
            <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-green-500" />
            <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-green-500" />
            {/* Scanning line animation */}
            <div className="w-full h-0.5 bg-green-500 animate-[pulse_2s_ease-in-out_infinite] shadow-[0_0_8px_2px_rgba(34,197,94,0.6)]" />
          </div>
        </div>
        
        <p className="absolute bottom-10 text-white/80 font-medium text-sm bg-black/60 px-4 py-2 rounded-full">
          바코드를 사각형 중앙에 맞춰주세요
        </p>
      </div>
    </div>
  );
}
