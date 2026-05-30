"use client";

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { 
  ChevronLeft, 
  Camera, 
  ShieldCheck, 
  AlertCircle,
  Loader2,
  CheckCircle2,
  Smartphone,
  Info,
  ArrowRight,
  RefreshCcw,
  Share,
  MoreVertical,
  UserCheck
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { compressImage, verifyIDDocument, checkImageQuality } from '@/lib/kyc';
import { QRCodeSVG } from 'qrcode.react';

const PRIMARY_IDS = [
  'Passport', 'Driver\'s License', 'UMID', 'SSS ID', 
  'PhilID', 'National ID', 'iDOLE Card', 'School ID'
];

const SECONDARY_IDS = [
  'TIN ID', 'Postal ID', 'Police Clearance', 'Barangay Clearance', 'GSIS'
];

export default function VerificationPage() {
  const { user, profile, t, refreshProfile } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [step, setStep] = useState(0); // 0: Guide, 1: ID1-Front, 2: ID1-Back, 3: ID2-Front, 4: ID2-Back, 5: Selfie, 6: Review
  
  const [verificationData, setVerificationData] = useState({
    id1Type: '',
    id2Type: '',
    photos: [] as { path: string; preview: string }[]
  });

  useEffect(() => {
    const ua = navigator.userAgent;
    const mobile = /Android|iPhone|iPad|iPod/i.test(ua);
    setIsMobile(mobile);
    
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
    setIsStandalone(standalone);
  }, []);

  const handleCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      // 1. 이미지 압축
      const compressedBlob = await compressImage(file);
      
      // 2. AI 이미지 품질 분석 (빛반사, 흐릿함, 어두움 등 검사)
      const qualityCheck = await checkImageQuality(compressedBlob);
      if (!qualityCheck.success) {
        toast.error(qualityCheck.message, { duration: 6000 });
        setLoading(false);
        return;
      }

      // 3. 촬영 즉시 실시간 업로드 진행 (위변조 가능성 원천 차단)
      const stepNames = ['id1_front', 'id1_back', 'id2_front', 'id2_back', 'selfie'];
      const currentStepName = stepNames[step - 1];
      const filePath = `${user?.id}/${currentStepName}_${Date.now()}.jpg`;

      // [무료 스토리지 한도 수호] 이전의 구형 임시/제출 이미지 자동 클린업
      if (user?.id) {
        try {
          const { data: fileList, error: listError } = await supabase.storage
            .from('user-ids')
            .list(user.id);
            
          if (!listError && fileList) {
            const filesToDelete = fileList
              .filter(file => file.name.startsWith(currentStepName))
              .map(file => `${user.id}/${file.name}`);
              
            if (filesToDelete.length > 0) {
              console.log(`[Storage Cleanup] 무료 한도 1GB 보존을 위해 이전의 신분증 이미지 ${filesToDelete.length}개를 자동으로 영구 제거합니다.`, filesToDelete);
              await supabase.storage.from('user-ids').remove(filesToDelete);
            }
          }
        } catch (cleanupError) {
          console.warn('[Storage Cleanup Warning] 이전 파일 삭제 도중 오류 발생:', cleanupError);
        }
      }

      const { error: uploadError } = await supabase.storage
        .from('user-ids')
        .upload(filePath, compressedBlob, { upsert: true, contentType: 'image/jpeg' });

      if (uploadError) throw uploadError;

      // 4. 업로드 완료 경로 및 로컬 프리뷰 저장
      const preview = URL.createObjectURL(compressedBlob);
      setVerificationData(prev => ({
        ...prev,
        photos: [...prev.photos, { path: filePath, preview }]
      }));
      
      toast.success(`${step}단계 검수 완료 및 실시간 업로드 완료!`);
      setStep(prev => prev + 1);
    } catch (error: any) {
      toast.error(error.message || '이미지 업로드에 실패했습니다. 네트워크 상태를 확인 후 다시 찍어주세요.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const paths = verificationData.photos.map(p => p.path);
      
      // 5단계 촬영 모두 완료 여부 확인
      if (paths.length < 5) {
        throw new Error('모든 촬영 단계를 완료해야 인증 제출이 가능합니다.');
      }

      const result = await verifyIDDocument(user!.id, paths);

      if (result.success) {
        toast.success(t('verified') || '신분증 및 셀피 인증 서류가 정상 제출되었습니다!');
        await refreshProfile();
        router.push('/settings');
      } else {
        toast.error(result.message);
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  // PC Block View
  if (!isMobile) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-slate-50 dark:bg-slate-950 text-center">
        <div className="w-24 h-24 bg-blue-600/10 rounded-[40px] flex items-center justify-center text-blue-600 mb-8">
          <Smartphone className="w-12 h-12" />
        </div>
        <h1 className="text-3xl font-black mb-4 dark:text-white">{t('pc_block_title')}</h1>
        <p className="text-slate-500 dark:text-slate-400 font-bold max-w-xs mb-10 leading-relaxed">
          {t('pc_block_desc')}
        </p>
        
        <div className="bg-white p-6 rounded-[48px] shadow-2xl shadow-blue-500/20 mb-8">
          <QRCodeSVG value={window.location.href} size={200} />
        </div>
        
        <p className="text-sm font-black text-blue-600 uppercase tracking-widest mb-10">
          {t('qr_scan_guide')}
        </p>

        <Link 
          href="/settings" 
          className="h-14 px-8 flex items-center justify-center bg-slate-200 dark:bg-white/10 hover:bg-slate-300 dark:hover:bg-white/20 text-slate-800 dark:text-slate-200 font-black rounded-2xl transition-all duration-300 hover:scale-105"
        >
          {t('back_to_settings') || '설정 화면으로 돌아가기'}
        </Link>
      </div>
    );
  }

  // PWA Install Guide (if not standalone)
  const PWAInstructions = () => {
    const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
    return (
      <Card className="p-8 bg-slate-900 text-white rounded-[40px] border-none shadow-2xl mb-8 overflow-hidden relative">
        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/20 blur-3xl -mr-16 -mt-16"></div>
        <div className="relative flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-2xl bg-blue-600 flex items-center justify-center">
            <Info className="w-6 h-6" />
          </div>
          <h3 className="font-black text-lg">{t('pwa_install_title')}</h3>
        </div>
        
        <div className="space-y-4 relative">
          <div className="flex items-center gap-4 bg-white/5 p-4 rounded-2xl">
            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center font-black">1</div>
            <p className="text-sm font-bold leading-snug">
              {isIOS ? t('ios_pwa_guide') : t('android_pwa_guide')}
            </p>
            {isIOS ? <Share className="w-5 h-5 text-blue-400 ml-auto" /> : <MoreVertical className="w-5 h-5 text-blue-400 ml-auto" />}
          </div>
          <div className="flex items-center gap-4 bg-white/5 p-4 rounded-2xl">
            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center font-black">2</div>
            <p className="text-sm font-bold leading-snug">
              MUtang {t('dashboard')}
            </p>
            <ArrowRight className="w-5 h-5 text-blue-400 ml-auto" />
          </div>
        </div>
      </Card>
    );
  };

  const renderStep = () => {
    switch (step) {
      case 0: // ID Type Selection Guide
        return (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-5 duration-300">
            <section className="text-center space-y-4">
              <div className="w-20 h-20 bg-blue-600/10 rounded-3xl flex items-center justify-center text-blue-600 mx-auto">
                <ShieldCheck className="w-10 h-10" />
              </div>
              <h2 className="text-2xl font-black dark:text-white">{t('identity_verification')}</h2>
              <p className="text-slate-500 font-bold text-sm max-w-xs mx-auto">{t('id_upload_rule')}</p>
            </section>

            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-widest text-slate-500 pl-4">{t('primary_id_label')}</label>
                <select 
                  className="w-full bg-slate-100 dark:bg-slate-900 border-none rounded-3xl p-5 font-black outline-none focus:ring-2 focus:ring-blue-500"
                  onChange={(e) => setVerificationData(d => ({ ...d, id1Type: e.target.value }))}
                >
                  <option value="">{t('select_primary_id')}</option>
                  {PRIMARY_IDS.map(id => <option key={id} value={id}>{id}</option>)}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-widest text-slate-500 pl-4">{t('secondary_id_label')}</label>
                <select 
                  className="w-full bg-slate-100 dark:bg-slate-900 border-none rounded-3xl p-5 font-black outline-none focus:ring-2 focus:ring-blue-500"
                  onChange={(e) => setVerificationData(d => ({ ...d, id2Type: e.target.value }))}
                >
                  <option value="">{t('select_secondary_id')}</option>
                  {PRIMARY_IDS.concat(SECONDARY_IDS).map(id => <option key={id} value={id}>{id}</option>)}
                </select>
              </div>
            </div>

            <Button 
              className="w-full h-16 bg-blue-600 text-white rounded-3xl font-black text-lg"
              disabled={!verificationData.id1Type || !verificationData.id2Type}
              onClick={() => setStep(1)}
            >
              {t('start_verification')} <ArrowRight className="ml-2" />
            </Button>

            {!isStandalone && <PWAInstructions />}
          </div>
        );

      case 1:
      case 2:
      case 3:
      case 4:
      case 5: {
        const stepLabels = [
          '', 
          t('kyc_step_1_front') || '1차 주요 신분증 앞면 촬영', 
          t('kyc_step_1_back') || '1차 주요 신분증 뒷면 촬영', 
          t('kyc_step_2_front') || '2차 증빙 신분증 앞면 촬영', 
          t('kyc_step_2_back') || '2차 증빙 신분증 뒷면 촬영',
          '5단계 본인 실물 셀피 촬영'
        ];
        const isSelfieStep = step === 5;
        
        return (
          <div className="space-y-8 animate-in fade-in duration-300">
            <div className="flex items-center justify-between">
              <span className="text-sm font-black text-blue-600">{t('step')} {step} / 5</span>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map(s => (
                  <div key={s} className={`h-1.5 w-6 rounded-full ${s <= step ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-800'}`} />
                ))}
              </div>
            </div>

            <div className="text-center space-y-2">
              <h3 className="text-2xl font-black dark:text-white flex items-center justify-center gap-2">
                {isSelfieStep && <UserCheck className="w-6 h-6 text-blue-600" />}
                {stepLabels[step]}
              </h3>
              <p className="text-xs font-bold text-slate-400">
                {isSelfieStep ? '전면 카메라가 작동됩니다. 얼굴 가이드선에 맞춰 얼굴을 비춰주세요.' : '신분증 가이드 영역에 가득 차도록 수평을 맞춰주세요.'}
              </p>
            </div>

            <div className="relative aspect-[1.58/1] w-full bg-slate-100 dark:bg-slate-900 rounded-[40px] border-4 border-dashed border-slate-200 dark:border-white/10 overflow-hidden group">
              {loading ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm z-20">
                  <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
                  <span className="font-black animate-pulse text-sm text-slate-800 dark:text-slate-200">
                    AI 화질 실시간 정밀 진증 중...
                  </span>
                </div>
              ) : null}

              {/* Guide Overlay */}
              <div className="absolute inset-0 border-[32px] border-black/40 flex items-center justify-center z-10 pointer-events-none">
                <div className="w-full h-full border-2 border-white/50 rounded-2xl flex items-center justify-center">
                  <p className="text-white text-[10px] font-black uppercase tracking-[0.2em] bg-black/60 px-4 py-2 rounded-full backdrop-blur-sm">
                    {isSelfieStep ? '정면을 바라봐 주세요' : (t('camera_guide_overlay') || '여기에 신분증 정렬')}
                  </p>
                </div>
              </div>

              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400">
                <Camera className="w-16 h-16 mb-4 opacity-20" />
              </div>

              <input 
                type="file" 
                accept="image/*" 
                capture={isSelfieStep ? "user" : "environment"} 
                className="absolute inset-0 opacity-0 cursor-pointer z-30"
                onChange={handleCapture}
                disabled={loading}
              />
            </div>

            <div className="bg-slate-50 dark:bg-slate-900/40 p-4 rounded-3xl flex items-start gap-3">
              <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              <p className="text-[11px] font-bold text-slate-400 leading-relaxed">
                {isSelfieStep 
                  ? '셀피 이미지는 본인 대조 목적 이외에 일체 타 용도로 사용되지 않으며 암호화 저장됩니다.' 
                  : (t('kyc_guide') || '촬영 즉시 빛반사와 흐릿함(Blur)을 AI 분석하여 판정합니다. 불투명하고 흔들리지 않는 평평한 곳에서 촬영하세요.')}
              </p>
            </div>
          </div>
        );
      }

      case 6: // Final Review
        return (
          <div className="space-y-8 animate-in fade-in zoom-in-95 duration-300">
            <h3 className="text-2xl font-black dark:text-white text-center">{t('review_submit') || '인증 자료 최종 제출 검토'}</h3>
            
            <div className="grid grid-cols-2 gap-4">
              {verificationData.photos.map((p, i) => (
                <div key={i} className="space-y-2">
                  <span className="text-[10px] font-black uppercase text-slate-500 pl-2">
                    {i === 4 ? '5단계 셀피 본인' : `${i + 1}단계 사진`}
                  </span>
                  <div className="aspect-[1.58/1] rounded-2xl overflow-hidden border border-slate-200 dark:border-white/10">
                    <img src={p.preview} alt="ID" className="w-full h-full object-cover" />
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-4 pt-8">
              <Button 
                className="w-full h-16 bg-blue-600 text-white rounded-[24px] font-black text-lg"
                onClick={handleSubmit}
                disabled={loading}
              >
                {loading ? <Loader2 className="animate-spin" /> : (t('confirm_upload') || '모든 서류 제출 및 완료')}
              </Button>
              <Button 
                variant="ghost" 
                className="w-full py-4 text-slate-400 font-bold"
                onClick={() => {
                  setStep(0);
                  setVerificationData(d => ({ ...d, photos: [] }));
                }}
              >
                <RefreshCcw className="w-4 h-4 mr-2" /> {t('start_over') || '처음부터 다시하기'}
              </Button>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="max-w-md mx-auto min-h-screen bg-white dark:bg-slate-950 px-6 py-8 pb-32">
      <header className="flex items-center justify-between mb-12">
        <Button 
          variant="ghost" 
          size="icon" 
          className="rounded-full" 
          onClick={() => {
            if (step > 0) {
              if (step === 6) {
                setStep(0);
                setVerificationData(d => ({ ...d, photos: [] }));
              } else {
                setStep(prev => prev - 1);
                setVerificationData(prev => ({
                  ...prev,
                  photos: prev.photos.slice(0, -1)
                }));
              }
            } else {
              if (window.history.length > 1) {
                router.back();
              } else {
                router.push('/settings');
              }
            }
          }}
        >
          <ChevronLeft className="w-8 h-8" />
        </Button>
        <span className="font-black uppercase tracking-widest text-xs opacity-50">{t('kyc_verification_title')}</span>
        <div className="w-10" />
      </header>

      <div className="transition-all duration-300">
        {renderStep()}
      </div>
    </div>
  );
}
