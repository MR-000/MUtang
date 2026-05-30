"use client";

import React, { useEffect, useRef } from 'react';
import { BrowserMultiFormatReader, NotFoundException } from '@zxing/library';
import { Camera, X } from 'lucide-react';
import { Button } from './button';
import { useAuth } from '@/contexts/AuthContext';

interface BarcodeScannerProps {
  onScan: (barcode: string) => void;
  onClose: () => void;
}

export function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null);

  // 콜백을 ref로 보관 → 렌더링마다 새 참조가 생겨도 effect 재실행 방지
  const onScanRef = useRef(onScan);
  const onCloseRef = useRef(onClose);
  const { t } = useAuth();

  useEffect(() => { onScanRef.current = onScan; }, [onScan]);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('utang-event-scanner-mount'));

    const codeReader = new BrowserMultiFormatReader();
    codeReaderRef.current = codeReader;

    const startScanner = async () => {
      try {
        const videoInputDevices = await codeReader.listVideoInputDevices();
        if (videoInputDevices.length === 0) {
          if (errorRef.current) {
            errorRef.current.textContent = t('camera_not_found') || 'Camera device not found.';
            errorRef.current.style.display = 'flex';
          }
          if (videoRef.current) videoRef.current.style.display = 'none';
          return;
        }

        // 후면 카메라 우선 선택
        let selectedDeviceId = videoInputDevices[0].deviceId;
        for (const device of videoInputDevices) {
          const label = device.label.toLowerCase();
          if (
            label.includes('back') ||
            label.includes('environment') ||
            label.includes('rear') ||
            label.includes('후면')
          ) {
            selectedDeviceId = device.deviceId;
            break;
          }
        }

        if (videoRef.current) {
          const constraints: MediaStreamConstraints = {
            video: {
              deviceId: { exact: selectedDeviceId },
              facingMode: { ideal: 'environment' },
              width: { min: 640, ideal: 1280, max: 1920 },
              height: { min: 480, ideal: 720, max: 1080 }
            }
          };

          await codeReader.decodeFromConstraints(
            constraints,
            videoRef.current,
            (result, err) => {
              if (result) {
                codeReader.reset();
                onScanRef.current(result.getText());
                onCloseRef.current();
              }
              if (err && !(err instanceof NotFoundException)) {
                console.error(err);
              }
            }
          );
        }
      } catch (err: any) {
        console.error('Camera init error:', err);
        if (errorRef.current) {
          errorRef.current.textContent =
            t('camera_access_denied') ||
            'No camera access or camera is in use by another app. Please grant permission.';
          errorRef.current.style.display = 'flex';
        }
        if (videoRef.current) videoRef.current.style.display = 'none';
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 빈 배열 고정 - onScan/onClose는 ref로 관리

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      <div className="flex justify-between items-center p-4 bg-black/50 text-white z-10 absolute top-0 left-0 right-0">
        <h3 className="font-bold text-lg flex items-center gap-2">
          <Camera className="w-5 h-5" />
          {t('scan_barcode') || 'Scan Barcode'}
        </h3>
        <Button variant="ghost" size="icon" onClick={onClose} className="text-white hover:bg-white/20">
          <X className="w-6 h-6" />
        </Button>
      </div>

      <div className="relative flex-1 flex items-center justify-center overflow-hidden">
        {/* 에러 메시지 (초기에는 숨김) */}
        <div
          ref={errorRef}
          style={{ display: 'none' }}
          className="text-red-500 font-bold p-6 bg-white/10 rounded-2xl text-center backdrop-blur-md max-w-xs mx-auto leading-relaxed text-xs items-center justify-center"
        />

        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          playsInline
          muted
        />

        {/* 스캐너 프레임 오버레이 */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-black/40">
          <div className="w-[85%] max-w-sm h-40 border-2 border-green-500 rounded-2xl relative bg-transparent flex flex-col justify-between overflow-hidden">
            <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-green-500 rounded-tl-md" />
            <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-green-500 rounded-tr-md" />
            <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-green-500 rounded-bl-md" />
            <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-green-500 rounded-br-md" />
            <div className="w-full h-0.5 bg-green-500 animate-[pulse_2s_ease-in-out_infinite] shadow-[0_0_8px_2px_rgba(34,197,94,0.6)] my-auto" />
          </div>
        </div>

        <p className="absolute bottom-10 text-white/90 font-bold text-xs bg-black/75 px-4 py-2.5 rounded-full text-center max-w-[90%] backdrop-blur-sm tracking-wide">
          {t('align_barcode_hint') || 'Align barcode inside the frame (Bring it closer to scan)'}
        </p>
      </div>
    </div>
  );
}
