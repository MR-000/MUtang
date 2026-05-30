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
  
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('utang-event-scanner-mount'));
    let codeReader: BrowserMultiFormatReader | null = new BrowserMultiFormatReader();
    
    codeReader.listVideoInputDevices()
      .then((videoInputDevices) => {
        if (videoInputDevices.length === 0) {
          setError("카메라 기기를 찾을 수 없습니다.");
          return;
        }

        // Try to find a back camera
        let selectedDeviceId = videoInputDevices[0].deviceId;
        for (const device of videoInputDevices) {
          if (device.label.toLowerCase().includes('back') || device.label.toLowerCase().includes('environment')) {
            selectedDeviceId = device.deviceId;
            break;
          }
        }

        if (videoRef.current) {
          codeReader.decodeFromVideoDevice(selectedDeviceId, videoRef.current, (result, err) => {
            if (result) {
              onScan(result.getText());
              // Auto-stop scanning after finding one
              if (codeReader) {
                codeReader.reset();
              }
            }
            if (err && !(err instanceof NotFoundException)) {
              console.error(err);
            }
          });
        }
      })
      .catch((err) => {
        setError("카메라 권한을 허용해주세요.");
        console.error(err);
      });

    return () => {
      window.dispatchEvent(new CustomEvent('utang-event-scanner-unmount'));
      if (codeReader) {
        codeReader.reset();
        codeReader = null;
      }
    };
  }, [onScan]);

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
          <div className="text-red-500 font-bold p-6 bg-white/10 rounded-2xl text-center backdrop-blur-md">
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
