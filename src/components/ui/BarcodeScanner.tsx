"use client";

import React, { useEffect, useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';
import { Button } from './button';
import { useAuth } from '@/contexts/AuthContext';
import { BrowserMultiFormatReader, NotFoundException } from '@zxing/library';

interface BarcodeScannerProps {
  onScan: (barcode: string) => void;
  onClose: () => void;
}

export function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const [scanType, setScanType] = useState<'native' | 'web-detector' | 'zxing' | 'loading'>('loading');
  const { t } = useAuth();

  const onScanRef = useRef(onScan);
  const onCloseRef = useRef(onClose);

  useEffect(() => { onScanRef.current = onScan; }, [onScan]);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('utang-event-scanner-mount'));
    let active = true;
    let stream: MediaStream | null = null;
    let codeReader: BrowserMultiFormatReader | null = null;
    let animationFrameId: number | null = null;

    const initScanner = async () => {
      if (typeof window === 'undefined') return;

      try {
        const { Capacitor } = await import('@capacitor/core');
        const isNative = Capacitor.isNativePlatform();

        if (isNative) {
          setScanType('native');
          const { BarcodeScanner: CapScanner } = await import('@capacitor-mlkit/barcode-scanning');

          const checkPermission = async () => {
            const status = await CapScanner.checkPermissions();
            if (status.camera === 'granted') return true;
            const request = await CapScanner.requestPermissions();
            return request.camera === 'granted';
          };

          const hasPermission = await checkPermission();
          if (!hasPermission) {
            throw new Error('camera_access_denied');
          }

          if (!active) return;
          const { barcodes } = await CapScanner.scan();
          if (barcodes && barcodes.length > 0 && active) {
            onScanRef.current(barcodes[0].rawValue);
            onCloseRef.current();
          } else {
            onCloseRef.current();
          }
          return;
        }
      } catch (nativeErr) {
        console.warn('Native scanner not available, falling back to Web:', nativeErr);
      }

      try {
        const tempReader = new BrowserMultiFormatReader();
        const videoInputDevices = await tempReader.listVideoInputDevices();
        if (videoInputDevices.length === 0) {
          throw new Error('camera_not_found');
        }

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

        const constraints: MediaStreamConstraints = {
          video: {
            deviceId: { exact: selectedDeviceId },
            facingMode: { ideal: 'environment' },
            width: { min: 640, ideal: 1280, max: 1920 },
            height: { min: 480, ideal: 720, max: 1080 }
          }
        };

        stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (videoRef.current && active) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute('playsinline', 'true');
          await videoRef.current.play();
        }

        if ('BarcodeDetector' in window && active) {
          setScanType('web-detector');
          const BarcodeDetectorClass = (window as any).BarcodeDetector;
          const detector = new BarcodeDetectorClass({
            formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e']
          });

          const detectFrame = async () => {
            if (!videoRef.current || !active) return;
            try {
              if (videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
                const barcodes = await detector.detect(videoRef.current);
                if (barcodes.length > 0 && active) {
                  onScanRef.current(barcodes[0].rawValue);
                  onCloseRef.current();
                  return;
                }
              }
            } catch (err) {
              console.error('BarcodeDetector error:', err);
            }
            if (active) {
              animationFrameId = requestAnimationFrame(detectFrame);
            }
          };
          detectFrame();
          return;
        }

        if (active) {
          setScanType('zxing');
          codeReader = new BrowserMultiFormatReader();
          await codeReader.decodeFromConstraints(
            constraints,
            videoRef.current!,
            (result, err) => {
              if (result && active) {
                codeReader?.reset();
                onScanRef.current(result.getText());
                onCloseRef.current();
              }
              if (err && !(err instanceof NotFoundException)) {
                console.error('zxing scanner error:', err);
              }
            }
          );
        }

      } catch (err: any) {
        console.error('Web Camera init error:', err);
        if (errorRef.current && active) {
          const errMsg = err.message === 'camera_not_found'
            ? t('camera_not_found') || 'Camera device not found.'
            : t('camera_access_denied') || 'No camera access or camera is in use. Please grant permission.';
          
          errorRef.current.textContent = errMsg;
          errorRef.current.style.display = 'flex';
        }
        if (videoRef.current && active) {
          videoRef.current.style.display = 'none';
        }
        setScanType('zxing');
      }
    };

    initScanner();

    return () => {
      active = false;
      window.dispatchEvent(new CustomEvent('utang-event-scanner-unmount'));
      
      if (codeReader) {
        codeReader.reset();
      }
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        <div
          ref={errorRef}
          style={{ display: 'none' }}
          className="text-red-500 font-bold p-6 bg-white/10 rounded-2xl text-center backdrop-blur-md max-w-xs mx-auto leading-relaxed text-xs items-center justify-center z-20"
        />

        {scanType === 'loading' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black text-white z-10">
            <div className="w-8 h-8 border-4 border-t-green-500 border-green-200 rounded-full animate-spin mb-4" />
            <p className="text-xs font-bold">{t('loading_camera') || 'Loading camera...'}</p>
          </div>
        )}

        {scanType === 'native' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 text-white z-10 p-6 text-center">
            <Camera className="w-12 h-12 text-green-500 animate-pulse mb-4" />
            <p className="font-bold mb-2">{t('native_scanner_active') || 'Native Barcode Scanner Active'}</p>
            <p className="text-xs text-white/60">{t('native_scanner_hint') || 'Scanning using high-performance Google ML Kit'}</p>
          </div>
        )}

        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          playsInline
          muted
        />

        {scanType !== 'native' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-black/40">
            <div className="w-[85%] max-w-sm h-40 border-2 border-green-500 rounded-2xl relative bg-transparent flex flex-col justify-between overflow-hidden">
              <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-green-500 rounded-tl-md" />
              <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-green-500 rounded-tr-md" />
              <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-green-500 rounded-bl-md" />
              <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-green-500 rounded-br-md" />
              <div className="w-full h-0.5 bg-green-500 animate-[pulse_2s_ease-in-out_infinite] shadow-[0_0_8px_2px_rgba(34,197,94,0.6)] my-auto" />
            </div>
          </div>
        )}

        {scanType !== 'native' && (
          <p className="absolute bottom-10 text-white/90 font-bold text-xs bg-black/75 px-4 py-2.5 rounded-full text-center max-w-[90%] backdrop-blur-sm tracking-wide z-10">
            {t('align_barcode_hint') || 'Align barcode inside the frame (Bring it closer to scan)'}
          </p>
        )}
      </div>
    </div>
  );
}
