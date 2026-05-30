"use client";

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Plus, 
  FileText, 
  Calendar, 
  CreditCard, 
  ChevronRight, 
  ChevronLeft, 
  Search, 
  Filter,
  Users,
  History as HistoryIcon,
  ShieldCheck,
  ShieldAlert,
  Camera,
  Signature,
  Store,
  Wallet,
  CheckCircle2,
  Loader2,
  ExternalLink,
  Upload,
  Info,
  Clock,
  AlertTriangle,
  QrCode
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel, SelectSeparator } from '@/components/ui/select';
import { format } from 'date-fns';
import { SignaturePad } from '@/components/ui/signature-pad';
import { Card } from '@/components/ui/card';
import { TierBadge } from '@/components/ui/tier-badge';
import { VerificationGuard } from '@/components/VerificationGuard';
import Link from 'next/link';

interface Debt {
  id: string;
  customer_id: string;
  amount: number;
  description: string;
  status: string;
  due_date: string | null;
  payment_link: string | null;
  signature_data: string | null;
  created_at: string;
  customers?: { name: string, phone: string | null };
}

interface MatchingRequest {
  id: string;
  lender_id: string | null;
  borrower_id: string | null;
  amount: number;
  interest_rate: number;
  status: string;
  type: string;
  created_at: string;
  description?: string;
  due_date?: string;
  overdue_policy?: string;
  poster_profile?: {
    full_name: string;
    trust_tier: string;
    trust_score: number;
    is_verified: boolean;
  };
}

