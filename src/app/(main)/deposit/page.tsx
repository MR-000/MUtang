"use client";

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { 
  Wallet, 
  ArrowRight, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Coins,
  ArrowLeft,
  Smartphone,
  Info,
  Plus,
  ExternalLink,
  Camera,
  Copy,
  X
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { compressImage } from '@/lib/kyc';

interface DepositRequest {
  id: string;
  amount: number;
  unique_amount: number;
  method: string;
  from_wallet: string | null;
  status: string;
  expires_at: string;
  proof_image_url?: string | null;
}

export default function DepositPage() {
  const { user, language } = useAuth();
  const router = useRouter();

  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'gcash' | 'solana_usdt' | 'solana_usdc'>('gcash');
  const [solanaWallet, setSolanaWallet] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeRequest, setActiveRequest] = useState<DepositRequest | null>(null);
  const [timeLeft, setTimeLeft] = useState(180);
  const [errorMsg, setErrorMsg] = useState('');
  const [success, setSuccess] = useState(false);

  const [uploadingProof, setUploadingProof] = useState(false);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [isProofModalOpen, setIsProofModalOpen] = useState(false);

  // 진행 중인 미완료(pending) 충전 요청이 있는지 조회 및 복원하는 로직
  useEffect(() => {
    if (!user?.id) return;

    const restoreActiveRequest = async () => {
      try {
        const { data, error } = await supabase
          .from('deposit_requests')
          .select('*')
          .eq('user_id', user.id)
          .eq('status', 'pending')
          .gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false })
          .limit(1);

        if (error) {
          console.error('Error fetching active request:', error);
          return;
        }

        if (data && data.length > 0) {
          const active = data[0];
          setActiveRequest(active);
          
          // 남은 시간 계산 (초 단위)
          const expiresTime = new Date(active.expires_at).getTime();
          const diff = Math.max(0, Math.floor((expiresTime - Date.now()) / 1000));
          setTimeLeft(diff);
          
          // 충전 수단 및 금액 필드 자동 세팅
          setMethod(active.method as any);
          setAmount(active.amount.toString());
          if (active.from_wallet) {
            setSolanaWallet(active.from_wallet);
          }
          
          toast.success('이전에 신청하신 충전 요청이 진행 중이어서 해당 단계로 복원되었습니다.');
        }
      } catch (err) {
        console.error('Failed to restore active request:', err);
      }
    };

    restoreActiveRequest();
  }, [user]);

  // 텍스트 복사 핸들러
  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('복사되었습니다.');
  };

  // 1-1. 입금증 스크린샷 파일 선택 함수
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setProofFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setProofPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // 1-2. 실제 입금증 스크린샷 서버 업로드 함수 (업로드 버튼 클릭 시 수행)
  const handleActualUpload = async () => {
    if (!proofFile || !activeRequest?.id || !user?.id) {
      toast.error('업로드할 파일을 선택해 주세요.');
      return;
    }

    setUploadingProof(true);
    try {
      // 이미지 사전 압축 적용 (영수증 판독용이므로 최대 1000px와 0.8 퀄리티가 대폭 최적화됨)
      const compressedBlob = await compressImage(proofFile, 1000, 0.8);
      const filePath = `${user.id}/proofs/${activeRequest.id}_proof.jpg`;

      const { error: uploadError } = await supabase.storage
        .from('profile-assets')
        .upload(filePath, compressedBlob, { upsert: true, contentType: 'image/jpeg' });

      if (uploadError) {
        toast.error(uploadError.message);
        setUploadingProof(false);
        return;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('profile-assets')
        .getPublicUrl(filePath);

      const { error: dbError } = await supabase
        .from('deposit_requests')
        .update({ proof_image_url: publicUrl })
        .eq('id', activeRequest.id);

      if (dbError) {
        toast.error('입금증 정보 저장에 실패했습니다.');
      } else {
        setActiveRequest((prev: any) => prev ? { ...prev, proof_image_url: publicUrl } : null);
        toast.success('입금증 업로드가 완료되었습니다! 실시간 영수증 분석을 시작합니다.');
        setProofFile(null);
        setProofPreview(null);

        // OCR 검증 API 호출 트리거
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const token = session?.access_token;

          const ocrRes = await fetch('/api/payments/ocr-verify', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': token ? `Bearer ${token}` : ''
            },
            body: JSON.stringify({
              requestId: activeRequest.id,
              imageUrl: publicUrl
            })
          });

          const ocrData = await ocrRes.json();
          if (ocrRes.ok && ocrData.success) {
            toast.success('영수증이 자동으로 분석되어 입금 확인 및 크레딧 충전이 즉시 완료되었습니다!');
            setSuccess(true);
          } else {
            console.warn('[OCR 검증 실패]:', ocrData.message || ocrData.error);
            toast.info(ocrData.message || '영수증 자동 판독에 실패했습니다. 관리자 수동 승인 대기 단계로 인계됩니다.');
          }
        } catch (ocrErr) {
          console.error('[OCR 호출 실패]:', ocrErr);
          toast.info('영수증 자동 판독 중 네트워크 통신 오류가 발생했습니다. 수동 승인 대기 처리됩니다.');
        }
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUploadingProof(false);
    }
  };

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // 내부 다국어 사전 (비전공자 배려 및 깨짐 방지)
  const dict = {
    title: {
      en: 'Deposit Balance',
      tl: 'Mag-deposit ng Balance',
      ko: '크레딧 충전하기'
    },
    subtitle: {
      en: 'Charge your store credit securely using GCash or Solana',
      tl: 'I-charge ang store credit gamit ang GCash o Solana',
      ko: 'GCash 및 솔라나를 이용한 간편하고 안전한 크레딧 충전 인프라'
    },
    methodSelect: {
      en: 'Choose Payment Method',
      tl: 'Pumili ng Paraan ng Pagbabayad',
      ko: '충전 수단 선택'
    },
    amountInput: {
      en: 'Enter Amount',
      tl: 'Ilagay ang Halaga',
      ko: '충전할 금액 입력'
    },
    solanaWalletInput: {
      en: 'Your Solana Wallet Address',
      tl: 'Iyong Solana Wallet Address',
      ko: '본인의 솔라나 지갑 주소'
    },
    solanaWalletHint: {
      en: 'Enter phantom/trust wallet address to track deposit',
      tl: 'Ilagay ang phantom/trust wallet address para ma-track ang deposit',
      ko: '입금을 확인하고 추적할 솔라나 지갑(Phantom/Trust 등) 주소를 입력하세요'
    },
    submitBtn: {
      en: 'Generate Charge Request',
      tl: 'Gumawa ng Request sa Pagbabayad',
      ko: '충전 요청 생성하기'
    },
    processing: {
      en: 'Creating request...',
      tl: 'Gumagawa ng request...',
      ko: '요청서 생성 중...'
    },
    step1Title: {
      en: 'Step 1: Charge Request Registered',
      tl: 'Hakbang 1: Narehistro na ang Charge Request',
      ko: '1단계: 충전 요청서 정상 등록'
    },
    step1Desc: {
      en: 'Your payment session is successfully created.',
      tl: 'Ang iyong payment session ay matagumpay na nagawa.',
      ko: '결제 세션이 안전하게 시작되었습니다.'
    },
    step2Title: {
      en: 'Step 2: Awaiting Your Deposit',
      tl: 'Hakbang 2: Naghihintay sa Iyong Deposit',
      ko: '2단계: 지정 금액 입금 대기 중'
    },
    step2DescGcash: {
      en: 'Please send EXACTLY the unique amount to GCash number: 0917-123-4567. Accurate decimals are required for identity matchmaking.',
      tl: 'Mangyaring ipadala ang TAMANG halaga sa GCash number: 0917-123-4567. Kailangan ang eksaktong decimal para sa matchmaking.',
      ko: '정확히 지정된 고유 금액을 아래 GCash 번호로 송금해주세요. 입금인 식별 매칭을 위해 소수점 자리가 정확해야 합니다.'
    },
    step2DescSolana: {
      en: 'Please transfer tokens to Solana deposit address: DtU5y... (Solana Network)',
      tl: 'Mangyaring i-transfer ang tokens sa Solana deposit address: DtU5y... (Solana Network)',
      ko: '아래 솔라나 입금 주소로 지정된 달러 토큰을 전송해 주세요: DtU5yJp3aK7wPqS9dMef (솔라나 네트워크 전용)'
    },
    step3Title: {
      en: 'Step 3: Verification & Completed',
      tl: 'Hakbang 3: Pagpapatunay at Kumpleto na',
      ko: '3단계: 입금 감지 및 크레딧 적립 완료'
    },
    step3Desc: {
      en: 'Credit will be instantly added once the system verifies transaction.',
      tl: 'Awtomatikong idadagdag ang credit kapag na-verify na ang transaksyon.',
      ko: '입금이 확인되는 즉시 자동으로 크레딧 잔액이 안전하게 업데이트됩니다.'
    },
    infoTitle: {
      en: 'Non-Developer Easy Guide',
      tl: 'Madaling Gabay para sa Lahat',
      ko: '초보자를 위한 고유 소수점 금액 안내'
    },
    infoContent: {
      en: 'The random cents (e.g. .37 PHP) added to your request act like a unique ticket number. It ensures the automated system matches your payment instantly without requiring human review. Do not round up or down.',
      tl: 'Ang random cents (hal. .37 PHP) ay nagsisilbing ticket number. Sinisiguro nito na ang automated system ay magtutugma agad ng bayad mo nang walang manual review. Huwag itong i-round up o down.',
      ko: 'GCash 충전 시 소수점 자리는 여러 명이 동시에 충전할 때 입금자를 구분하기 위한 일종의 번호표 역할을 합니다. 임의로 반올림하거나 올림 하지 마시고 지정된 소수점까지 그대로 송금하셔야 3초 내에 실시간 충전 처리가 완료됩니다.'
    },
    expired: {
      en: 'Request Expired',
      tl: 'Expired na ang Request',
      ko: '충전 요청서 유효 기간 만료'
    },
    expiredDesc: {
      en: 'The 3-minute window has closed. Unused cents have been recycled. Please generate a new request.',
      tl: 'Tapos na ang 3-minute limit. Nag-recycle na ang cents. Gumawa ng bagong request.',
      ko: '3분 유효 시간이 종료되어 고유 식별 번호가 회수되었습니다. 새 요청서를 생성해 주세요.'
    },
    successTitle: {
      en: 'Charge Successful!',
      tl: 'Matagumpay ang Pag-charge!',
      ko: '크레딧 충전 성공!'
    },
    successDesc: {
      en: 'Your store credit has been updated. You can now use it in the platform.',
      tl: 'Na-update na ang store credit. Pwede mo na itong gamitin sa platform.',
      ko: '크레딧 충전이 안전하게 완료되었습니다. 즉시 플랫폼 내에서 외상 거래 및 관리 업무에 활용하실 수 있습니다.'
    },
    goBack: {
      en: 'Go to Settings',
      tl: 'Bumalik sa Settings',
      ko: '설정으로 돌아가기'
    },
    gcash_screenshot_desc: {
      en: 'Please take a screenshot of your GCash receipt. The screenshot MUST clearly display the amount, date, and transaction/reference number.',
      tl: 'Mangyaring kumuha ng screenshot ng iyong GCash receipt. Dapat malinaw na ipinapakita ang halaga, petsa, at reference number.',
      ko: '지캐시(GCash) 입금 후 송금 영수증 스크린샷을 반드시 업로드해 주세요. 스크린샷에는 송금 금액, 날짜, 입금증 번호(Reference No.)가 명확하게 식별 가능하도록 포함되어 있어야 합니다.'
    },
    select_image_btn: {
      en: 'Select Receipt Image',
      tl: 'Pumili ng Larawan ng Resibo',
      ko: '영수증 스크린샷 선택하기'
    },
    upload_submit_btn: {
      en: 'Submit Receipt',
      tl: 'I-submit ang Resibo',
      ko: '입금 영수증 제출 완료하기'
    },
    cancel_select: {
      en: 'Cancel',
      tl: 'Kanselahin',
      ko: '선택 취소'
    },
    uploading_proof: {
      en: 'Uploading...',
      tl: 'Nag-a-upload...',
      ko: '영수증 업로드 중...'
    },
    view_proof: {
      en: 'View Submitted Receipt',
      tl: 'Tingnan ang Isinumiteng Resibo',
      ko: '제출한 입금증 영수증 보기'
    },
    upload_proof_title: {
      en: 'GCash Payment Receipt (Manual Verification)',
      tl: 'GCash Payment Receipt (Manual Verification)',
      ko: 'GCash 송금 영수증 증빙 제출 (수동 검증)'
    },
    upload_proof_preview_title: {
      en: 'Selected Receipt Preview',
      tl: 'Preview ng Napiling Resibo',
      ko: '선택된 영수증 미리보기'
    },
    close: {
      en: 'Close',
      tl: 'Isara',
      ko: '닫기'
    }
  };

  const getT = (key: keyof typeof dict) => {
    const lang = (language === 'ko' || language === 'tl') ? language : 'en';
    return dict[key][lang];
  };

  // 타이머 작동 로직
  useEffect(() => {
    if (activeRequest && timeLeft > 0 && !success) {
      timerRef.current = setTimeout(() => {
        setTimeLeft(timeLeft - 1);
      }, 1000);
    } else if (timeLeft === 0 && activeRequest && !success) {
      handleExpire();
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [activeRequest, timeLeft, success]);

  // 실시간 동기화 (Supabase Realtime-First, Polling-Fallback 적응형)
  useEffect(() => {
    if (!activeRequest || success) return;

    let isRealtimeSubscribed = false;
    let fallbackTimeout: NodeJS.Timeout | null = null;

    const startPollingFallback = () => {
      if (pollingRef.current) return;
      console.warn('[Realtime Connection Failed/Delayed] Realtime 구독이 지연되거나 실패했습니다. 안전을 위해 3초 주기 Polling을 백업으로 가동합니다.');
      
      pollingRef.current = setInterval(async () => {
        try {
          const { data, error } = await supabase
            .from('deposit_requests')
            .select('status')
            .eq('id', activeRequest.id)
            .single();

          if (data && data.status === 'completed') {
            triggerSuccess();
          }
        } catch (err) {
          console.error('Polling deposit status failed:', err);
        }
      }, 3000);
    };

    // 1. Supabase Realtime 구독 설정
    const channel = supabase
      .channel(`deposit_${activeRequest.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'deposit_requests',
          filter: `id=eq.${activeRequest.id}`
        },
        (payload) => {
          console.log('[Realtime Update Received]:', payload.new);
          if (payload.new.status === 'completed') {
            triggerSuccess();
          }
        }
      );

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        isRealtimeSubscribed = true;
        if (fallbackTimeout) {
          clearTimeout(fallbackTimeout);
          fallbackTimeout = null;
        }
        console.log('[Realtime Connection Secured] Realtime 채널이 정상 수립되었습니다. 무료 플랜 한도를 지키기 위해 폴링 요청을 완전히 절약합니다.');
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      }
    });

    // 2. Realtime 연결이 3초 이내에 수립되지 않으면 백업용 폴백 Polling 가동
    fallbackTimeout = setTimeout(() => {
      if (!isRealtimeSubscribed) {
        startPollingFallback();
      }
    }, 3000);

    return () => {
      supabase.removeChannel(channel);
      if (fallbackTimeout) clearTimeout(fallbackTimeout);
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [activeRequest, success]);

  const triggerSuccess = () => {
    setSuccess(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (pollingRef.current) clearInterval(pollingRef.current);
  };

  const handleExpire = async () => {
    try {
      await supabase
        .from('deposit_requests')
        .update({ status: 'expired' })
        .eq('id', activeRequest?.id);

      setActiveRequest(prev => prev ? { ...prev, status: 'expired' } : null);
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateCharge = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const response = await fetch('/api/payments/charge', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify({
          amount: parseFloat(amount),
          method,
          fromWallet: method !== 'gcash' ? solanaWallet : null
        })
      });

      const resData = await response.json();

      if (!response.ok) {
        throw new Error(resData.error || 'Failed to create request');
      }

      setActiveRequest(resData.data);
      setTimeLeft(180);
      setSuccess(false);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error occurred');
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="p-4 max-w-md mx-auto space-y-6">
      <header className="flex items-center gap-3">
        <button 
          onClick={() => {
            if (activeRequest) {
              setActiveRequest(null);
            } else {
              router.push('/settings');
            }
          }}
          className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-black text-slate-900">{getT('title')}</h1>
          <p className="text-xs text-slate-500 font-medium">{getT('subtitle')}</p>
        </div>
      </header>

      {!activeRequest ? (
        <form onSubmit={handleCreateCharge} className="space-y-6 bg-white p-5 border border-slate-100 rounded-3xl shadow-sm">
          {errorMsg && (
            <div className="p-3 bg-red-50 text-red-600 rounded-2xl flex items-center gap-2 text-xs font-semibold">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700">{getT('methodSelect')}</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setMethod('gcash')}
                className={`p-3 rounded-2xl border text-center font-bold text-xs flex flex-col items-center justify-center gap-2 transition ${method === 'gcash' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-100 bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
              >
                <Smartphone className="w-5 h-5" />
                <span>GCash</span>
              </button>
              <button
                type="button"
                onClick={() => setMethod('solana_usdt')}
                className={`p-3 rounded-2xl border text-center font-bold text-xs flex flex-col items-center justify-center gap-2 transition ${method === 'solana_usdt' ? 'border-green-600 bg-green-50 text-green-700' : 'border-slate-100 bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
              >
                <Coins className="w-5 h-5" />
                <span>USDT</span>
              </button>
              <button
                type="button"
                onClick={() => setMethod('solana_usdc')}
                className={`p-3 rounded-2xl border text-center font-bold text-xs flex flex-col items-center justify-center gap-2 transition ${method === 'solana_usdc' ? 'border-cyan-600 bg-cyan-50 text-cyan-700' : 'border-slate-100 bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
              >
                <Coins className="w-5 h-5" />
                <span>USDC</span>
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700">{getT('amountInput')}</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-slate-400 text-lg">
                {method === 'gcash' ? '₱' : '$'}
              </span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                required
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl focus:bg-white focus:border-slate-300 outline-none text-slate-900 font-black text-lg transition"
              />
            </div>
          </div>

          {method !== 'gcash' && (
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700">{getT('solanaWalletInput')}</label>
              <input
                type="text"
                value={solanaWallet}
                onChange={(e) => setSolanaWallet(e.target.value)}
                placeholder="Phantom 지갑 주소 입력"
                required
                className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl focus:bg-white focus:border-slate-300 outline-none text-xs text-slate-900 font-mono transition"
              />
              <p className="text-[10px] text-slate-400 font-medium leading-normal">{getT('solanaWalletHint')}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-sm flex items-center justify-center gap-2 hover:bg-slate-800 transition disabled:bg-slate-300 cursor-pointer"
          >
            <span>{loading ? getT('processing') : getT('submitBtn')}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>
      ) : (
        <div className="space-y-6">
          {/* 타이머 및 상태 안내 배너 */}
          <div className={`p-5 rounded-3xl border text-center transition ${success ? 'bg-green-50 border-green-200 text-green-800' : activeRequest.status === 'expired' ? 'bg-red-50 border-red-200 text-red-800' : 'bg-slate-900 border-slate-800 text-white shadow-lg'}`}>
            {success ? (
              <div className="space-y-1">
                <h3 className="font-black text-lg">{getT('successTitle')}</h3>
                <p className="text-xs opacity-90">{getT('successDesc')}</p>
              </div>
            ) : activeRequest.status === 'expired' ? (
              <div className="space-y-1">
                <h3 className="font-black text-lg">{getT('expired')}</h3>
                <p className="text-xs opacity-90">{getT('expiredDesc')}</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-2">
                <div className="flex items-center gap-2 text-xs font-bold bg-slate-800 px-3 py-1.5 rounded-full">
                  <Clock className="w-4 h-4 animate-spin" />
                  <span>{formatTime(timeLeft)}</span>
                </div>
                <div className="text-2xl font-black mt-1">
                  {activeRequest.method === 'gcash' ? `₱${activeRequest.unique_amount.toFixed(2)}` : `$${activeRequest.unique_amount.toFixed(4)}`}
                </div>
                <div className="text-[10px] opacity-80 leading-normal max-w-xs">
                  {activeRequest.method === 'gcash' ? getT('step2DescGcash') : getT('step2DescSolana')}
                </div>
              </div>
            )}
          </div>

          {/* 3단계 진행 상태 체크박스 리스트 */}
          <div className="bg-white p-5 border border-slate-100 rounded-3xl space-y-4 shadow-sm">
            {/* 1단계 */}
            <div className="flex gap-3">
              <div className="mt-0.5 flex-shrink-0">
                <CheckCircle2 className="w-5 h-5 text-green-500 fill-green-50" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900">{getT('step1Title')}</h4>
                <p className="text-[10px] text-slate-500 font-medium leading-normal mt-0.5">{getT('step1Desc')}</p>
              </div>
            </div>

            {/* 2단계 */}
            <div className="flex gap-3 border-t border-slate-50 pt-4">
              <div className="mt-0.5 flex-shrink-0">
                {success ? (
                  <CheckCircle2 className="w-5 h-5 text-green-500 fill-green-50" />
                ) : activeRequest.status === 'expired' ? (
                  <AlertCircle className="w-5 h-5 text-red-500" />
                ) : (
                  <div className="w-5 h-5 rounded-full border-2 border-slate-200 border-t-slate-800 animate-spin" />
                )}
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900">{getT('step2Title')}</h4>
                <p className="text-[10px] text-slate-500 font-medium leading-normal mt-0.5">
                  {activeRequest.method === 'gcash' 
                    ? `GCash: 0917-123-4567 • ₱${activeRequest.unique_amount.toFixed(2)} 송금 대기`
                    : `Solana: DtU5yJp3aK7wPqS9dMef... • $${activeRequest.unique_amount.toFixed(4)} 송금 대기`}
                </p>
              </div>
            </div>

            {/* 3단계 */}
            <div className="flex gap-3 border-t border-slate-50 pt-4">
              <div className="mt-0.5 flex-shrink-0">
                {success ? (
                  <CheckCircle2 className="w-5 h-5 text-green-500 fill-green-50" />
                ) : (
                  <div className="w-5 h-5 rounded-full border-2 border-slate-200" />
                )}
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900">{getT('step3Title')}</h4>
                <p className="text-[10px] text-slate-500 font-medium leading-normal mt-0.5">{getT('step3Desc')}</p>
              </div>
            </div>
          </div>

          {/* 수동 영수증 업로드 & 코인 네트워크 경고 안내 카드 */}
          {!success && activeRequest && activeRequest.status !== 'expired' && (
            activeRequest.method === 'gcash' ? (
              <div className="bg-white p-5 border border-slate-100 rounded-3xl space-y-4 shadow-sm">
                <div className="flex items-center gap-2 text-slate-900 font-bold text-xs">
                  <Camera className="w-4 h-4 text-blue-500" />
                  <span>{getT('upload_proof_title')}</span>
                </div>
                
                <p className="text-[10px] text-slate-500 font-medium leading-relaxed bg-blue-50 p-3 rounded-2xl border border-blue-100/50">
                  {getT('gcash_screenshot_desc')}
                </p>

                {/* Proof Image Upload / Preview */}
                <div className="space-y-3 pt-2">
                  {activeRequest.proof_image_url ? (
                    <div className="space-y-2">
                      <div className="relative aspect-video rounded-2xl overflow-hidden border border-slate-200 shadow-inner bg-slate-50">
                        <img 
                          src={activeRequest.proof_image_url} 
                          alt="GCash Proof" 
                          className="w-full h-full object-contain"
                        />
                      </div>
                      <button 
                        type="button"
                        onClick={() => setIsProofModalOpen(true)}
                        className="flex items-center justify-center gap-1.5 w-full h-11 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl font-bold text-xs transition-all border border-slate-200 cursor-pointer"
                      >
                        <Camera className="w-4 h-4" />
                        <span>{getT('view_proof')}</span>
                      </button>
                    </div>
                  ) : proofPreview ? (
                    /* 파일이 선택되었으나 업로드되지 않은 대기 상태 */
                    <div className="space-y-3 p-3 rounded-2xl border border-blue-500/20 bg-blue-500/5">
                      <p className="text-[10px] font-bold text-blue-500 uppercase tracking-wide text-center">
                        {getT('upload_proof_preview_title')}
                      </p>
                      <div className="relative aspect-video rounded-xl overflow-hidden border border-blue-500/10 shadow-inner bg-slate-100">
                        <img 
                          src={proofPreview} 
                          alt="Proof Preview" 
                          className="w-full h-full object-contain"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setProofFile(null);
                            setProofPreview(null);
                          }}
                          className="flex-1 h-11 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold rounded-2xl transition"
                          disabled={uploadingProof}
                        >
                          {getT('cancel_select')}
                        </button>
                        <button
                          type="button"
                          onClick={handleActualUpload}
                          className="flex-1 h-11 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-2xl shadow-md shadow-blue-500/10 flex items-center justify-center gap-1.5 transition"
                          disabled={uploadingProof}
                        >
                          {uploadingProof ? (
                            <>
                              <Clock className="w-3.5 h-3.5 animate-spin" />
                              <span>{getT('uploading_proof')}</span>
                            </>
                          ) : (
                            <>
                              <Plus className="w-3.5 h-3.5" />
                              <span>{getT('upload_submit_btn')}</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* 아직 파일을 고르지 않은 상태 */
                    <div>
                      <label className="flex flex-col items-center justify-center gap-2.5 w-full h-28 border-2 border-dashed border-slate-200 hover:border-blue-500 hover:bg-blue-500/5 rounded-2xl cursor-pointer transition bg-slate-50">
                        <input 
                          type="file" 
                          accept="image/*" 
                          className="hidden" 
                          onChange={handleFileChange} 
                        />
                        <div className="flex flex-col items-center gap-1">
                          <Plus className="w-6 h-6 text-slate-400" />
                          <span className="text-xs text-slate-500 font-bold">{getT('select_image_btn')}</span>
                        </div>
                      </label>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Solana Network Warning Banner */
              <div className="bg-amber-500/10 border border-amber-500/20 p-5 rounded-3xl space-y-2">
                <div className="flex items-center gap-2 text-amber-800 font-bold text-xs">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>네트워크 선택 필수 안내 (Solana Network Only)</span>
                </div>
                <p className="text-[10px] text-amber-700 font-medium leading-relaxed">
                  개인 지갑(Phantom, Trust 등) 또는 거래소(Upbit, Binance 등)에서 입금 시, 반드시 전송 네트워크를 <strong>솔라나(Solana / SPL)</strong>로 선택하셔야 입금이 정상 감지됩니다. 타 네트워크로 송금 시 자산이 분실될 수 있으니 꼭 유의해 주세요.
                </p>
              </div>
            )
          )}

          {/* 초보자용 비전공자 가이드 카드 */}
          <div className="bg-slate-50 p-5 rounded-3xl border border-slate-100 space-y-2">
            <div className="flex items-center gap-2 text-slate-800 font-bold text-xs">
              <Info className="w-4 h-4 flex-shrink-0" />
              <span>{getT('infoTitle')}</span>
            </div>
            <p className="text-[10px] text-slate-600 font-medium leading-relaxed">{getT('infoContent')}</p>
          </div>

          {success && (
            <button
              onClick={() => {
                setActiveRequest(null);
                setSuccess(false);
                router.push('/settings');
              }}
              className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-sm text-center block hover:bg-slate-800 transition"
            >
              {getT('goBack')}
            </button>
          )}
        </div>
      )}

      {/* 제출한 입금증 보기 모달창 */}
      {isProofModalOpen && activeRequest?.proof_image_url && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div 
            onClick={() => setIsProofModalOpen(false)}
            className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm transition-opacity"
          ></div>
          <div className="relative w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[32px] shadow-2xl p-6 overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-black text-slate-900 dark:text-white">제출된 입금증 영수증</h3>
              <button 
                onClick={() => setIsProofModalOpen(false)}
                className="p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="relative aspect-[3/4] w-full rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-inner bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
              <img 
                src={activeRequest.proof_image_url} 
                alt="Submitted Receipt" 
                className="w-full h-full object-contain"
              />
            </div>
            <button
              type="button"
              onClick={() => setIsProofModalOpen(false)}
              className="w-full h-12 bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-slate-200 text-white dark:text-slate-900 rounded-2xl font-bold text-xs transition cursor-pointer"
            >
              {getT('close')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