export default function Transactions() {
  const { user, profile, t } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<'marketplace' | 'history'>('marketplace');
  const [feeRate, setFeeRate] = useState<number>(0.01);
  const [matchingType, setMatchingType] = useState<'borrower' | 'lender'>('borrower');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [debts, setDebts] = useState<Debt[]>([]);
  const [requests, setRequests] = useState<MatchingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [isTransactionOpen, setIsTransactionOpen] = useState(false);
  const [isPostModalOpen, setIsPostModalOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<MatchingRequest | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);
  
  // Filter & Sort State
  const [sortAmount, setSortAmount] = useState<'asc' | 'desc' | null>(null);
  const [sortInterest, setSortInterest] = useState<'asc' | 'desc' | null>(null);
  
  // Transaction Steps
  const [txStep, setTxStep] = useState(1); // 1: Details, 2: ID Upload, 3: Mutual Sign
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [interestRate, setInterestRate] = useState('0');
  const [overduePolicy, setOverduePolicy] = useState('연체 시 필리핀 법정 지연이자율 연 6% 이하 부과');
  const [policyType, setPolicyType] = useState('1');
  const [customPolicy, setCustomPolicy] = useState('');
  const [lenderSignature, setLenderSignature] = useState<string | null>(null);
  const [borrowerSignature, setBorrowerSignature] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // GCash Payment State
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [payingLoan, setPayingLoan] = useState<any>(null);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [paymentResult, setPaymentResult] = useState<any>(null);

  // New GCash Screenshot States
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [gcashReference, setGcashReference] = useState('');
  const [amountClaimed, setAmountClaimed] = useState('');
  const [depositedAt, setDepositedAt] = useState('');
  const [isUploadingProof, setIsUploadingProof] = useState(false);
  const [isConfirmingProof, setIsConfirmingProof] = useState(false);

  // Additional Payment Options (GCash vs Coin)
  const [paymentMethod, setPaymentMethod] = useState<'gcash' | 'coin'>('gcash');
  const [walletAddress, setWalletAddress] = useState('');
  const [coinType, setCoinType] = useState<'usdt' | 'usdc'>('usdt');

  // Flexible Due Date State
  const [dueDateType, setDueDateType] = useState<'fixed' | 'period'>('period');
  const [isAdjustable, setIsAdjustable] = useState(false);
  const [periodValue, setPeriodValue] = useState('30'); // '1'~'31', '30'(1개월), '60'(2개월), '90'(3개월), 'custom'
  const [customPeriodDays, setCustomPeriodDays] = useState('');

  // ID Photos
  const [idPhotos, setIdPhotos] = useState<Record<string, { file: File | null; preview: string | null }>>({
    front1: { file: null, preview: null },
    back1: { file: null, preview: null },
    front2: { file: null, preview: null },
    back2: { file: null, preview: null }
  });
  const [isUploadingPhotos, setIsUploadingPhotos] = useState(false);

  const handlePhotoCapture = (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const preview = URL.createObjectURL(file);
      setIdPhotos(prev => ({ ...prev, [id]: { file, preview } }));
    }
  };

  const fetchMarketplace = async () => {
    setLoading(true);
    try {
      // In this system:
      // 'borrower' tab shows requests (posted by borrowers, lender_id is null)
      // 'lender' tab shows offers (posted by lenders, borrower_id is null)
      
      let query;

      if (matchingType === 'borrower') {
        query = supabase
          .from('matching_requests')
          .select(`
            *,
            poster_profile:profiles!matching_requests_borrower_id_fkey(full_name, trust_tier, trust_score, is_verified)
          `)
          .eq('status', 'pending')
          .is('lender_id', null);
      } else {
        query = supabase
          .from('matching_requests')
          .select(`
            *,
            poster_profile:profiles!matching_requests_lender_id_fkey(full_name, trust_tier, trust_score, is_verified)
          `)
          .eq('status', 'pending')
          .is('borrower_id', null);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;
      setRequests(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const resetTransactionForm = () => {
    setAmount('');
    setDescription('');
    setDueDate('');
    setInterestRate('0');
    setOverduePolicy('연체 시 필리핀 법정 지연이자율 연 6% 이하 부과');
    setPolicyType('1');
    setCustomPolicy('');
    setLenderSignature(null);
    setBorrowerSignature(null);
    setTxStep(1);
    setIsTransactionOpen(false);
    setSelectedRequest(null);
    setIdPhotos({
      front1: { file: null, preview: null },
      back1: { file: null, preview: null },
      front2: { file: null, preview: null },
      back2: { file: null, preview: null }
    });
    setDueDateType('period');
    setIsAdjustable(false);
  };

  const resetGCashPaymentForm = () => {
    setProofFile(null);
    setProofPreview(null);
    setGcashReference('');
    setAmountClaimed('');
    setDepositedAt('');
    setPayingLoan(null);
    setPaymentMethod('gcash');
    setWalletAddress('');
    setCoinType('usdt');
  };



  const handleStartTransaction = (req: MatchingRequest) => {
    setSelectedRequest(req);
    setAmount(req.amount.toString());
    setInterestRate((req.interest_rate || 0).toString());
    setOverduePolicy(req.overdue_policy || '연체 시 매일 1% 연체료 부과');
    setDescription(req.description || '');
    setDueDate(req.due_date || '');
    setPolicyType(req.overdue_policy ? 'custom' : '1');
    setCustomPolicy(req.overdue_policy || '');
    setTxStep(1);
    setIsTransactionOpen(true);
  };

  const handleCreatePost = async () => {
    if (!amount) {
      toast.error('원금 금액을 입력해주세요.');
      return;
    }
    
    setIsSubmitting(true);
    try {
      const parsedAmount = parseFloat(amount);
      const parsedInterest = parseFloat(interestRate || '0');
      
      if (parsedInterest > 6) {
        toast.error('필리핀 법정 연 이자율 제한에 따라 이자율은 최대 6%까지만 설정 가능합니다.');
        setIsSubmitting(false);
        return;
      }

      // 연체약정 미납 규정 법적 이율 연 6% 준수 여부 이중 보안 검증
      if (policyType === 'custom') {
        const overdueRegex = /(\d+(?:\.\d+)?)\s*(?:%|percent|퍼센트|이자|연체)/gi;
        let isOverdueViolated = false;
        let match;
        while ((match = overdueRegex.exec(overduePolicy || '')) !== null) {
          const val = parseFloat(match[1]);
          if (val > 6) {
            isOverdueViolated = true;
            break;
          }
        }
        if (isOverdueViolated) {
          toast.error('필리핀 법정 상한 금리 규칙에 따라, 미납 시 연체 지연이율 또한 최대 연 6%를 초과할 수 없습니다.');
          setIsSubmitting(false);
          return;
        }
      }
      
      const isBorrower = matchingType === 'borrower';
      
      let calculatedDueDate: string | null = null;
      let durationText = '';

      if (dueDateType === 'fixed') {
        calculatedDueDate = dueDate || null;
      } else {
        // period 방식
        let daysToAdd = 30; // 기본값 30일 (1개월)
        if (periodValue === 'custom') {
          const customDays = parseInt(customPeriodDays || '30', 10);
          daysToAdd = isNaN(customDays) || customDays <= 0 ? 30 : customDays;
          durationText = `${daysToAdd}일`;
        } else {
          const pVal = parseInt(periodValue, 10);
          daysToAdd = isNaN(pVal) ? 30 : pVal;
          if (periodValue === '30') durationText = '1개월';
          else if (periodValue === '60') durationText = '2개월';
          else if (periodValue === '90') durationText = '3개월';
          else durationText = `${daysToAdd}일`;
        }

        // 오늘 기준으로 일수 더하기
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + daysToAdd);
        calculatedDueDate = targetDate.toISOString().split('T')[0]; // YYYY-MM-DD 포맷
      }

      // 설명 문구에 기일 정보 및 조정 가능 옵션을 접두어로 조립
      let finalDescription = description || '';
      let badgePrefix = '';
      if (dueDateType === 'period') {
        badgePrefix = `[만기: ${durationText} 이내`;
        if (isAdjustable) {
          badgePrefix += ' / 기일 조정 가능';
        }
        badgePrefix += '] ';
      } else {
        if (isAdjustable) {
          badgePrefix = '[기일 조정 가능 ';
        }
      }
      
      finalDescription = badgePrefix + finalDescription;

      const { data, error } = await supabase
        .from('matching_requests')
        .insert([{
          amount: parsedAmount,
          interest_rate: parsedInterest,
          description: finalDescription || null,
          due_date: calculatedDueDate,
          overdue_policy: overduePolicy || null,
          status: 'pending',
          type: matchingType,
          borrower_id: isBorrower ? user?.id : null,
          lender_id: !isBorrower ? user?.id : null
        }])
        .select();

      if (error) throw error;

      toast.success('공고가 성공적으로 마켓플레이스에 등록되었습니다.');
      setIsPostModalOpen(false);
      resetTransactionForm();
      fetchMarketplace();
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || '공고 등록 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateTransaction = async () => {
    if (!amount || !lenderSignature || !borrowerSignature) {
      toast.error(t('complete_all_fields'));
      return;
    }
    
    setIsSubmitting(true);
    setIsUploadingPhotos(true);
    try {
      // 1. Upload ID Photos
      const uploadedUrls: Record<string, string> = {};
      const bucket = 'id-verification';
      
      for (const [key, photo] of Object.entries(idPhotos)) {
        if (photo.file) {
          const fileExt = photo.file.name.split('.').pop();
          const fileName = `${user?.id}-${Date.now()}-${key}.${fileExt}`;
          const { data, error: uploadError } = await supabase.storage
            .from(bucket)
            .upload(fileName, photo.file, { upsert: true });
            
          if (uploadError) {
            console.error('Upload error:', uploadError);
          } else if (data) {
            const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(data.path);
            uploadedUrls[key] = publicUrl;
          }
        }
      }
      setIsUploadingPhotos(false);

      // 2. Update matching request status
      await supabase
        .from('matching_requests')
        .update({ status: 'completed' })
        .eq('id', selectedRequest?.id);

      // 3. Create actual loan record
      const isUserLender = matchingType === 'borrower';
      const calcRepayAmount = parseFloat(amount) * (1 + parseFloat(interestRate || '0') / 100);
      const extendedDescription = `${description || t('matching_marketplace')} (이율: ${interestRate}%, 연체규정: ${overduePolicy})`;
      
      const { data, error } = await supabase
        .from('loans')
        .insert([{
          lender_id: isUserLender ? user?.id : selectedRequest?.lender_id,
          borrower_id: isUserLender ? selectedRequest?.borrower_id : user?.id,
          amount: parseFloat(amount),
          repay_amount: calcRepayAmount,
          description: extendedDescription,
          due_date: dueDate || null,
          status: 'pending',
          signature_data: JSON.stringify({ lender: lenderSignature, borrower: borrowerSignature }),
          verification_evidence: { 
            timestamp: new Date().toISOString(),
            method: 'Mobile Identity Capture',
            id_count: 2,
            photos_captured: Object.keys(uploadedUrls).length,
            photos: uploadedUrls,
            interest_rate: parseFloat(interestRate || '0'),
            overdue_policy: overduePolicy
          }
        }])
        .select()
        .single();

      if (error) throw error;
      
      toast.success(t('post_created'));
      setIsTransactionOpen(false);
      resetTransactionForm();
      setActiveTab('history');
      fetchLoans();
    } catch (error: any) {
      toast.error(error.message || t('error_occurred'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const fetchLoans = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('loans')
        .select(`
          *,
          lender:profiles!loans_lender_id_fkey(full_name, phone, gcash_qr_url, gcash_number, solana_wallet),
          borrower:profiles!loans_borrower_id_fkey(full_name),
          payment_proofs(*)
        `)
        .or(`lender_id.eq.${user?.id},borrower_id.eq.${user?.id}`)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDebts(data || []);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchFeeRate = async () => {
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'credit_fee_rate')
        .single();
      if (data && data.value) {
        setFeeRate(parseFloat(data.value));
      }
    } catch (err) {
      console.error('Error fetching fee rate:', err);
    }
  };

  useEffect(() => {
    fetchFeeRate();
    if (user) {
      if (activeTab === 'history') {
        fetchLoans();
      } else {
        fetchMarketplace();
      }
    }
  }, [user, activeTab, matchingType]);

  if (!mounted) return null;

  // GCash Payment Handler
  const handleGCashPayment = async (loan: any) => {
    setPayingLoan(loan);
    setAmountClaimed(Number(loan.repay_amount).toString());
    
    // Format current local datetime to YYYY-MM-DDTHH:MM for input datetime-local
    const now = new Date();
    const tzOffset = now.getTimezoneOffset() * 60000;
    const localISOTime = (new Date(now.getTime() - tzOffset)).toISOString().slice(0, 16);
    setDepositedAt(localISOTime);
    
    setProofFile(null);
    setProofPreview(null);
    setGcashReference('');
    setPaymentResult(null);
    setIsPaymentOpen(true);
  };

  const processGCashPayment = async () => {
    if (!payingLoan || !user) return;
    
    if (!proofFile) {
      toast.error('송금 완료 영수증 스크린샷을 첨부해 주세요.');
      return;
    }
    
    if (paymentMethod === 'gcash') {
      if (!gcashReference || gcashReference.trim().length < 8) {
        toast.error('참조번호를 8자리 이상 정확하게 입력해 주세요.');
        return;
      }
    } else {
      if (!walletAddress || walletAddress.trim().length < 10) {
        toast.error('송금하신 본인의 지갑 주소 또는 거래소 주소를 정확하게 입력해 주세요.');
        return;
      }
    }
    
    if (!amountClaimed || parseFloat(amountClaimed) <= 0) {
      toast.error('실제 입금한 금액을 입력해 주세요.');
      return;
    }
    
    if (!depositedAt) {
      toast.error('송금 완료 시각을 선택해 주세요.');
      return;
    }

    setIsUploadingProof(true);

    try {
      // 1. Upload file to Supabase Storage payment-proofs bucket
      const fileExt = proofFile.name.split('.').pop();
      const fileName = `${user.id}_${Date.now()}.${fileExt}`;
      const filePath = `${payingLoan.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('payment-proofs')
        .upload(filePath, proofFile, { upsert: true });

      if (uploadError) {
        throw new Error(`이미지 업로드에 실패했습니다: ${uploadError.message}`);
      }

      // 2. Get Public URL
      const { data: { publicUrl } } = supabase.storage
        .from('payment-proofs')
        .getPublicUrl(filePath);

      // 3. Insert row to payment_proofs
      const { error: dbError } = await supabase
        .from('payment_proofs')
        .insert([{
          loan_id: payingLoan.id,
          submitter_id: user.id,
          screenshot_url: publicUrl,
          gcash_reference: paymentMethod === 'gcash' ? gcashReference.trim() : `Coin: ${coinType.toUpperCase()}`,
          amount_claimed: parseFloat(amountClaimed),
          deposited_at: new Date(depositedAt).toISOString(),
          status: 'submitted',
          auto_confirm_deadline: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          payment_method: paymentMethod,
          wallet_address: paymentMethod === 'coin' ? walletAddress.trim() : null
        }]);

      if (dbError) {
        throw dbError;
      }

      // 4. Send real-time notification
      const methodLabel = paymentMethod === 'gcash' ? 'GCash' : `${coinType.toUpperCase()} 코인`;
      await supabase
        .from('notifications')
        .insert({
          user_id: payingLoan.lender_id,
          title: '상환 증빙 자료 제출',
          message: `${profile?.full_name || '채무자'}님이 ${methodLabel} 상환 증빙(PHP ${Number(amountClaimed).toLocaleString()})을 제출했습니다. 확인 후 승인해 주세요.`,
          type: 'payment'
        });

      toast.success('증빙이 제출되었습니다. 채권자 최종 확인 또는 1시간 후 자동 상환 처리됩니다.');
      setIsPaymentOpen(false);
      resetGCashPaymentForm();
      fetchLoans();
    } catch (err: any) {
      console.error('Payment proof error:', err);
      toast.error(err.message || '상환 증빙 제출 중 오류가 발생했습니다.');
    } finally {
      setIsUploadingProof(false);
    }
  };

  const handleConfirmPaymentProof = async (proofId: string, action: 'confirm' | 'reject') => {
    setIsConfirmingProof(true);
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/confirm-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proof_id: proofId,
          confirmer_id: user?.id,
          action: action
        })
      });

      const result = await response.json();

      if (response.ok && result.success) {
        if (action === 'confirm') {
          toast.success('입금 확인 및 상환 승인이 최종 완료되었습니다.');
        } else {
          toast.success('상환 증빙이 거절 및 반려 처리되었습니다.');
        }
        fetchLoans();
      } else {
        toast.error(result.error || '처리 중 오류가 발생했습니다.');
      }
    } catch (err: any) {
      console.error('Lender confirm error:', err);
      toast.error('서버 연결 중 오류가 발생했습니다. 다시 시도해 주세요.');
    } finally {
      setIsConfirmingProof(false);
    }
  };

  // Filter and Sort Requests
  const filteredRequests = requests
    .filter(req => {
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase().trim();
      const nameMatch = req.poster_profile?.full_name?.toLowerCase().includes(query) || false;
      const descMatch = req.description?.toLowerCase().includes(query) || false;
      const amountMatch = req.amount.toString().includes(query);
      return nameMatch || descMatch || amountMatch;
    })
    .sort((a, b) => {
      if (sortAmount) {
        return sortAmount === 'asc' ? a.amount - b.amount : b.amount - a.amount;
      }
      if (sortInterest) {
        const aRate = a.interest_rate || 0;
        const bRate = b.interest_rate || 0;
        return sortInterest === 'asc' ? aRate - bRate : bRate - aRate;
      }
      return 0;
    });

  return (
    <div className="p-2 space-y-3 pb-8 max-w-lg mx-auto">
      <header className="space-y-2">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-black dark:text-white leading-tight">
            {t('debts')}
          </h1>
          <div className="flex bg-slate-100 dark:bg-white/5 p-1 rounded-xl backdrop-blur-sm">
            <button 
              onClick={() => setActiveTab('marketplace')}
              className={`px-3.5 py-1.5 rounded-lg text-[10px] font-black transition-all duration-300 flex items-center gap-1.5 ${activeTab === 'marketplace' ? 'bg-white dark:bg-blue-600 shadow-md text-blue-600 dark:text-white' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Users className="w-3.5 h-3.5" />
              {t('marketplace')}
            </button>
            <button 
              onClick={() => setActiveTab('history')}
              className={`px-3.5 py-1.5 rounded-lg text-[10px] font-black transition-all duration-300 flex items-center gap-1.5 ${activeTab === 'history' ? 'bg-white dark:bg-blue-600 shadow-md text-blue-600 dark:text-white' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <HistoryIcon className="w-3.5 h-3.5" />
              {t('history')}
            </button>
          </div>
        </div>

        {activeTab === 'marketplace' && (
          <div className="space-y-2.5 animate-in fade-in slide-in-from-top-1 duration-300">
            <div className="flex gap-1.5">
              <Button 
                variant={matchingType === 'borrower' ? 'default' : 'outline'}
                onClick={() => setMatchingType('borrower')}
                className={`flex-1 rounded-xl font-black h-9 text-xs shadow-sm transition-all ${matchingType === 'borrower' ? 'bg-blue-600 text-white' : 'border-slate-200 dark:border-white/10'}`}
              >
                {t('borrower_list')}
              </Button>
              <Button 
                variant={matchingType === 'lender' ? 'default' : 'outline'}
                onClick={() => setMatchingType('lender')}
                className={`flex-1 rounded-xl font-black h-9 text-xs shadow-sm transition-all ${matchingType === 'lender' ? 'bg-blue-600 text-white' : 'border-slate-200 dark:border-white/10'}`}
              >
                {t('lender_list')}
              </Button>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex gap-1.5">
                <div className="relative flex-1 group">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                  <Input 
                    placeholder="이름, 가게명 또는 금액 검색"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 h-9 text-xs rounded-xl border-slate-200 dark:border-white/5 bg-white dark:bg-white/5 font-bold focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <Button 
                  className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl w-9 h-9 p-0 shadow-md active:scale-95 transition-transform shrink-0 flex items-center justify-center"
                >
                  <Search className="w-4 h-4" />
                </Button>
              </div>

              <Button 
                onClick={() => {
                  resetTransactionForm();
                  setIsPostModalOpen(true);
                }}
                className="w-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-blue-600 dark:hover:bg-blue-600 dark:hover:text-white transition-colors rounded-xl font-black h-9 text-xs shadow-sm active:scale-[0.98] mt-0.5"
              >
                <Plus className="w-4 h-4 mr-0.5" />
                {matchingType === 'borrower' ? '외상 요청 공고 등록하기' : '외상 제공 공고 등록하기'}
              </Button>

              {/* Sorting Chips */}
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setSortAmount(prev => prev === 'asc' ? null : 'asc')}
                  className={`px-2.5 py-1 text-[10px] font-bold rounded-full transition-all border ${sortAmount === 'asc' ? 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-500/20 dark:text-blue-400 dark:border-blue-500/30' : 'bg-slate-50 text-slate-500 border-slate-200 dark:bg-white/5 dark:text-slate-400 dark:border-white/10'}`}
                >
                  낮은 금액순                </button>
                <button
                  onClick={() => setSortAmount(prev => prev === 'desc' ? null : 'desc')}
                  className={`px-2.5 py-1 text-[10px] font-bold rounded-full transition-all border ${sortAmount === 'desc' ? 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-500/20 dark:text-blue-400 dark:border-blue-500/30' : 'bg-slate-50 text-slate-500 border-slate-200 dark:bg-white/5 dark:text-slate-400 dark:border-white/10'}`}
                >
                  높은 금액순                </button>
                <button
                  onClick={() => setSortInterest(prev => prev === 'asc' ? null : 'asc')}
                  className={`px-2.5 py-1 text-[10px] font-bold rounded-full transition-all border ${sortInterest === 'asc' ? 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-500/20 dark:text-blue-400 dark:border-blue-500/30' : 'bg-slate-50 text-slate-500 border-slate-200 dark:bg-white/5 dark:text-slate-400 dark:border-white/10'}`}
                >
                  낮은 이자율순                </button>
                <button
                  onClick={() => setSortInterest(prev => prev === 'desc' ? null : 'desc')}
                  className={`px-2.5 py-1 text-[10px] font-bold rounded-full transition-all border ${sortInterest === 'desc' ? 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-500/20 dark:text-blue-400 dark:border-blue-500/30' : 'bg-slate-50 text-slate-500 border-slate-200 dark:bg-white/5 dark:text-slate-400 dark:border-white/10'}`}
                >
                  높은 이자율순                </button>
              </div>
            </div>
          </div>
        )}
      </header>

      <div className="space-y-2.5">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 space-y-2">
            <div className="w-8 h-8 border-3 border-blue-600/20 border-t-blue-600 rounded-full animate-spin"></div>
            <p className="text-slate-400 font-bold text-xs">{t('loading')}</p>
          </div>
        ) : activeTab === 'marketplace' ? (
          filteredRequests.length > 0 ? (
            filteredRequests.map(req => {
              const totalRepayment = Number(req.amount) * (1 + Number(req.interest_rate || 0) / 100);
              return (
                <Card key={req.id} className="p-3 border-slate-100 dark:border-white/5 bg-white dark:bg-slate-900/50 rounded-xl hover:shadow-lg transition-all group border-b-2 border-b-slate-100 dark:border-b-white/5 animate-in fade-in duration-200 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-500/10 dark:to-blue-500/5 flex items-center justify-center text-base font-black text-blue-600 dark:text-blue-400 shadow-inner">
                        {req.poster_profile?.full_name?.charAt(0) || <Store className="w-6 h-6" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h3 className="font-bold text-sm dark:text-white leading-tight">{req.poster_profile?.full_name}</h3>
                          {req.poster_profile?.trust_tier && <TierBadge tier={req.poster_profile.trust_tier} />}
                        </div>
                        <p className="text-[10px] text-slate-400 font-bold">
                          공고일: {format(new Date(req.created_at), 'yyyy-MM-dd')}
                        </p>
                      </div>
                    </div>
                    <Button 
                      onClick={() => handleStartTransaction(req)}
                      className="bg-slate-900 dark:bg-white dark:text-slate-950 hover:bg-blue-600 hover:text-white dark:hover:bg-blue-600 transition-colors rounded-xl font-black px-3.5 h-9 text-xs shadow-md active:scale-95 shrink-0"
                    >
                      {t('transact')}
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5">
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">원금</p>
                      <p className="font-bold text-slate-800 dark:text-slate-200 text-xs">PHP {Number(req.amount).toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">이자율</p>
                      <p className="font-bold text-blue-600 dark:text-blue-400 text-xs">{req.interest_rate || 0}%</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">만기 시 상환액</p>
                      <p className="font-black text-slate-900 dark:text-white text-xs">PHP {totalRepayment.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">만기일</p>
                      <p className="font-bold text-rose-500 dark:text-rose-400 text-xs">
                        {req.due_date ? format(new Date(req.due_date), 'yyyy-MM-dd') : '-'}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-1 px-1 border-t border-dashed border-slate-100 dark:border-white/5 pt-1.5">
                    {req.description && (
                      <div className="flex gap-1.5 text-[11px]">
                        <span className="font-bold text-slate-400 shrink-0">거래 설명:</span>
                        <span className="font-bold text-slate-700 dark:text-slate-300">{req.description}</span>
                      </div>
                    )}
                    {req.overdue_policy && (
                      <div className="flex gap-1.5 text-[11px]">
                        <span className="font-bold text-rose-400/80 shrink-0">미납 시 규정:</span>
                        <span className="font-bold text-rose-600 dark:text-rose-400">{req.overdue_policy}</span>
                      </div>
                    )}
                  </div>
                </Card>
              );
            })
          ) : (
            <div className="text-center py-24 bg-slate-50 dark:bg-white/5 rounded-[40px] border-2 border-dashed border-slate-200 dark:border-white/10">
              <Users className="w-12 h-12 mx-auto text-slate-300 mb-4" />
              <p className="text-slate-400 font-bold">{t('no_requests')}</p>
            </div>
          )
        ) : (
          debts.length > 0 ? (
            debts.map((loan: any) => {
              const isLender = loan.lender_id === user?.id;
              const totalRepayment = Number(loan.amount) * (1 + Number(loan.interest_rate || 0) / 100);
              return (
                <Card key={loan.id} className="p-6 border-slate-100 dark:border-white/5 bg-white dark:bg-slate-900/50 rounded-3xl border-b-4 border-b-slate-50 dark:border-b-white/5 animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black shadow-sm ${isLender ? 'bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400' : 'bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400'}`}>
                        <span className="text-xs font-black">{isLender ? 'LEND' : 'BORROW'}</span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-slate-400 uppercase tracking-wider">{isLender ? '빌려준 외상 (채권)' : '빌린 외상 (채무)'}</span>
                        </div>
                        <h3 className="font-black text-lg dark:text-white mt-0.5">
                          {isLender ? loan.borrower?.full_name : loan.lender?.full_name}
                        </h3>
                        <p className="text-[11px] text-slate-400 font-bold">
                          {format(new Date(loan.created_at), 'yyyy-MM-dd HH:mm')}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full shadow-sm inline-block ${loan.status === 'paid' ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400' : 'bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400'}`}>
                        {t(loan.status)}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5">
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">원금</p>
                      <p className="font-extrabold text-slate-800 dark:text-slate-200">PHP {Number(loan.amount).toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">이자율</p>
                      <p className="font-extrabold text-blue-600 dark:text-blue-400">{loan.interest_rate || 0}%</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">만기 시 상환액</p>
                      <p className="font-black text-slate-900 dark:text-white">PHP {totalRepayment.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">만기일</p>
                      <p className="font-extrabold text-rose-500 dark:text-rose-400">
                        {loan.due_date ? format(new Date(loan.due_date), 'yyyy-MM-dd') : '-'}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-1.5 px-1">
                    {loan.description && (
                      <div className="flex gap-2 text-xs">
                        <span className="font-bold text-slate-400 shrink-0">거래 설명:</span>
                        <span className="font-bold text-slate-700 dark:text-slate-300">{loan.description}</span>
                      </div>
                    )}
                    {loan.overdue_policy && (
                      <div className="flex gap-2 text-xs">
                        <span className="font-bold text-rose-400/80 shrink-0">미납 시 규정:</span>
                        <span className="font-bold text-rose-600 dark:text-rose-400">{loan.overdue_policy}</span>
                      </div>
                    )}
                    {loan.status === 'paid' && loan.paid_at && (
                      <div className="flex gap-2 text-xs mt-2 pt-2 border-t border-dashed border-emerald-200 dark:border-emerald-800">
                        <span className="font-bold text-emerald-500 shrink-0">결제 완료:</span>
                        <span className="font-bold text-emerald-700 dark:text-emerald-400">
                          {format(new Date(loan.paid_at), 'yyyy-MM-dd HH:mm')} | {loan.payment_method?.toUpperCase()} | Ref: {loan.payment_reference}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Payment Proof details section */}
                  {(() => {
                    const latestProof = loan.payment_proofs && loan.payment_proofs.length > 0
                      ? loan.payment_proofs[loan.payment_proofs.length - 1]
                      : null;

                    if (!latestProof) return null;

                    return (
                      <div className="mt-4 p-5 rounded-2xl border bg-slate-50/50 dark:bg-white/5 border-slate-100 dark:border-white/5 space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-blue-500" />
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">GCash 결제 증빙</span>
                          </div>
                          <div>
                            <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full shadow-sm inline-block ${
                              latestProof.status === 'submitted' ? 'bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400' :
                              latestProof.status === 'confirmed' || latestProof.status === 'auto_confirmed' ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400' :
                              'bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400'
                            }`}>
                              {latestProof.status === 'submitted' ? '승인 대기중' :
                               latestProof.status === 'confirmed' ? '채권자 승인완료' :
                               latestProof.status === 'auto_confirmed' ? '자동 승인완료' : '거절됨'}
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3.5 text-xs border-t border-dashed border-slate-200 dark:border-white/5 pt-3">
                          <div>
                            <span className="font-bold text-slate-400">GCash 참조 번호:</span>
                            <p className="font-extrabold text-slate-700 dark:text-slate-200 mt-0.5">{latestProof.gcash_reference || '-'}</p>
                          </div>
                          <div>
                            <span className="font-bold text-slate-400">실제 입금액:</span>
                            <p className="font-extrabold text-slate-700 dark:text-slate-200 mt-0.5">PHP {Number(latestProof.amount_claimed).toLocaleString()}</p>
                          </div>
                          <div>
                            <span className="font-bold text-slate-400">입금 시각:</span>
                            <p className="font-extrabold text-slate-700 dark:text-slate-200 mt-0.5">
                              {latestProof.deposited_at ? format(new Date(latestProof.deposited_at), 'yyyy-MM-dd HH:mm') : '-'}
                            </p>
                          </div>
                          <div>
                            <span className="font-bold text-slate-400">제출 시각:</span>
                            <p className="font-extrabold text-slate-700 dark:text-slate-200 mt-0.5">
                              {latestProof.submitted_at ? format(new Date(latestProof.submitted_at), 'yyyy-MM-dd HH:mm') : '-'}
                            </p>
                          </div>
                        </div>

                        {latestProof.status === 'submitted' && (
                          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-500/5 border border-amber-500/10 text-amber-600 dark:text-amber-400">
                            <Clock className="w-4 h-4 mt-0.5 shrink-0" />
                            <div className="text-[11px] font-bold">
                              {isLender 
                                ? '채무자가 송금 완료 영수증을 업로드했습니다. 정보가 올바른지 대조 후 [입금 확정 승인]을 눌러주세요. 1시간 이내 무응답 시 자동 승인됩니다.' 
                                : '송금 완료 후 승인 대기 상태입니다. 채권자 무응답 시 1시간 뒤 시스템에서 자동 승인 및 상환 확정 처리됩니다.'}
                              <p className="mt-1 text-[10px] text-amber-500/80 font-black">
                                자동 승인 예정: {format(new Date(latestProof.auto_confirm_deadline), 'yyyy-MM-dd HH:mm')}
                              </p>
                            </div>
                          </div>
                        )}

                        {latestProof.status === 'rejected' && (
                          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-500/5 border border-rose-500/10 text-rose-600 dark:text-rose-400">
                            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                            <div className="text-[11px] font-bold">
                              ?↔툑 利앸튃??嫄곗젅?섏뿀?듬땲?? ?곸닔利??대?吏? ?낅젰 ?뺣낫瑜??ㅼ떆 ?쒕쾲 ?議고븯???щ컮瑜닿쾶 ?ㅼ떆 ?곹솚???쒕룄??二쇱꽭??
                              승인이 거절되었습니다. 영수증 이미지와 입력 정보를 다시 한번 대조하고 올바르게 다시 상환을 시도해주세요.
                            </div>
                          </div>
                        )}

                        {latestProof.screenshot_url && (
                          <div className="space-y-1.5 pt-1">
                            <span className="font-bold text-slate-400 text-xs">첨부된 GCash 영수증</span>
                            <div className="relative aspect-[4/3] w-full max-w-[200px] rounded-2xl overflow-hidden border border-slate-200 dark:border-white/10 group cursor-pointer shadow-sm">
                              <img 
                                src={latestProof.screenshot_url} 
                                alt="GCash Receipt" 
                                className="w-full h-full object-cover transition-transform group-hover:scale-105"
                                onClick={() => window.open(latestProof.screenshot_url, '_blank')}
                              />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-[10px] font-black transition-opacity">
                                ?ш쾶 蹂닿린
                              </div>
                            </div>
                          </div>
                        )}

                        {isLender && latestProof.status === 'submitted' && (
                          <div className="flex gap-3 pt-2">
                            <Button
                              variant="outline"
                              onClick={() => handleConfirmPaymentProof(latestProof.id, 'reject')}
                              disabled={isConfirmingProof}
                              className="flex-1 h-11 rounded-xl border-rose-200 dark:border-rose-900/50 hover:bg-rose-50 dark:hover:bg-rose-950/20 text-rose-600 font-bold active:scale-95 transition-all text-xs"
                            >
                              반려 (거절)
                            </Button>
                            <Button
                              onClick={() => handleConfirmPaymentProof(latestProof.id, 'confirm')}
                              disabled={isConfirmingProof}
                              className="flex-1 h-11 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black active:scale-95 transition-all text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-500/20"
                            >
                              {isConfirmingProof ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              )}
                              입금 확정 승인
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* GCash Payment Button - borrower only, pending only (not pending validation unless rejected) */}
                  {(() => {
                    const isLender = loan.lender_id === user?.id;
                    const latestProof = loan.payment_proofs && loan.payment_proofs.length > 0
                      ? loan.payment_proofs[loan.payment_proofs.length - 1]
                      : null;

                    // Show pay button if Borrower, status is pending, and there is no active submitted proof (allow if no proof or rejected)
                    const canPay = !isLender && loan.status === 'pending' && (!latestProof || latestProof.status === 'rejected');
                    if (!canPay) return null;

                    return (
                      <Button
                        onClick={() => handleGCashPayment(loan)}
                        className="w-full h-14 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white rounded-2xl font-black text-sm shadow-xl shadow-blue-500/30 active:scale-[0.98] transition-all flex items-center justify-center gap-3"
                      >
                        <Wallet className="w-5 h-5" />
                        GCash로 상환하기 (PHP {Number(loan.repay_amount).toLocaleString()})
                      </Button>
                    );
                  })()}
                </Card>
              );
            })
          ) : (
            <div className="text-center py-24 bg-slate-50 dark:bg-white/5 rounded-[40px] border-2 border-dashed border-slate-200 dark:border-white/10">
              <HistoryIcon className="w-12 h-12 mx-auto text-slate-300 mb-4" />
              <p className="text-slate-400 font-bold">{t('no_debts')}</p>
            </div>
          )
        )}
      </div>



      {/* Transaction Modal */}
      <Dialog open={isTransactionOpen} onOpenChange={setIsTransactionOpen}>
        <DialogContent className="max-w-md w-[95%] h-[85vh] md:h-[75vh] rounded-[32px] dark:bg-slate-950 dark:border-white/5 px-6 pt-8 flex flex-col outline-none overflow-hidden">
          <DialogHeader className="pb-4 shrink-0">
            <div className="flex justify-center mb-4">
              <div className="flex gap-1.5">
                {[1, 2, 3].map(s => (
                  <div key={s} className={`h-1.5 rounded-full transition-all duration-500 ${txStep >= s ? 'w-8 bg-blue-600' : 'w-4 bg-slate-200 dark:bg-white/10'}`} />
                ))}
              </div>
            </div>
            <DialogTitle className="text-2xl font-black dark:text-white text-center">
              {txStep === 1 ? t('new_record') : txStep === 2 ? t('identity_verification') : t('agreement_record')}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto py-6 space-y-8 scrollbar-hide">
            {txStep === 1 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="p-6 bg-gradient-to-br from-blue-600 to-blue-700 rounded-[32px] text-white shadow-xl shadow-blue-500/20 flex items-center gap-5">
                  <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-3xl font-black border border-white/30">
                    {selectedRequest?.poster_profile?.full_name?.charAt(0)}
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80">{t('transacting_with')}</p>
                    <h4 className="text-xl font-black">{selectedRequest?.poster_profile?.full_name}</h4>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="space-y-3">
                    <Label className="font-black text-[10px] uppercase tracking-[0.2em] text-slate-400 px-1">{t('amount')} (원)</Label>
                    <Input 
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                      className="h-16 rounded-2xl text-2xl font-black bg-slate-50 dark:bg-white/5 border-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  
                  <div className="space-y-3">
                    <Label className="font-black text-[10px] uppercase tracking-[0.2em] text-slate-400 px-1">이자율(%)</Label>
                    <Input 
                      type="number"
                      value={interestRate}
                      onChange={(e) => setInterestRate(e.target.value)}
                      placeholder="0"
                      className="h-16 rounded-2xl text-xl font-black bg-slate-50 dark:bg-white/5 border-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div className="space-y-3">
                    <Label className="font-black text-[10px] uppercase tracking-[0.2em] text-slate-400 px-1">만기 시 상환 금액</Label>
                    <div className="h-20 flex flex-col justify-center px-5 rounded-2xl bg-blue-500/10 dark:bg-blue-600/20 border border-blue-500/25">
                      <span className="text-[10px] font-black uppercase tracking-[0.1em] text-blue-600 dark:text-blue-400 mb-0.5">총 상환 금액 (원금 + 이자)</span>
                      <span className="text-2xl font-black text-blue-700 dark:text-blue-300">
                        { (Number(amount || 0) * (1 + Number(interestRate || 0) / 100)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
                      </span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Label className="font-black text-[10px] uppercase tracking-[0.2em] text-slate-400 px-1">기한 후 미납 시 규정 (연체약정)</Label>
                    <Select value={policyType} onValueChange={(value) => {
                      setPolicyType(value);
                      if (value !== 'custom') {
                        const matched = [
                          { id: '1', text: '연체 시 매일 1% 연체료 부과' },
                          { id: '2', text: '연체 시 연 5% 지연이자율 적용' },
                          { id: '3', text: '연체 시 연 24% 법정 지연손해금 적용' }
                        ].find(p => p.id === value);
                        if (matched) setOverduePolicy(matched.text);
                      } else {
                        setOverduePolicy(customPolicy || '직접 입력한 규정');
                      }
                    }}>
                      <SelectTrigger className="h-16 rounded-2xl bg-slate-50 dark:bg-white/5 border-none font-bold focus:ring-2 focus:ring-blue-500">
                        <SelectValue placeholder="미납 시 규정을 선택하세요" />
                      </SelectTrigger>
                      <SelectContent className="rounded-2xl dark:bg-slate-900 border-none shadow-xl">
                        <SelectItem value="1" className="font-bold">연체 시 매일 1% 연체료 부과</SelectItem>
                        <SelectItem value="2" className="font-bold">연체 시 연 5% 지연이자율 적용</SelectItem>
                        <SelectItem value="3" className="font-bold">연체 시 연 24% 법정 지연손해금 적용</SelectItem>
                        <SelectItem value="custom" className="font-bold">직접 입력</SelectItem>
                      </SelectContent>
                    </Select>
                    {policyType === 'custom' && (
                      <Input 
                        value={customPolicy}
                        onChange={(e) => {
                          setCustomPolicy(e.target.value);
                          setOverduePolicy(e.target.value);
                        }}
                        placeholder="지연 시 부과할 규정이나 내용을 직접 입력하세요."
                        className="h-14 mt-2 rounded-2xl bg-slate-50 dark:bg-white/5 border-none font-bold focus:ring-2 focus:ring-blue-500 animate-in fade-in duration-300"
                      />
                    )}
                  </div>

                  <div className="space-y-3">
                    <Label className="font-black text-[10px] uppercase tracking-[0.2em] text-slate-400 px-1">{t('due_date')}</Label>
                    <div className="relative">
                      <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
                      <Input 
                        type="date"
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                        className="h-16 pl-12 rounded-2xl bg-slate-50 dark:bg-white/5 border-none font-bold focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Label className="font-black text-[10px] uppercase tracking-[0.2em] text-slate-400 px-1">{t('description')}</Label>
                    <Input 
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder={t('description_placeholder')}
                      className="h-16 rounded-2xl bg-slate-50 dark:bg-white/5 border-none font-bold focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {(() => {
                    const transactionFee = parseFloat(amount || '0') * feeRate;
                    const currentCredit = profile?.credit ? parseFloat(profile.credit.toString()) : 0;
                    const isZeroCredit = currentCredit <= 0;
                    const isInsufficient = isZeroCredit || (currentCredit < transactionFee);

                    return (
                      <div className={`p-5 rounded-[24px] border ${
                        isInsufficient 
                          ? 'bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400' 
                          : 'bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400'
                      } space-y-2 animate-in slide-in-from-top-2 duration-300`}>
                        <div className="flex items-center justify-between text-xs font-black uppercase tracking-wider">
                          <span>상호 거래 플랫폼 수수료 (양측 각각 {(feeRate * 100).toFixed(1)}%)</span>
                          <span>PHP {transactionFee.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] font-bold opacity-80 border-t border-current/10 pt-2">
                          <span>보유 및 사용 가능 크레딧</span>
                          <span>PHP {currentCredit.toLocaleString()}</span>
                        </div>
                        {isInsufficient && (
                          <div className="space-y-3 mt-2">
                            <div className="text-[10px] font-extrabold text-rose-500 bg-rose-500/5 p-3 rounded-xl border border-rose-500/10 leading-relaxed">
                              {isZeroCredit 
                                ? '보유하신 크레딧이 없습니다. 안전한 거래 진행을 위해 사용 크레딧 충전이 필요합니다.' 
                                : '보유하신 크레딧이 거래 수수료보다 부족하여 상호거래를 체결할 수 없습니다. 충전이 필요합니다.'}
                            </div>
                            <Link 
                              href="/deposit"
                              className="flex items-center justify-center gap-2 w-full py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-[16px] font-black text-xs shadow-md shadow-rose-500/25 active:scale-95 transition-all text-center"
                            >
                              <span>크레딧 충전하러 가기</span>
                              <ChevronRight className="w-3.5 h-3.5" />
                            </Link>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {txStep === 2 && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { id: 'front1', label: t('id_front_1') },
                    { id: 'back1', label: t('id_back_1') },
                    { id: 'front2', label: t('id_front_2') },
                    { id: 'back2', label: t('id_back_2') }
                  ].map((p) => (
                    <div key={p.id} className="space-y-2 text-center">
                      <div className="aspect-[4/3] bg-slate-50 dark:bg-white/5 rounded-[32px] border-2 border-dashed border-slate-200 dark:border-white/10 flex flex-col items-center justify-center gap-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-white/10 transition-all relative overflow-hidden group">
                        {idPhotos[p.id].preview ? (
                          <img src={idPhotos[p.id].preview!} alt={p.label} className="w-full h-full object-cover" />
                        ) : (
                          <>
                            <div className="w-12 h-12 rounded-full bg-white dark:bg-slate-800 shadow-sm flex items-center justify-center group-hover:scale-110 transition-transform">
                              <Camera className="w-6 h-6 text-blue-600" />
                            </div>
                            <span className="text-[9px] font-black text-slate-400 px-4 uppercase tracking-wider">{p.label}</span>
                          </>
                        )}
                        <input type="file" accept="image/*" capture="environment" onChange={(e) => handlePhotoCapture(p.id, e)} className="absolute inset-0 opacity-0 cursor-pointer" />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex items-start gap-4 p-5 bg-blue-600/10 dark:bg-blue-600/20 border border-blue-600/20 rounded-[32px] text-blue-600 dark:text-blue-400 animate-pulse">
                  <ShieldCheck className="w-6 h-6 flex-shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-sm font-black leading-tight uppercase tracking-wide">{t('identity_verification')}</p>
                    <p className="text-xs font-bold opacity-80">{t('agreement_confirmed')}</p>
                  </div>
                </div>
              </div>
            )}

            {txStep === 3 && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="space-y-4">
                  <Label className="font-black text-[10px] uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2 px-1">
                    <Signature className="w-4 h-4 text-blue-500" /> {t('lender_signature')}
                  </Label>
                  <SignaturePad onSave={setLenderSignature} onClear={() => setLenderSignature(null)} />
                </div>
                <div className="space-y-4">
                  <Label className="font-black text-[10px] uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2 px-1">
                    <Signature className="w-4 h-4 text-blue-500" /> {t('borrower_signature')}
                  </Label>
                  <SignaturePad onSave={setBorrowerSignature} onClear={() => setBorrowerSignature(null)} />
                </div>
                <div className="p-5 bg-slate-50 dark:bg-white/5 rounded-[32px] border border-slate-100 dark:border-white/5">
                  <p className="text-[10px] font-medium text-slate-500 leading-relaxed italic">
                    {t('legal_disclaimer')}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="pt-4 pb-8 flex gap-4 shrink-0">
            {txStep > 1 && (
              <Button 
                variant="outline" 
                onClick={() => setTxStep(prev => prev - 1)}
                className="h-16 w-16 rounded-[24px] border-slate-200 dark:border-white/10 font-bold p-0 active:scale-95 transition-transform"
              >
                <ChevronLeft className="w-6 h-6" />
              </Button>
            )}
            {(() => {
              const transactionFee = parseFloat(amount || '0') * feeRate;
              const currentCredit = profile?.credit ? parseFloat(profile.credit.toString()) : 0;
              const isCreditInsufficient = currentCredit <= 0 || currentCredit < transactionFee;

              return (
                <Button 
                  onClick={() => txStep < 3 ? setTxStep(prev => prev + 1) : handleCreateTransaction()}
                  disabled={(txStep === 1 && (!amount || isCreditInsufficient)) || txStep === 3 && (!lenderSignature || !borrowerSignature) || isSubmitting || isUploadingPhotos}
                  className="flex-1 h-16 bg-blue-600 hover:bg-blue-700 text-white rounded-[24px] font-black text-xl shadow-2xl shadow-blue-500/40 active:scale-95 transition-all"
                >
                  {txStep === 3 ? (isSubmitting || isUploadingPhotos ? t('saving') : t('confirm_and_save')) : t('next')}
                </Button>
              );
            })()}
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Matching Request Modal */}
      <Dialog open={isPostModalOpen} onOpenChange={setIsPostModalOpen}>
        <DialogContent className="max-w-md w-[95%] h-[85vh] md:h-[75vh] rounded-[32px] dark:bg-slate-950 dark:border-white/5 px-6 pt-8 flex flex-col outline-none overflow-hidden">
          <DialogHeader className="pb-4 shrink-0">
            <DialogTitle className="text-2xl font-black dark:text-white text-center">
              {matchingType === 'borrower' ? '?좉퇋 ?異??붿껌 怨듦퀬 ?깅줉' : '?좉퇋 ?異??쒓났 怨듦퀬 ?깅줉'}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto py-6 space-y-6 scrollbar-hide">
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="space-y-3">
                <Label className="font-black text-[10px] uppercase tracking-[0.2em] text-slate-400 px-1">怨듦퀬 援щ텇</Label>
                <div className="flex bg-slate-100 dark:bg-white/5 p-1 rounded-2xl">
                  <button 
                    type="button"
                    onClick={() => setMatchingType('borrower')}
                    className={`flex-1 py-3 rounded-xl text-xs font-black transition-all duration-300 ${matchingType === 'borrower' ? 'bg-white dark:bg-blue-600 shadow-md text-blue-600 dark:text-white' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    ?異??붿껌 (鍮뚮━湲?
                  </button>
                  <button 
                    type="button"
                    onClick={() => setMatchingType('lender')}
                    className={`flex-1 py-3 rounded-xl text-xs font-black transition-all duration-300 ${matchingType === 'lender' ? 'bg-white dark:bg-blue-600 shadow-md text-blue-600 dark:text-white' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    ?異??쒓났 (鍮뚮젮二쇨린)
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <Label className="font-black text-[10px] uppercase tracking-[0.2em] text-slate-400 px-1">{t('amount')} (PHP)</Label>
                <Input 
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="h-16 rounded-2xl text-2xl font-black bg-slate-50 dark:bg-white/5 border-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div className="space-y-3">
                <Label className="font-black text-[10px] uppercase tracking-[0.2em] text-slate-400 px-1">이자율 (%)</Label>
                <Input 
                  type="number"
                  value={interestRate}
                  max={6}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (val > 6) {
                      setInterestRate('6');
                      toast.warning('필리핀 법정 상한 금리(연 6%) 제한이 적용되어 6%를 초과할 수 없습니다.');
                    } else {
                      setInterestRate(e.target.value);
                    }
                  }}
                  placeholder="0"
                  className="h-16 rounded-2xl text-xl font-black bg-slate-50 dark:bg-white/5 border-none focus:ring-2 focus:ring-blue-500"
                />
                <div className="p-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/30 rounded-xl text-blue-600 dark:text-blue-400 flex items-start gap-2 animate-in fade-in duration-300">
                  <ShieldCheck className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span className="text-[10px] font-bold leading-normal">
                    필리핀 법정 이자율 제한: 대출이자는 법적 상한선인 최대 6%를 넘지 않게 설정해야 합니다.
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                <Label className="font-black text-[10px] uppercase tracking-[0.2em] text-slate-400 px-1">만기 시 상환 금액</Label>
                <div className="h-20 flex flex-col justify-center px-5 rounded-2xl bg-blue-500/10 dark:bg-blue-600/20 border border-blue-500/25">
                  <span className="text-[10px] font-black uppercase tracking-[0.1em] text-blue-600 dark:text-blue-400 mb-0.5">총 상환 금액 (원금 + 이자)</span>
                  <span className="text-2xl font-black text-blue-700 dark:text-blue-300">
                    {(Number(amount || 0) * (1 + Number(interestRate || 0) / 100)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                <Label className="font-black text-[10px] uppercase tracking-[0.2em] text-slate-400 px-1">기한 후 미납 시 규정 (연체약정)</Label>
                <Select value={policyType} onValueChange={(value) => {
                  setPolicyType(value);
                  if (value !== 'custom') {
                    const matched = [
                      { id: '1', text: '연체 시 필리핀 법정 지연이자율 연 6% 이하 부과' },
                      { id: '2', text: '연체 시 법적 최고 제한 연 6% 지연손해금 적용' },
                      { id: '3', text: '상호 합의에 의해 추가 지연이자 없이 법정 이율 연 6% 적용' }
                    ].find(p => p.id === value);
                    if (matched) setOverduePolicy(matched.text);
                  } else {
                    setOverduePolicy(customPolicy || '직접 입력한 규정');
                  }
                }}>
                  <SelectTrigger className="h-16 rounded-2xl bg-slate-50 dark:bg-white/5 border-none font-bold focus:ring-2 focus:ring-blue-500">
                    <SelectValue placeholder="미납 시 규정을 선택하세요" />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl dark:bg-slate-900 border-none shadow-xl">
                    <SelectItem value="1" className="font-bold">연체 시 필리핀 법정 지연이자율 연 6% 이하 부과</SelectItem>
                    <SelectItem value="2" className="font-bold">연체 시 법적 최고 제한 연 6% 지연손해금 적용</SelectItem>
                    <SelectItem value="3" className="font-bold">상호 합의에 의해 추가 지연이자 없이 법정 이율 연 6% 적용</SelectItem>
                    <SelectItem value="custom" className="font-bold">직접 입력</SelectItem>
                  </SelectContent>
                </Select>
                {policyType === 'custom' && (
                  <div className="space-y-2">
                    <Input 
                      value={customPolicy}
                      onChange={(e) => {
                        setCustomPolicy(e.target.value);
                        setOverduePolicy(e.target.value);
                      }}
                      placeholder="지연 시 부과할 규정이나 내용을 직접 입력하세요."
                      className="h-14 mt-2 rounded-2xl bg-slate-50 dark:bg-white/5 border-none font-bold focus:ring-2 focus:ring-blue-500 animate-in fade-in duration-300"
                    />
                    {(() => {
                      const regex = /(\d+(?:\.\d+)?)\s*(?:%|percent|퍼센트|이자|연체)/gi;
                      let isViolated = false;
                      let match;
                      while ((match = regex.exec(customPolicy)) !== null) {
                        const value = parseFloat(match[1]);
                        if (value > 6) {
                          isViolated = true;
                          break;
                    법적 지연이자 제한 안내: 필리핀 민법 및 중앙은행 규정에 의거하여 기한 후 미납 시 청구하는 지연이율은 법정 상한선인 연 6%를 초과할 수 없습니다.
                      }
                      
                      if (isViolated) {
                        return (
                          <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900/30 rounded-xl text-red-600 dark:text-red-400 flex items-start gap-2 animate-in slide-in-from-top-1 duration-200">
                            <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <Label className="font-black text-[10px] uppercase tracking-[0.2em] text-slate-400 px-1">만기 기일 설정 방식</Label>
                              규정 위반 감지: 법적 미납 지연이율은 연 6%를 초과할 수 없습니다. 계약의 안전을 위해 6% 이하로 조정해 주세요.
                            </span>
                          </div>
                        );
                      }
                      return null;
                    기간 선택 및 기일 조정
                  </div>
                )}
                <div className="p-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/30 rounded-xl text-blue-600 dark:text-blue-400 flex items-start gap-2 animate-in fade-in duration-300">
                  <ShieldCheck className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span className="text-[10px] font-bold leading-normal">
                    법적 지연이자 제한 안내: 필리핀 민법 및 중앙은행 규정에 의거하여 기한 후 미납 시 청구하는 지연이율은 법정 상한선인 연 6%를 초과할 수 없습니다.
                    특정 날짜 지정
                </div>
              </div>

              {/* 留뚭린 湲곗씪 ?ㅼ젙 諛⑹떇 */}
              <div className="space-y-3">
                <Label className="font-black text-[10px] uppercase tracking-[0.2em] text-slate-400 px-1">만기 기일 설정 방식</Label>
                    <Label className="font-black text-[10px] uppercase tracking-[0.2em] text-slate-400 px-1">만기 기간 선택</Label>
                  <button 
                    type="button"
                    onClick={() => setDueDateType('period')}
                    className={`flex-1 py-3 rounded-xl text-xs font-black transition-all duration-300 ${dueDateType === 'period' ? 'bg-white dark:bg-blue-600 shadow-md text-blue-600 dark:text-white' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    기간 선택 및 기일 조정
                  </button>
                  <button 
                    type="button"
                    onClick={() => setDueDateType('fixed')}
                    className={`flex-1 py-3 rounded-xl text-xs font-black transition-all duration-300 ${dueDateType === 'fixed' ? 'bg-white dark:bg-blue-600 shadow-md text-blue-600 dark:text-white' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    특정 날짜 지정
                  </button>
                </div>
              </div>

              {dueDateType === 'period' ? (
                <div className="space-y-4 animate-in fade-in duration-300">
                  <div className="space-y-3">
                    <Label className="font-black text-[10px] uppercase tracking-[0.2em] text-slate-400 px-1">만기 기간 선택</Label>
                    <Select value={periodValue} onValueChange={setPeriodValue}>
                      <SelectTrigger className="h-16 rounded-2xl bg-slate-50 dark:bg-white/5 border-none font-bold focus:ring-2 focus:ring-blue-500">
                        <SelectValue placeholder="만기 기간을 선택하세요" />
                      </SelectTrigger>
                      <SelectContent className="rounded-2xl dark:bg-slate-900 border-none shadow-xl">
                        <SelectGroup>
                          <SelectLabel className="text-xs text-slate-400">일 단위 선택 (1일 ~ 31일)</SelectLabel>
                          {Array.from({ length: 31 }, (_, i) => (
                            <SelectItem key={i + 1} value={(i + 1).toString()} className="font-bold">
                              {i + 1}일
                            </SelectItem>
                        placeholder="만기 일수를 입력하세요 (예: 15)"
                        </SelectGroup>
                        <SelectSeparator />
                        <SelectGroup>
                          <SelectLabel className="text-xs text-slate-400">월 단위 선택</SelectLabel>
                          <SelectItem value="30" className="font-bold">1개월 (30일)</SelectItem>
                          <SelectItem value="60" className="font-bold">2개월 (60일)</SelectItem>
                          <SelectItem value="90" className="font-bold">3개월 (90일)</SelectItem>
                        </SelectGroup>
                        <SelectSeparator />
                        <SelectGroup>
                          <SelectItem value="custom" className="font-bold text-blue-500">기간 직접 입력 (일 단위)</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    
                    {periodValue === 'custom' && (
                      <Input 
                        type="number"
                        value={customPeriodDays}
                        onChange={(e) => setCustomPeriodDays(e.target.value)}
                        placeholder="만기 일수를 입력하세요 (예: 15)"
                        className="h-14 mt-2 rounded-2xl bg-slate-50 dark:bg-white/5 border-none font-bold focus:ring-2 focus:ring-blue-500 animate-in fade-in duration-300"
                      />
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-3 animate-in fade-in duration-300">
                  <Label className="font-black text-[10px] uppercase tracking-[0.2em] text-slate-400 px-1">{t('due_date')}</Label>
                  <div className="relative">
                  기일 조정 가능 (상호 합의 하에 기일 조율 가능)
                    <Input 
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="h-16 pl-12 rounded-2xl bg-slate-50 dark:bg-white/5 border-none font-bold focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              )}

              {/* 湲곗씪 議곗젙 媛???щ? */}
              <div className="flex items-center gap-3 p-4 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-white/5">
                <input 
                  type="checkbox"
                  id="isAdjustable"
                  checked={isAdjustable}
                  onChange={(e) => setIsAdjustable(e.target.checked)}
                  className="w-5 h-5 rounded-md border-slate-300 dark:border-white/20 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                <label htmlFor="isAdjustable" className="text-sm font-bold text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                  기일 조정 가능 (상호 합의 하에 기일 조율 가능)
              취소
              </div>

              <div className="space-y-3">
                <Label className="font-black text-[10px] uppercase tracking-[0.2em] text-slate-400 px-1">{t('description')}</Label>
                <Input 
                  value={description}
              {isSubmitting ? '등록 중...' : '공고 등록하기'}
                  placeholder="공고에 대한 설명과 상세 목적을 입력해 보세요."
                  className="h-16 rounded-2xl bg-slate-50 dark:bg-white/5 border-none font-bold focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          <div className="pt-4 pb-8 flex gap-4 shrink-0">
            <Button 
              variant="outline" 
              onClick={() => setIsPostModalOpen(false)}
              className="h-16 flex-1 rounded-[24px] border-slate-200 dark:border-white/10 font-bold active:scale-95 transition-transform"
            >
              취소
            </Button>
              상환 결제 및 증빙 제출
              onClick={handleCreatePost}
              disabled={!amount || isSubmitting}
              className="flex-1 h-16 bg-blue-600 hover:bg-blue-700 text-white rounded-[24px] font-black text-xl shadow-2xl shadow-blue-500/40 active:scale-95 transition-all"
            >
              {isSubmitting ? '등록 중...' : '공고 등록하기'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

              GCash 상환
      <Dialog open={isPaymentOpen} onOpenChange={(open) => {
        if (!isUploadingProof) {
          setIsPaymentOpen(open);
          if (!open) { resetGCashPaymentForm(); }
        }
      }}>
              USDT / USDC 코인 상환
          <DialogHeader className="shrink-0">
            <DialogTitle className="text-xl font-black dark:text-white text-center">
              상환 결제 및 증빙 제출
            </DialogTitle>
          </DialogHeader>

          {/* Payment Method Tabs */}
          <div className="flex border border-slate-200 dark:border-white/10 rounded-xl p-1 bg-slate-50 dark:bg-white/5 w-full shrink-0 my-2">
            <button
                    <span className="font-bold text-slate-400">채권자 이름:</span>
              onClick={() => setPaymentMethod('gcash')}
              className={`flex-1 py-2 text-xs font-black rounded-lg transition-all ${paymentMethod === 'gcash' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
            >
                    <span className="font-bold text-slate-400">GCash 송금 번호:</span>
            </button>
            <button
                        {payingLoan?.lender?.gcash_number || payingLoan?.lender?.phone || '등록된 번호 없음'}
              onClick={() => setPaymentMethod('coin')}
              className={`flex-1 py-2 text-xs font-black rounded-lg transition-all ${paymentMethod === 'coin' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
            >
              USDT / USDC 코인 상환
            </button>
          </div>

          <div className="space-y-5 py-3 flex-1">
            {paymentMethod === 'gcash' ? (
              <>
                            toast.success('전화번호가 복사되었습니다.');
                <div className="p-4 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-white/5 space-y-2.5 text-xs">
                  <div className="flex justify-between items-center">
                          복사
                    <span className="font-extrabold text-slate-800 dark:text-slate-100">{payingLoan?.lender?.full_name || '-'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-slate-400">GCash 송금 번호:</span>
                    <div className="flex items-center gap-2">
                      <span className="font-black text-blue-600 dark:text-blue-400">
                        {payingLoan?.lender?.gcash_number || payingLoan?.lender?.phone || '등록된 번호 없음'}
                      </span>
                      {(payingLoan?.lender?.gcash_number || payingLoan?.lender?.phone) && (
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">채권자 GCash QR 코드</span>
                          variant="ghost" 
                          size="sm" 
                          type="button"
                          className="h-7 px-2 text-[10px] font-black rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 active:scale-95 transition-all text-slate-500"
                          onClick={() => {
                            const num = payingLoan.lender.gcash_number || payingLoan.lender.phone;
                            navigator.clipboard.writeText(num);
                            toast.success('전화번호가 복사되었습니다.');
                          }}
                        >
                          복사
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Lender GCash QR Code */}
                {payingLoan?.lender?.gcash_qr_url ? (
                  <div className="flex flex-col items-center justify-center p-4 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-white/5 space-y-2">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">채권자 GCash QR 코드</span>
                    <div className="relative w-36 h-36 bg-white rounded-2xl overflow-hidden border border-slate-200 dark:border-white/10 p-1.5 shadow-sm">
                      <img 
                        src={payingLoan.lender.gcash_qr_url} 
                        alt="Lender GCash QR" 
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <span className="text-[9px] text-slate-400 font-bold">이미지를 길게 눌러 앨범에 저장할 수 있습니다.</span>
                  </div>
                ) : (
                  <div className="p-4 bg-amber-500/5 border border-amber-500/10 rounded-2xl text-amber-600 dark:text-amber-400 flex items-start gap-2 text-xs font-bold leading-relaxed">
                    <Info className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                      채권자가 QR 코드를 등록하지 않았습니다. 위 전화번호로 직접 GCash 송금을 진행해 주세요.
                    </span>
                  </div>
                )}

                {/* GCash Direct Shortcuts */}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      window.location.href = 'gcash://';
                      toast.success('GCash를 실행시도합니다.');
                    }}
                    className="flex-1 h-12 rounded-xl border-blue-200 dark:border-blue-900/50 hover:bg-blue-50 dark:hover:bg-blue-950/20 text-blue-600 font-extrabold text-xs flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all"
                  >
                    <Wallet className="w-3.5 h-3.5" />
                    지캐시 앱 실행
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      window.open('https://www.gcash.com', '_blank');
                      toast.success('GCash 웹페이지로 이동합니다.');
                    }}
                    className="flex-1 h-12 rounded-xl border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/5 text-slate-700 dark:text-slate-300 font-extrabold text-xs flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    지캐시 앱 바로가기
                  </Button>
                </div>
              </>
            ) : (
              <>
                {/* Coin Selection (USDT vs USDC) */}
                <div className="space-y-2">
                  <Label className="font-black text-[10px] uppercase tracking-wider text-slate-400 px-1">코인 종류 선택</Label>
                  <div className="flex border border-slate-200 dark:border-white/10 rounded-xl p-1 bg-slate-50 dark:bg-white/5 w-full shrink-0">
                    <button
                      type="button"
                      onClick={() => setCoinType('usdt')}
                      className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${coinType === 'usdt' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
                    >
                      USDT (Solana)
                    </button>
                    <button
                      type="button"
                      onClick={() => setCoinType('usdc')}
                      className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${coinType === 'usdc' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
                    >
                      USDC (Solana)
                    </button>
                  </div>
                </div>

                {/* Coin Lender Account Details */}
                <div className="p-4 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-white/5 space-y-2.5 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-slate-400">채권자 이름:</span>
                    <span className="font-extrabold text-slate-800 dark:text-slate-100">{payingLoan?.lender?.full_name || '-'}</span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className="font-bold text-slate-400">입금할 채권자 지갑 주소:</span>
                    <div className="flex items-center justify-between gap-2 p-2 bg-slate-100 dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/5">
                      <span className="font-mono text-[10px] break-all select-all text-slate-700 dark:text-slate-300 w-[80%] leading-relaxed">
                        {payingLoan?.lender?.solana_wallet || '지갑 주소가 미등록 상태입니다'}
                      </span>
                      {payingLoan?.lender?.solana_wallet && (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          type="button"
                          className="h-7 px-2 text-[10px] font-black rounded-lg hover:bg-slate-200 dark:hover:bg-white/10 active:scale-95 transition-all text-slate-500 shrink-0"
                          onClick={() => {
                            navigator.clipboard.writeText(payingLoan.lender.solana_wallet);
                            toast.success('채권자 지갑 주소가 복사되었습니다.');
                          }}
                        >
                          복사
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Sender Wallet Address Input */}
                <div className="space-y-2">
                  <Label className="font-black text-[10px] uppercase tracking-wider text-slate-400 px-1">
                    ?↔툑???ъ슜??蹂몄씤??吏媛?嫄곕옒??二쇱냼
                  </Label>
                  <Input 
                    type="text"
                    value={walletAddress}
                    onChange={(e) => setWalletAddress(e.target.value)}
                    placeholder="?? 0x... ?먮뒗 ?붾씪??二쇱냼 (蹂몄씤 ?낆텧湲?二쇱냼)"
                    className="h-12 rounded-xl bg-slate-50 dark:bg-white/5 border-none font-bold text-xs focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </>
            )}

            <div className="border-t border-dashed border-slate-200 dark:border-white/5 my-4 pt-4 space-y-4">
              {/* Screenshot Upload Box */}
              <div className="space-y-2">
                <Label className="font-black text-[10px] uppercase tracking-wider text-slate-400 px-1">송금 완료 영수증 첨부</Label>
                <div className="aspect-[16/10] w-full bg-slate-50 dark:bg-white/5 rounded-2xl border-2 border-dashed border-slate-200 dark:border-white/10 flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-slate-100 dark:hover:bg-white/10 transition-all relative overflow-hidden group">
                  {proofPreview ? (
                    <>
                      <img src={proofPreview} alt="Screenshot Preview" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-black transition-opacity">
                        이미지 교체하기
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="w-10 h-10 rounded-full bg-white dark:bg-slate-800 shadow-sm flex items-center justify-center group-hover:scale-105 transition-transform border border-slate-100 dark:border-white/5">
                        <Camera className="w-5 h-5 text-blue-600" />
                      </div>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-wide">스크린샷 이미지 업로드</span>
                    </>
                  )}
                  <input 
                    type="file" 
                    accept="image/*" 
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setProofFile(file);
                        setProofPreview(URL.createObjectURL(file));
                      }
                    }} 
                    className="absolute inset-0 opacity-0 cursor-pointer" 
                  />
                </div>
              </div>

              {paymentMethod === 'gcash' && (
                /* Reference ID input */
                <div className="space-y-2">
                  <Label className="font-black text-[10px] uppercase tracking-wider text-slate-400 px-1">吏罹먯떆 李몄“ 踰덊샇 (Reference ID)</Label>
                  <Input 
                    type="text"
                    value={gcashReference}
                    onChange={(e) => setGcashReference(e.target.value)}
                    placeholder="?↔툑 ??諛쏆? 8?먮━ ?댁긽??李몄“ 踰덊샇"
                    className="h-12 rounded-xl bg-slate-50 dark:bg-white/5 border-none font-bold text-xs focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}

              {/* Amount input */}
              <div className="space-y-2">
                <Label className="font-black text-[10px] uppercase tracking-wider text-slate-400 px-1">실제 입금액 (PHP)</Label>
                <Input 
                  type="number"
                  value={amountClaimed}
                  onChange={(e) => setAmountClaimed(e.target.value)}
                  placeholder="0.00"
                  className="h-12 rounded-xl bg-slate-50 dark:bg-white/5 border-none font-black text-xs focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Time input */}
              <div className="space-y-2">
                <Label className="font-black text-[10px] uppercase tracking-wider text-slate-400 px-1">실제 입금 완료 일시</Label>
                <Input 
                  type="datetime-local"
                  value={depositedAt}
                  onChange={(e) => setDepositedAt(e.target.value)}
                  className="h-12 rounded-xl bg-slate-50 dark:bg-white/5 border-none font-bold text-xs focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-3 pt-3 mt-auto shrink-0 border-t border-slate-100 dark:border-white/5">
            <Button
              type="button"
              variant="outline"
              onClick={() => { setIsPaymentOpen(false); resetGCashPaymentForm(); }}
              disabled={isUploadingProof}
              className="flex-1 h-12 rounded-xl border-slate-200 dark:border-white/10 font-bold text-xs active:scale-95 transition-transform"
            >
              닫기
            </Button>
            <Button
              type="button"
              onClick={processGCashPayment}
              disabled={isUploadingProof}
              className="flex-1 h-12 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-xs shadow-lg shadow-blue-500/20 active:scale-95 transition-all flex items-center justify-center gap-1.5"
            >
              {isUploadingProof ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  제출 중...
                </>
              ) : (
                <>
                  <Upload className="w-3.5 h-3.5" />
                  상환 영수증 제출
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
