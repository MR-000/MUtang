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
  QrCode,
  Eye,
  EyeOff
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { translations } from '@/lib/i18n';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel, SelectSeparator } from '@/components/ui/select';
import { format } from 'date-fns';
import MLIDCamera from '@/components/ui/MLIDCamera';
import { SignaturePad } from '@/components/ui/signature-pad';
import { Card } from '@/components/ui/card';
import { TierBadge } from '@/components/ui/tier-badge';
import { VerificationGuard } from '@/components/VerificationGuard';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { compressImage, checkImageQuality } from '@/lib/kyc';

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

const getSmartTranslatedText = (text: string | null | undefined, t: any): string => {
  if (!text) return '';
  
  const hardcodedMap: Record<string, string> = {
    "사리사리 상점 음료수 및 스낵 재고 대량 주문 목적": "bulk_desc_1",
    "마닐라 베이커리 밀가루 및 버터 대량 도매 구매": "bulk_desc_2",
    "기한 내 미납 시 일일 1%의 연체료 지불을 약속합니다.": "overdue_policy_1",
    "연체 시 일일 0.8%의 연체료가 부과됨에 동의합니다.": "overdue_policy_2",
    "연체 시 필리핀 법정 지연이자율 연 6% 이하 부과": "overdue_policy_3",
    "연체 시 매일 1% 연체료 부과": "overdue_policy_4",
    "기한 내 미납 시 일일 1% 연체료 지불을 약속합니다.": "overdue_policy_1",
    "연체 시 연 5% 지연이자율 적용": "overdue_policy_5",
    "연체 시 연 24% 법정 지연손해금 적용": "overdue_policy_6"
  };

  let prefix = '';
  let mainBody = text;
  
  const prefixMatch = text.match(/^(\[[^\]]+\])\s*(.*)$/);
  if (prefixMatch) {
    prefix = prefixMatch[1];
    mainBody = prefixMatch[2];
    
    let prefixContent = prefix.slice(1, -1);
    
    // 1. 만기/Due Date/Takdang Petsa 통합 치환
    prefixContent = prefixContent.replace(/^(만기일|만기|Due Date|Takdang Petsa):/i, t("due_date") + ":");
    
    // 2. "일 이내" 또는 "days within" 동적 치환 (예: 10일 이내)
    prefixContent = prefixContent.replace(/(\d+)\s*(일\s*이내|days?\s*within|araw\s*loob ng)/i, (_, num) => {
      return `${num} ${t("days")} ${t("within")}`;
    });
    
    // 3. "개월 이내" 또는 "months within" 동적 치환
    prefixContent = prefixContent.replace(/(\d+)\s*(개월\s*이내|months?\s*within|buwan\s*loob ng)/i, (_, num) => {
      const unit = parseInt(num, 10) === 1 ? t("month") : t("months");
      return `${num} ${unit} ${t("within")}`;
    });
    
    // 4. "기일 조정 가능" 동적 치환
    prefixContent = prefixContent.replace(/(기일 조정 가능|Adjustable Due Date|Maaaring Ayusin ang Takdang Petsa)/i, t("due_date_adjustable"));
      
    prefix = `[${prefixContent}] `;
  }

  let cleanBody = mainBody.trim();
  if (hardcodedMap[cleanBody]) {
    mainBody = t(hardcodedMap[cleanBody]);
  } else {
    const rateLabel = t('interest_rate_label') || '이율';
    const overdueLabel = t('overdue_rules_label') || '연체규정';
    
    const reversePolicyMap: Record<string, string> = {
      "연체 시 필리핀 법정 지연이자율 연 6% 이하 부과": "overdue_policy_3",
      "연체 시 매일 1% 연체료 부과": "overdue_policy_4",
      "연체 시 연 5% 지연이자율 적용": "overdue_policy_5",
      "연체 시 연 24% 법정 지연손해금 적용": "overdue_policy_6",
      "기한 내 미납 시 일일 1%의 연체료 지불을 약속합니다.": "overdue_policy_1",
      "연체 시 일일 0.8%의 연체료가 부과됨에 동의합니다.": "overdue_policy_2",
    };

    // 공백, 줄바꿈(\n) 등을 제거하고 정규식으로 유연하게 매칭
    // 예: (이율: 1%, 연체규정: 연체 시 필리핀 법정 지연이자율 연 6% 이하 부과)
    mainBody = cleanBody.replace(/\(?이율:\s*(\d+(?:\.\d+)?%)\s*,\s*연체규정:\s*([\s\S]+?)\)?$/gi, (_, rate, policy) => {
      let policyKey = policy.trim();
      if (policyKey.endsWith(')')) {
        policyKey = policyKey.slice(0, -1).trim();
      }
      // 줄바꿈이나 여러 공백을 단일 공백으로 치환하여 딕셔너리 키와 비교
      const normalizedPolicyKey = policyKey.replace(/\s+/g, ' ');
      const mappedKey = reversePolicyMap[normalizedPolicyKey] || normalizedPolicyKey;
      const translatedPolicy = t(mappedKey) || normalizedPolicyKey;
      return `(${rateLabel}: ${rate}, ${overdueLabel}: ${translatedPolicy})`;
    });

    if (mainBody === cleanBody) {
      // 바디가 완전히 치환되지 않았다면 전체 매칭 시도
      const normalizedCleanBody = cleanBody.replace(/\s+/g, ' ');
      if (hardcodedMap[normalizedCleanBody]) {
        mainBody = t(hardcodedMap[normalizedCleanBody]);
      } else {
        mainBody = t(cleanBody);
      }
    }
  }

  return prefix + mainBody;
};

export default function Transactions() {
  const { user, profile, t, language } = useAuth();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<'marketplace' | 'history'>('marketplace');
  const [feeRate, setFeeRate] = useState<number>(0.01);
  const [matchingType, setMatchingType] = useState<'borrower' | 'lender'>('borrower');
  const [searchQuery, setSearchQuery] = useState('');
  const isUserLender = matchingType === 'borrower';
  const isAdmin = user?.email?.includes('admin') || profile?.role === 'admin' || profile?.is_admin === true;
  
  const [debts, setDebts] = useState<Debt[]>([]);
  const [requests, setRequests] = useState<MatchingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [isTransactionOpen, setIsTransactionOpen] = useState(false);
  const [isPostModalOpen, setIsPostModalOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<MatchingRequest | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [postToDeleteId, setPostToDeleteId] = useState<string | null>(null);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState<string | null>(null);

  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [isPdfPreviewOpen, setIsPdfPreviewOpen] = useState(false);

  const handleDownloadContractPDF = async (loan: any, isPreview: boolean = false) => {
    if (!loan) return;
    setIsGeneratingPDF(loan.id);
    
    try {
      // 서명 파싱 및 서명 데이터 공유 바인딩 (문자열/객체 호환 지원)
      let lenderSig = '';
      let borrowerSig = '';
      try {
        if (loan.signature_data) {
          const sigs = typeof loan.signature_data === 'string'
            ? JSON.parse(loan.signature_data)
            : loan.signature_data;
          lenderSig = sigs.lender || '';
          borrowerSig = sigs.borrower || '';
        }
      } catch (err) {
        console.error('Signature parse error:', err);
      }

      // verification_evidence 안전 파싱 (문자열/객체 호환 지원)
      let evidence = loan.verification_evidence;
      if (typeof evidence === 'string') {
        try {
          evidence = JSON.parse(evidence);
        } catch (e) {
          evidence = null;
        }
      }

      // 현지어 계약 문안 및 영어 계약 문안 조립
      const localDesc = getSmartTranslatedText(loan.description, t);
      const enDesc = getSmartTranslatedText(loan.description, (key: string) => {
        return translations[key]?.['en'] || key;
      });

      const localPolicy = getSmartTranslatedText(loan.overdue_policy, t);
      const enPolicy = getSmartTranslatedText(loan.overdue_policy, (key: string) => {
        return translations[key]?.['en'] || key;
      });

      const transferredAt = evidence?.transferred_at 
        ? format(new Date(evidence.transferred_at), 'yyyy-MM-dd HH:mm') 
        : null;
      const receivedAt = evidence?.received_at 
        ? format(new Date(evidence.received_at), 'yyyy-MM-dd HH:mm') 
        : null;

      const pdfPayload = {
        id: loan.id,
        lang: language || 'en',
        lenderName: loan.lender?.full_name || '-',
        lenderPhone: loan.lender?.phone || '-',
        borrowerName: loan.borrower?.full_name || '-',
        transactionDate: format(new Date(loan.created_at), 'yyyy-MM-dd HH:mm'),
        amount: `PHP ${Number(loan.amount).toLocaleString()}`,
        interestRate: `${evidence?.interest_rate || 0}%`,
        repayAmount: `PHP ${Number(loan.repay_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
        dueDate: loan.due_date ? format(new Date(loan.due_date), 'yyyy-MM-dd') : '-',
        localTitle: t('debts') + " " + t('transaction') + " " + t('agreement_record'),
        enTitle: "Credit Transaction Agreement",
        localDescription: localDesc,
        enDescription: enDesc,
        localPolicy: localPolicy,
        enPolicy: enPolicy,
        localDisclaimer: t('legal_disclaimer'),
        enDisclaimer: "I hereby acknowledge that I have received the goods/services listed above and agree to repay the specified amount on or before the due date.",
        lenderSig,
        borrowerSig,
        photos: evidence?.photos || null,
        transferredAt,
        receivedAt,
        labels: {
          lender: t('lender') || '채권자',
          borrower: t('borrower') || '채무자',
          date: t('post_date') || '거래 일자',
          termsTitle: t('financial_terms_title') || '거래 조건 및 세부 규칙',
          principal: t('principal') || '원금',
          interest: t('interest_rate_label') || '이율',
          repayment: t('repayment_amount') || '상환 총액',
          due: t('due_date') || '만기일',
          lenderSignature: (t('lender') || '채권자') + " " + (t('signature') || '서명'),
          borrowerSignature: (t('borrower') || '채무자') + " " + (t('signature') || '서명'),
          noSignature: t('signature_not_registered') || '서명 미등록',
          description: t('transaction_description_label') || '거래 내용',
          overdue: t('overdue_rules_label') || '연체 규정'
        }
      };

      // 세션 토큰 가져오기
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token || '';

      const response = await fetch('/api/pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { 'Authorization': `Bearer ${accessToken}` } : {})
        },
        body: JSON.stringify(pdfPayload)
      });

      if (!response.ok) {
        throw new Error('Failed to generate PDF from server');
      }

      const pdfBlob = await response.blob();
      
      if (isPreview) {
        const url = URL.createObjectURL(pdfBlob);
        setPdfPreviewUrl(url);
        setIsPdfPreviewOpen(true);
        toast.success(t('pdf_preview_ready') || 'PDF 미리보기가 준비되었습니다.');
      } else {
        const pdfFile = new File([pdfBlob], `Agreement_${loan.id}.pdf`, { type: 'application/pdf' });

        if (navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
          await navigator.share({
            files: [pdfFile],
            title: `MUtang Credit Contract (${loan.id.slice(0, 8)})`,
            text: `Credit Agreement between ${loan.lender?.full_name || 'Lender'} and ${loan.borrower?.full_name || 'Borrower'}.`
          });
        } else {
          const url = URL.createObjectURL(pdfBlob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `Agreement_${loan.id}.pdf`;
          a.click();
          URL.revokeObjectURL(url);
        }

        toast.success(t('link_generated') || 'PDF 계약서 다운로드 및 공유 완료');
      }
    } catch (error) {
      console.error('PDF Generation Error:', error);
      toast.error(t('link_failed') || 'PDF 처리에 실패했습니다.');
    } finally {
      setIsGeneratingPDF(null);
    }
  };

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
  const [overduePolicy, setOverduePolicy] = useState('overdue_policy_3');
  const [policyType, setPolicyType] = useState('overdue_policy_3');
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
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);

  // ID & Selfie Photos
  const [idPhotos, setIdPhotos] = useState<Record<string, { file: File | null; preview: string | null; publicUrl?: string | null }>>({
    front1: { file: null, preview: null, publicUrl: null },
    back1: { file: null, preview: null, publicUrl: null },
    front2: { file: null, preview: null, publicUrl: null },
    back2: { file: null, preview: null, publicUrl: null },
    selfie: { file: null, preview: null, publicUrl: null }
  });
  const [isUploadingPhotos, setIsUploadingPhotos] = useState(false);
  const [isIdWarningOpen, setIsIdWarningOpen] = useState(false);
  const [isCreditDeductOpen, setIsCreditDeductOpen] = useState(false);
  const [isPartnerSignOpen, setIsPartnerSignOpen] = useState(false);
  const [partnerSignLoan, setPartnerSignLoan] = useState<any>(null);
  const [partnerStep, setPartnerStep] = useState(1);
  const isSelfAdminTx = !!(isAdmin && selectedRequest && (selectedRequest.borrower_id === user?.id || selectedRequest.lender_id === user?.id));
  const isSelfAdminPartnerTx = !!(isAdmin && partnerSignLoan && (partnerSignLoan.lender_id === user?.id || partnerSignLoan.borrower_id === user?.id));


  // Live Camera States
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraMode, setCameraMode] = useState<'id' | 'selfie'>('id');
  const [activePhotoId, setActivePhotoId] = useState<string | null>(null);

  // Expanded Evidence UI States
  const [expandedEvidence, setExpandedEvidence] = useState<Record<string, boolean>>({});
  const toggleEvidence = (loanId: string) => {
    setExpandedEvidence(prev => ({ ...prev, [loanId]: !prev[loanId] }));
  };

  const processCapturedPhoto = async (id: string, file: File, preview: string) => {
    setIsUploadingPhotos(true);
    try {
      // 1. 이미지 압축 및 화질 검사
      const compressedBlob = await compressImage(file);
      
      const qualityCheck = await checkImageQuality(compressedBlob);
      
      if (!qualityCheck.success) {
        toast.error(qualityCheck.message, { duration: 6000 });
        setIsUploadingPhotos(false);
        return;
      }

      // 2. 실시간 스토리지 업로드
      const bucket = 'id-verification';
      const fileExt = 'jpg';
      const fileName = `${user?.id}-${Date.now()}-${id}.${fileExt}`;
      
      // 구형 이미지 클린업 (용량 보호)
      try {
        const { data: fileList, error: listError } = await supabase.storage
          .from(bucket)
          .list('');
          
        if (!listError && fileList) {
          const filesToDelete = fileList
            .filter(f => f.name.startsWith(`${user?.id}`) && f.name.includes(`-${id}.`))
            .map(f => f.name);
            
          if (filesToDelete.length > 0) {
            await supabase.storage.from(bucket).remove(filesToDelete);
          }
        }
      } catch (cleanupError) {
        console.warn('Storage cleanup warn:', cleanupError);
      }

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(fileName, compressedBlob, { upsert: true, contentType: 'image/jpeg' });

      if (uploadError) {
        console.error(`[processCapturedPhoto] Upload FAILED:`, uploadError);
        throw uploadError;
      }
      // 3. 업로드 완료 후 Public URL 획득
      const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(fileName);

      setIdPhotos(prev => ({
        ...prev,
        [id]: { file, preview, publicUrl }
      }));

      toast.success(t('upload_proof_success') || '업로드 및 임시 제출 완료!');
    } catch (err: any) {
      console.error(`[processCapturedPhoto] ERROR:`, err);
      toast.error(err.message || '업로드 실패. 다시 시도해 주세요.');
    } finally {
      setIsUploadingPhotos(false);
    }
  };


  const fetchMarketplace = async () => {
    setLoading(true);
    try {
      // In this system:
      // 'borrower' tab shows requests (posted by borrowers, lender_id is null)
      // 'lender' tab shows offers (posted by lenders, borrower_id is null)
      
      let query;
      const todayStr = new Date().toISOString().split('T')[0];

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

      // 만기일이 오늘 이후이거나 아예 지정되지 않은(null) 공고들만 출력
      query = query.or(`due_date.gte.${todayStr},due_date.is.null`);

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;
      setRequests(data || []);
      if (data && typeof window !== 'undefined') {
        localStorage.setItem(`utang_cache_marketplace_${matchingType}`, JSON.stringify(data));
      }
    } catch (e) {
      console.error(e);
      if (typeof window !== 'undefined') {
        try {
          const cached = localStorage.getItem(`utang_cache_marketplace_${matchingType}`);
          if (cached) {
            setRequests(JSON.parse(cached));
            toast.info(t('viewing_cached_data'));
          }
        } catch (cacheErr) {
          console.error(cacheErr);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const resetTransactionForm = () => {
    setAmount('');
    setDescription('');
    setDueDate('');
    setInterestRate('0');
    setOverduePolicy('overdue_policy_3');
    setPolicyType('overdue_policy_3');
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
      back2: { file: null, preview: null },
      selfie: { file: null, preview: null }
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

  const handleEditPost = (req: MatchingRequest) => {
    setAmount(req.amount.toString());
    setInterestRate((req.interest_rate || 0).toString());
    
    let cleanDesc = req.description || '';
    const prefixMatch = cleanDesc.match(/^(\[[^\]]+\])\s*(.*)$/);
    if (prefixMatch) {
      cleanDesc = prefixMatch[2];
    }
    setDescription(cleanDesc);

    const rawPolicy = req.overdue_policy || 'overdue_policy_3';
    const hardcodedMap: Record<string, string> = {
      "기한 내 미납 시 일일 1%의 연체료 지불을 약속합니다.": "overdue_policy_1",
      "연체 시 일일 0.8%의 연체료가 부과됨에 동의합니다.": "overdue_policy_2",
      "연체 시 필리핀 법정 지연이자율 연 6% 이하 부과": "overdue_policy_3",
      "연체 시 매일 1% 연체료 부과": "overdue_policy_4",
      "연체 시 연 5% 지연이자율 적용": "overdue_policy_5",
      "연체 시 연 24% 법정 지연손해금 적용": "overdue_policy_6"
    };

    let policyKey = rawPolicy;
    if (hardcodedMap[rawPolicy]) {
      policyKey = hardcodedMap[rawPolicy];
    }

    setOverduePolicy(policyKey);

    if (['overdue_policy_3', 'overdue_policy_5', 'overdue_policy_6'].includes(policyKey)) {
      setPolicyType(policyKey);
      setCustomPolicy('');
    } else {
      setPolicyType('custom');
      setCustomPolicy(policyKey);
    }

    setDueDate(req.due_date || '');
    setIsEditMode(true);
    setEditingPostId(req.id);
    setMatchingType(req.type as 'borrower' | 'lender');
    setIsPostModalOpen(true);
  };

  const handleDeletePost = (id: string) => {
    setPostToDeleteId(id);
    setIsDeleteConfirmOpen(true);
  };

  const handleConfirmDeletePost = async () => {
    if (!postToDeleteId) {
      toast.error(t('error_occurred') || "삭제할 공고 ID가 존재하지 않습니다.");
      return;
    }

    try {
      // Optimistic UI Update: 서버 응답 지연을 방지하기 위해 로컬 state에서 즉시 제거
      setRequests(prev => prev.filter(r => r.id !== postToDeleteId));
      
      const { error } = await supabase
        .from('matching_requests')
        .delete()
        .eq('id', postToDeleteId);

      if (error) throw error;
      
      toast.success(t('toast_post_deleted') || '공고가 성공적으로 삭제되었습니다.');
      // 백그라운드 서버 데이터 최종 재동기화
      fetchMarketplace();
    } catch (err: any) {
      console.error("Post deletion fatal error:", err);
      toast.error(err.message || t('error_occurred'));
      // 실패 시 마켓플레이스 데이터 롤백 리로드
      fetchMarketplace();
    } finally {
      setIsDeleteConfirmOpen(false);
      setPostToDeleteId(null);
    }
  };

  const handleStartTransaction = (req: MatchingRequest) => {
    setSelectedRequest(req);
    setAmount(req.amount.toString());
    setInterestRate((req.interest_rate || 0).toString());
    
    const rawPolicy = req.overdue_policy || 'overdue_policy_3';
    const hardcodedMap: Record<string, string> = {
      "기한 내 미납 시 일일 1%의 연체료 지불을 약속합니다.": "overdue_policy_1",
      "연체 시 일일 0.8%의 연체료가 부과됨에 동의합니다.": "overdue_policy_2",
      "연체 시 필리핀 법정 지연이자율 연 6% 이하 부과": "overdue_policy_3",
      "연체 시 매일 1% 연체료 부과": "overdue_policy_4",
      "기한 내 미납 시 일일 1% 연체료 지불을 약속합니다.": "overdue_policy_1",
      "연체 시 연 5% 지연이자율 적용": "overdue_policy_5",
      "연체 시 연 24% 법정 지연손해금 적용": "overdue_policy_6"
    };

    let policyKey = rawPolicy;
    if (hardcodedMap[rawPolicy]) {
      policyKey = hardcodedMap[rawPolicy];
    }

    setOverduePolicy(policyKey);

    if (['overdue_policy_3', 'overdue_policy_4', 'overdue_policy_5', 'overdue_policy_6'].includes(policyKey)) {
      setPolicyType(policyKey);
      setCustomPolicy('');
    } else {
      setPolicyType('custom');
      setCustomPolicy(policyKey);
    }

    setDescription(getSmartTranslatedText(req.description, t) || '');
    setDueDate(req.due_date || '');
    setTxStep(1);
    setIsTransactionOpen(true);
  };

  const handleCreatePost = async () => {
    if (!amount) {
      toast.error(t('toast_enter_amount'));
      return;
    }
    
    setIsSubmitting(true);
    try {
      const parsedAmount = parseFloat(amount);
      const parsedInterest = parseFloat(interestRate || '0');
      
      if (parsedInterest > 6) {
        toast.error(t('toast_interest_limit'));
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
          toast.error(t('toast_overdue_rate_violation'));
          setIsSubmitting(false);
          return;
        }
      }
      
      const isBorrower = matchingType === 'borrower';
      
      let calculatedDueDate: string | null = null;
      let durationText = '';

      // period 방식에 따른 다국어 텍스트 처리
      if (dueDateType === 'fixed') {
        calculatedDueDate = dueDate || null;
      } else {
        let daysToAdd = 30; // 기본값 30일 (1개월)
        if (periodValue === 'custom') {
          const customDays = parseInt(customPeriodDays || '30', 10);
          daysToAdd = isNaN(customDays) || customDays <= 0 ? 30 : customDays;
          durationText = `${daysToAdd}일`;
        } else {
          const pVal = parseInt(periodValue, 10);
          daysToAdd = isNaN(pVal) ? 30 : pVal;
          if (periodValue === '30') durationText = `1개월`;
          else if (periodValue === '60') durationText = `2개월`;
          else if (periodValue === '90') durationText = `3개월`;
          else durationText = `${daysToAdd}일`;
        }

        // 오늘 기준으로 일수 더하기
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + daysToAdd);
        calculatedDueDate = targetDate.toISOString().split('T')[0]; // YYYY-MM-DD 포맷
      }

      // 설명 문구에 기일 정보 및 조정 가능 옵션을 접두어로 조립 (다국어화 반영)
      let finalDescription = description || '';
      let badgePrefix = '';
      if (dueDateType === 'period') {
        const dueText = '만기';
        const insideText = '이내';
        const adjustText = '기일 조정 가능';
        badgePrefix = `[${dueText}: ${durationText} ${insideText}`;
        if (isAdjustable) {
          badgePrefix += ` / ${adjustText}`;
        }
        badgePrefix += '] ';
      } else {
        if (isAdjustable) {
          const adjustText = '기일 조정 가능';
          badgePrefix = `[${adjustText}] `;
        }
      }
      
      finalDescription = badgePrefix + finalDescription;

      let queryExec;

      if (isEditMode && editingPostId) {
        queryExec = supabase
          .from('matching_requests')
          .update({
            amount: parsedAmount,
            interest_rate: parsedInterest,
            description: finalDescription || null,
            due_date: calculatedDueDate,
            overdue_policy: overduePolicy || null,
            type: matchingType
          })
          .eq('id', editingPostId)
          .select();
      } else {
        queryExec = supabase
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
      }

      const { data, error } = await queryExec;

      if (error) throw error;

      toast.success(isEditMode ? (t('toast_post_updated') || '공고가 성공적으로 수정되었습니다.') : t('toast_post_registered'));
      setIsPostModalOpen(false);
      resetTransactionForm();
      fetchMarketplace();
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || t('toast_post_error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateTransaction = async () => {
    if (!amount || (isUserLender ? !lenderSignature : !borrowerSignature)) {
      toast.error(t('complete_all_fields'));
      return;
    }

    // 1차 신분증과 2차 신분증 중복 촬영 검사 (위변조 부정 거래 차단)
    const front1Url = idPhotos.front1?.publicUrl || idPhotos.front1?.preview;
    const front2Url = idPhotos.front2?.publicUrl || idPhotos.front2?.preview;
    const back1Url = idPhotos.back1?.publicUrl || idPhotos.back1?.preview;
    const back2Url = idPhotos.back2?.publicUrl || idPhotos.back2?.preview;

    if (front1Url && front2Url && front1Url === front2Url) {
      toast.error(t('security_warning_duplicate_front'), { duration: 6000 });
      return;
    }

    if (back1Url && back2Url && back1Url === back2Url) {
      toast.error(t('security_warning_duplicate_back'), { duration: 6000 });
      return;
    }
    
    setIsSubmitting(true);
    setIsUploadingPhotos(true);
    try {
      // 1. Upload ID Photos (사전 즉시 업로드된 이미지 URL 참조)
      const uploadedUrls: Record<string, string> = {};
      for (const [key, photo] of Object.entries(idPhotos)) {
        if (photo.publicUrl) {
          uploadedUrls[key] = photo.publicUrl;
        }
      }
      setIsUploadingPhotos(false);

      // 2. Update matching request status
      await supabase
        .from('matching_requests')
        .update({ status: 'completed' })
        .eq('id', selectedRequest?.id);

      // 3. Create actual loan record
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
          status: 'pending_signature',
          signature_data: JSON.stringify({
            lender: isUserLender ? lenderSignature : null,
            borrower: !isUserLender ? borrowerSignature : null
          }),
          verification_evidence: { 
            timestamp: new Date().toISOString(),
            method: 'Mobile Identity Capture',
            id_count: 2,
            photos_captured: Object.keys(uploadedUrls).length,
            photos: {
              lender: isUserLender ? uploadedUrls : null,
              borrower: !isUserLender ? uploadedUrls : null
            },
            interest_rate: parseFloat(interestRate || '0'),
            overdue_policy: overduePolicy,
            fee_payer_id: user?.id
          }
        }])
        .select()
        .single();

      if (error) throw error;
      
      toast.success(t('post_created') + ' (상대방 서약 대기 상태)');
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

  const handleOpenPartnerSignModal = (loan: any) => {
    setPartnerSignLoan(loan);
    setPartnerStep(1);
    setIdPhotos({
      front1: { file: null, preview: null, publicUrl: null },
      back1: { file: null, preview: null, publicUrl: null },
      front2: { file: null, preview: null, publicUrl: null },
      back2: { file: null, preview: null, publicUrl: null },
      selfie: { file: null, preview: null, publicUrl: null }
    });
    setLenderSignature(null);
    setBorrowerSignature(null);
    setIsPartnerSignOpen(true);
  };

  const handleCompletePartnerSign = async () => {
    if (!partnerSignLoan || !user?.id) return;

    const isLender = partnerSignLoan.lender_id === user.id;
    
    // 2. 기존 signature_data 안전 파싱
    let existingSigs: { lender?: string | null; borrower?: string | null } = {};
    try {
      const rawSigs = partnerSignLoan.signature_data;
      existingSigs = typeof rawSigs === 'string' ? JSON.parse(rawSigs || '{}') : (rawSigs || {});
    } catch {
      existingSigs = {};
    }

    const targetAsLender = isAdmin ? !existingSigs.lender : isLender;
    const requiredSignature = targetAsLender ? lenderSignature : borrowerSignature;

    if (!requiredSignature) {
      toast.error(t('complete_all_fields'));
      return;
    }

    // 중복 사진 체크
    const front1Url = idPhotos.front1?.publicUrl || idPhotos.front1?.preview;
    const front2Url = idPhotos.front2?.publicUrl || idPhotos.front2?.preview;
    const back1Url = idPhotos.back1?.publicUrl || idPhotos.back1?.preview;
    const back2Url = idPhotos.back2?.publicUrl || idPhotos.back2?.preview;

    if (front1Url && front2Url && front1Url === front2Url) {
      toast.error(t('security_warning_duplicate_front'), { duration: 6000 });
      return;
    }
    if (back1Url && back2Url && back1Url === back2Url) {
      toast.error(t('security_warning_duplicate_back'), { duration: 6000 });
      return;
    }

    setIsSubmitting(true);
    setIsUploadingPhotos(true);

    try {
      // 1. 이미지 업로드 URL 수집
      const uploadedUrls: Record<string, string> = {};
      for (const [key, photo] of Object.entries(idPhotos)) {
        if (photo.publicUrl) {
          uploadedUrls[key] = photo.publicUrl;
        }
      }
      setIsUploadingPhotos(false);

      let existingEvidence: any = {};
      try {
        const rawEv = partnerSignLoan.verification_evidence;
        existingEvidence = typeof rawEv === 'string' ? JSON.parse(rawEv || '{}') : (rawEv || {});
      } catch {
        existingEvidence = {};
      }

      // 새 사진 객체 초기화 보장
      if (!existingEvidence.photos) {
        existingEvidence.photos = { lender: null, borrower: null };
      }

      // 내 역할에 맞추어 서명 및 신원 정보 병합
      if (targetAsLender) {
        existingSigs.lender = lenderSignature;
        existingEvidence.photos.lender = uploadedUrls;
      } else {
        existingSigs.borrower = borrowerSignature;
        existingEvidence.photos.borrower = uploadedUrls;
      }

      // 최종 거래 성사를 위해 status를 waiting_transfer로 전환
      const { error } = await supabase
        .from('loans')
        .update({
          status: 'waiting_transfer',
          signature_data: JSON.stringify(existingSigs),
          verification_evidence: {
            ...existingEvidence,
            timestamp: new Date().toISOString(),
            id_count: 4, // 양자 모두 제출 완료되었으므로 최종 ID 스캔 수는 4개
            photos_captured: (existingEvidence.photos.lender ? Object.keys(existingEvidence.photos.lender).length : 0) + Object.keys(uploadedUrls).length
          }
        })
        .eq('id', partnerSignLoan.id);

      if (error) throw error;

      toast.success('거래 서약 완료! 이제 채권자 송금 대기 상태로 전환되었습니다.');
      setIsPartnerSignOpen(false);
      setPartnerSignLoan(null);
      fetchLoans();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || t('error_occurred'));
    } finally {
      setIsSubmitting(false);
      setIsUploadingPhotos(false);
    }
  };

  const handleConfirmTransfer = async (loan: any) => {
    if (!loan || isSubmitting) return;
    setIsSubmitting(true);
    try {
      let evidence = loan.verification_evidence;
      if (typeof evidence === 'string') {
        try { evidence = JSON.parse(evidence); } catch { evidence = {}; }
      } else {
        evidence = evidence || {};
      }
      evidence.transferred_at = new Date().toISOString();

      const { error } = await supabase
        .from('loans')
        .update({
          status: 'waiting_receipt',
          verification_evidence: evidence
        })
        .eq('id', loan.id);

      if (error) throw error;
      toast.success(t('transfer_completed_label') || '송금 완료 처리되었습니다.');
      fetchLoans();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || t('error_occurred'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmReceipt = async (loan: any) => {
    if (!loan || isSubmitting) return;
    setIsSubmitting(true);
    try {
      let evidence = loan.verification_evidence;
      if (typeof evidence === 'string') {
        try { evidence = JSON.parse(evidence); } catch { evidence = {}; }
      } else {
        evidence = evidence || {};
      }
      evidence.received_at = new Date().toISOString();

      const feePayerId = evidence.fee_payer_id || loan.lender_id;
      const transactionFee = parseFloat(loan.amount) * feeRate;

      const { data: profileData, error: profileErr } = await supabase
        .from('profiles')
        .select('credit')
        .eq('id', feePayerId)
        .single();

      if (profileErr) throw profileErr;

      const currentCredit = profileData?.credit ? parseFloat(profileData.credit.toString()) : 0;
      const newCredit = Math.max(0, currentCredit - transactionFee);

      const { error: creditError } = await supabase
        .from('profiles')
        .update({ credit: newCredit })
        .eq('id', feePayerId);

      if (creditError) throw creditError;

      const { error } = await supabase
        .from('loans')
        .update({
          status: 'pending',
          verification_evidence: evidence
        })
        .eq('id', loan.id);

      if (error) throw error;
      toast.success(t('receipt_completed_label') || '수령 및 계약 최종 성사 완료!');
      fetchLoans();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || t('error_occurred'));
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
      if (data && typeof window !== 'undefined') {
        localStorage.setItem('utang_cache_debts', JSON.stringify(data));
      }
    } catch (e: any) {
      console.error(e);
      if (typeof window !== 'undefined') {
        try {
          const cached = localStorage.getItem('utang_cache_debts');
          if (cached) {
            setDebts(JSON.parse(cached));
            toast.info(t('viewing_cached_data'));
          }
        } catch (cacheErr) {
          console.error(cacheErr);
        }
      }
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

  useEffect(() => {
    if (mounted && typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab');
      const requestIdParam = params.get('requestId');
      
      if (tabParam === 'marketplace') {
        setActiveTab('marketplace');
      }
      
      if (requestIdParam) {
        const fetchAndStart = async () => {
          try {
            const { data, error } = await supabase
              .from('matching_requests')
              .select(`
                *,
                poster_profile:profiles!matching_requests_borrower_id_fkey(full_name, trust_tier, trust_score, is_verified)
              `)
              .eq('id', requestIdParam)
              .single();
            if (error) throw error;
            if (data) {
              handleStartTransaction(data);
            }
          } catch (err) {
            console.error('Error fetching request from URL param:', err);
          }
        };
        fetchAndStart();
      }
    }
  }, [mounted]);

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
      toast.error(t('toast_attach_receipt'));
      return;
    }
    
    if (paymentMethod === 'gcash') {
      if (!gcashReference || gcashReference.trim().length < 8) {
        toast.error(t('toast_ref_number_invalid'));
        return;
      }
    } else {
      if (!walletAddress || walletAddress.trim().length < 10) {
        toast.error(t('toast_wallet_address_invalid'));
        return;
      }
    }
    
    if (!amountClaimed || parseFloat(amountClaimed) <= 0) {
      toast.error(t('toast_enter_deposit_amount'));
      return;
    }
    
    if (!depositedAt) {
      toast.error(t('toast_enter_deposit_time'));
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
        throw new Error(`${t('toast_upload_failed')}: ${uploadError.message}`);
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
      const methodLabel = paymentMethod === 'gcash' ? 'GCash' : `${coinType.toUpperCase()} ${t('coin_label')}`;
      await supabase
        .from('notifications')
        .insert({
          user_id: payingLoan.lender_id,
          title: t('toast_repay_notification_title'),
          message: t('toast_repay_notification_msg').replace('{name}', profile?.full_name || t('borrower_label')).replace('{method}', methodLabel).replace('{amount}', Number(amountClaimed).toLocaleString()),
          type: 'payment'
        });

      toast.success(t('toast_repay_submitted'));
      setIsPaymentOpen(false);
      resetGCashPaymentForm();
      fetchLoans();
    } catch (err: any) {
      console.error('Payment proof error:', err);
      toast.error(err.message || t('toast_repay_error'));
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
          toast.success(t('toast_confirm_approved'));
        } else {
          toast.success(t('toast_confirm_rejected'));
        }
        fetchLoans();
      } else {
        toast.error(result.error || t('toast_confirm_error'));
      }
    } catch (err: any) {
      console.error('Lender confirm error:', err);
      toast.error(t('toast_server_error'));
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
              className={`h-11 px-4 rounded-xl text-xs font-black transition-all duration-300 flex items-center gap-1.5 ${activeTab === 'marketplace' ? 'bg-white dark:bg-blue-600 shadow-md text-blue-600 dark:text-white' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Users className="w-3.5 h-3.5" />
              {t('marketplace')}
            </button>
            <button 
              onClick={() => setActiveTab('history')}
              className={`h-11 px-4 rounded-xl text-xs font-black transition-all duration-300 flex items-center gap-1.5 ${activeTab === 'history' ? 'bg-white dark:bg-blue-600 shadow-md text-blue-600 dark:text-white' : 'text-slate-500 hover:text-slate-700'}`}
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
                className={`flex-1 rounded-xl font-black h-11 text-xs shadow-sm transition-all ${matchingType === 'borrower' ? 'bg-blue-600 text-white' : 'border-slate-200 dark:border-white/10'}`}
              >
                {t('borrower_list')}
              </Button>
              <Button 
                variant={matchingType === 'lender' ? 'default' : 'outline'}
                onClick={() => setMatchingType('lender')}
                className={`flex-1 rounded-xl font-black h-11 text-xs shadow-sm transition-all ${matchingType === 'lender' ? 'bg-blue-600 text-white' : 'border-slate-200 dark:border-white/10'}`}
              >
                {t('lender_list')}
              </Button>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex gap-1.5">
                <div className="relative flex-1 group">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                  <Input 
                    placeholder={t('search_users_placeholder')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 h-11 text-xs rounded-xl border-slate-200 dark:border-white/5 bg-white dark:bg-white/5 font-bold focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <Button 
                  className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl w-11 h-11 p-0 shadow-md active:scale-95 transition-transform shrink-0 flex items-center justify-center"
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
                {matchingType === 'borrower' ? t('register_borrow_post') : t('register_lend_post')}
              </Button>

              {/* Sorting Chips */}
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setSortAmount(prev => prev === 'asc' ? null : 'asc')}
                  className={`px-2.5 py-1 text-[10px] font-bold rounded-full transition-all border ${sortAmount === 'asc' ? 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-500/20 dark:text-blue-400 dark:border-blue-500/30' : 'bg-slate-50 text-slate-500 border-slate-200 dark:bg-white/5 dark:text-slate-400 dark:border-white/10'}`}
                >
                  {t('sort_low_amount')}
                </button>
                <button
                  onClick={() => setSortAmount(prev => prev === 'desc' ? null : 'desc')}
                  className={`px-2.5 py-1 text-[10px] font-bold rounded-full transition-all border ${sortAmount === 'desc' ? 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-500/20 dark:text-blue-400 dark:border-blue-500/30' : 'bg-slate-50 text-slate-500 border-slate-200 dark:bg-white/5 dark:text-slate-400 dark:border-white/10'}`}
                >
                  {t('sort_high_amount')}
                </button>
                <button
                  onClick={() => setSortInterest(prev => prev === 'asc' ? null : 'asc')}
                  className={`px-2.5 py-1 text-[10px] font-bold rounded-full transition-all border ${sortInterest === 'asc' ? 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-500/20 dark:text-blue-400 dark:border-blue-500/30' : 'bg-slate-50 text-slate-500 border-slate-200 dark:bg-white/5 dark:text-slate-400 dark:border-white/10'}`}
                >
                  {t('sort_low_interest')}
                </button>
                <button
                  onClick={() => setSortInterest(prev => prev === 'desc' ? null : 'desc')}
                  className={`px-2.5 py-1 text-[10px] font-bold rounded-full transition-all border ${sortInterest === 'desc' ? 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-500/20 dark:text-blue-400 dark:border-blue-500/30' : 'bg-slate-50 text-slate-500 border-slate-200 dark:bg-white/5 dark:text-slate-400 dark:border-white/10'}`}
                >
                  {t('sort_high_interest')}
                </button>
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
                          {t('post_date')}: {format(new Date(req.created_at), 'yyyy-MM-dd')}
                        </p>
                      </div>
                    </div>
                    {req.borrower_id === user?.id || req.lender_id === user?.id ? (
                      <div className="flex gap-1 shrink-0">
                        <Button 
                          onClick={() => handleEditPost(req)}
                          className="bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/20 text-slate-800 dark:text-white rounded-xl font-bold px-3 h-9 text-[11px] active:scale-95 transition-transform"
                        >
                          {t('edit') || '수정'}
                        </Button>
                        <Button 
                          onClick={() => handleDeletePost(req.id)}
                          className="bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-bold px-3 h-9 text-[11px] active:scale-95 transition-transform"
                        >
                          {t('delete') || '삭제'}
                        </Button>
                        {isAdmin && (
                          <Button 
                            onClick={() => handleStartTransaction(req)}
                            className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black px-3.5 h-9 text-xs shadow-md active:scale-95 shrink-0"
                          >
                            {t('transact')}
                          </Button>
                        )}
                      </div>
                    ) : (
                      <Button 
                        onClick={() => handleStartTransaction(req)}
                        className="bg-slate-900 dark:bg-white dark:text-slate-950 hover:bg-blue-600 hover:text-white dark:hover:bg-blue-600 transition-colors rounded-xl font-black px-3.5 h-9 text-xs shadow-md active:scale-95 shrink-0"
                      >
                        {t('transact')}
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5">
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{t('principal')}</p>
                      <p className="font-bold text-slate-800 dark:text-slate-200 text-xs">PHP {Number(req.amount).toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{t('interest_rate_label')}</p>
                      <p className="font-bold text-blue-600 dark:text-blue-400 text-xs">{req.interest_rate || 0}%</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{t('repayment_amount')}</p>
                      <p className="font-black text-slate-900 dark:text-white text-xs">PHP {totalRepayment.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{t('due_date')}</p>
                      <p className="font-bold text-rose-500 dark:text-rose-400 text-xs">
                        {req.due_date ? format(new Date(req.due_date), 'yyyy-MM-dd') : '-'}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-1 px-1 border-t border-dashed border-slate-100 dark:border-white/5 pt-1.5">
                    {req.description && (
                      <div className="flex gap-1.5 text-[11px]">
                        <span className="font-bold text-slate-400 shrink-0">{t('transaction_description_label')}:</span>
                        <span className="font-bold text-slate-700 dark:text-slate-300">{getSmartTranslatedText(req.description, t)}</span>
                      </div>
                    )}
                    {req.overdue_policy && (
                      <div className="flex gap-1.5 text-[11px]">
                        <span className="font-bold text-rose-400/80 shrink-0">{t('overdue_rules_label')}:</span>
                        <span className="font-bold text-rose-600 dark:text-rose-400">{getSmartTranslatedText(req.overdue_policy, t)}</span>
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
              // verification_evidence 안전 파싱 (DB에서 string 또는 object로 올 수 있음)
              let evidence = loan.verification_evidence;
              if (typeof evidence === 'string') {
                try { evidence = JSON.parse(evidence); } catch { evidence = null; }
              }
              // signature_data 안전 파싱
              let sigData: { lender?: string; borrower?: string } = {};
              try {
                const raw = loan.signature_data;
                sigData = typeof raw === 'string' ? JSON.parse(raw || '{}') : (raw || {});
              } catch { sigData = {}; }
              return (
                <Card key={loan.id} className="p-6 border-slate-100 dark:border-white/5 bg-white dark:bg-slate-900/50 rounded-3xl border-b-4 border-b-slate-50 dark:border-b-white/5 animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black shadow-sm ${isLender ? 'bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400' : 'bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400'}`}>
                        <span className="text-xs font-black">{isLender ? 'LEND' : 'BORROW'}</span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-slate-400 uppercase tracking-wider">{isLender ? t('lent_credit') : t('borrowed_debt')}</span>
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
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">{t('principal')}</p>
                      <p className="font-extrabold text-slate-800 dark:text-slate-200">PHP {Number(loan.amount).toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">{t('interest_rate_label')}</p>
                      <p className="font-extrabold text-blue-600 dark:text-blue-400">{loan.interest_rate || 0}%</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">{t('repayment_amount')}</p>
                      <p className="font-black text-slate-900 dark:text-white">PHP {totalRepayment.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">{t('due_date')}</p>
                      <p className="font-extrabold text-rose-500 dark:text-rose-400">
                        {loan.due_date ? format(new Date(loan.due_date), 'yyyy-MM-dd') : '-'}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-1.5 px-1">
                    {loan.description && (
                      <div className="flex gap-2 text-xs">
                        <span className="font-bold text-slate-400 shrink-0">{t('transaction_description_label')}:</span>
                        <span className="font-bold text-slate-700 dark:text-slate-300">{getSmartTranslatedText(loan.description, t)}</span>
                      </div>
                    )}
                    {loan.overdue_policy && (
                      <div className="flex gap-2 text-xs">
                        <span className="font-bold text-rose-400/80 shrink-0">{t('overdue_rules_label')}:</span>
                        <span className="font-bold text-rose-600 dark:text-rose-400">{getSmartTranslatedText(loan.overdue_policy, t)}</span>
                      </div>
                    )}
                    {loan.status === 'paid' && loan.paid_at && (
                      <div className="flex gap-2 text-xs mt-2 pt-2 border-t border-dashed border-emerald-200 dark:border-emerald-800">
                        <span className="font-bold text-emerald-500 shrink-0">{t('payment_completed_label') || t('paid')}:</span>
                        <span className="font-bold text-emerald-700 dark:text-emerald-400">
                          {format(new Date(loan.paid_at), 'yyyy-MM-dd HH:mm')} | {loan.payment_method?.toUpperCase()} | Ref: {loan.payment_reference}
                        </span>
                      </div>
                    )}
                    
                    {/* 서명 대기 상태 관련 로직 추가 */}
                    {(() => {
                    const isMySignaturePending = loan.status === 'pending_signature' && (
                      isAdmin ||
                      (loan.lender_id === user?.id && !sigData.lender) ||
                      (loan.borrower_id === user?.id && !sigData.borrower)
                    );
                    const isPartnerSignaturePending = loan.status === 'pending_signature' && !isAdmin && !isMySignaturePending;
                    const isWaitingTransfer = loan.status === 'waiting_transfer';
                    const isWaitingReceipt = loan.status === 'waiting_receipt';
                    const isPdfDisabled = ['pending_signature', 'waiting_transfer', 'waiting_receipt'].includes(loan.status);

                    return (
                      <div className="mt-3.5 pt-2 border-t border-slate-100 dark:border-white/5 flex flex-col gap-2">
                        {/* 내가 서명해야 하는 대기 상태인 경우 */}
                        {isMySignaturePending && (
                          <Button
                            onClick={() => handleOpenPartnerSignModal(loan)}
                            className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-xs shadow-md active:scale-95 transition-all flex items-center justify-center gap-1.5"
                          >
                            <Signature className="w-4 h-4" />
                            <span>{t('sign_agreement_btn')}</span>
                          </Button>
                        )}

                        {/* 상대방 서명을 기다리는 중인 경우 알림 배너 */}
                        {isPartnerSignaturePending && (
                          <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 rounded-xl text-[10px] font-bold text-center leading-normal">
                            {t('partner_sig_pending')}
                          </div>
                        )}

                        {/* 채권자 송금 대기 상태 */}
                        {isWaitingTransfer && (
                          isLender ? (
                            <Button
                              onClick={() => handleConfirmTransfer(loan)}
                              disabled={isSubmitting}
                              className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-xs shadow-md active:scale-95 transition-all flex items-center justify-center gap-1.5"
                            >
                              <CreditCard className="w-4 h-4" />
                              <span>{t('confirm_transfer_btn') || '송금 완료 확인'}</span>
                            </Button>
                          ) : (
                            <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 rounded-xl text-[10px] font-bold text-center leading-normal animate-pulse">
                              {t('waiting_lender_transfer') || '채권자의 송금을 기다리는 중입니다.'}
                            </div>
                          )
                        )}

                        {/* 채무자 수령 대기 상태 */}
                        {isWaitingReceipt && (
                          !isLender ? (
                            <Button
                              onClick={() => handleConfirmReceipt(loan)}
                              disabled={isSubmitting}
                              className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs shadow-md active:scale-95 transition-all flex items-center justify-center gap-1.5"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                              <span>{t('confirm_receipt_btn') || '수령 완료 확인'}</span>
                            </Button>
                          ) : (
                            <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 rounded-xl text-[10px] font-bold text-center leading-normal animate-pulse">
                              {t('waiting_borrower_receipt') || '채무자의 수령 확인을 기다리는 중입니다.'}
                            </div>
                          )
                        )}

                        {/* 하단 버튼 제어 */}
                        <div className={`grid ${isPdfDisabled ? 'grid-cols-1' : 'grid-cols-3'} gap-2 w-full`}>
                          {!isPdfDisabled && (
                            <>
                              <Button
                                onClick={() => handleDownloadContractPDF(loan)}
                                disabled={isGeneratingPDF === loan.id}
                                variant="outline"
                                className="rounded-xl font-bold h-11 text-[10px] sm:text-xs border-slate-200 dark:border-white/10 active:scale-95 transition-transform flex items-center justify-center gap-1 text-slate-700 dark:text-slate-200"
                              >
                                {isGeneratingPDF === loan.id ? t('preparing_pdf') : t('download_pdf')}
                              </Button>

                              <Button
                                onClick={() => handleDownloadContractPDF(loan, true)}
                                disabled={isGeneratingPDF === loan.id}
                                variant="outline"
                                className="rounded-xl font-bold h-11 text-[10px] sm:text-xs border-slate-200 dark:border-white/10 active:scale-95 transition-transform flex items-center justify-center gap-1 text-slate-700 dark:text-slate-200"
                              >
                                {isGeneratingPDF === loan.id ? t('preparing_pdf') : (t('preview_pdf') || '미리보기')}
                              </Button>
                            </>
                          )}
                          
                          <Button
                            onClick={() => toggleEvidence(loan.id)}
                            variant="outline"
                            className="rounded-xl font-bold h-11 text-[10px] sm:text-xs border-slate-200 dark:border-white/10 active:scale-95 transition-transform flex items-center justify-center gap-1 text-slate-700 dark:text-slate-200 w-full"
                          >
                            {expandedEvidence[loan.id] ? (
                              <>
                                <EyeOff className="w-3.5 h-3.5" />
                                <span>{t('close_proof')}</span>
                              </>
                            ) : (
                              <>
                                <Eye className="w-3.5 h-3.5" />
                                <span>{t('view_proof_photos')}</span>
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    );
                  })()}

                    {/* Expanded Identity Evidence Grid View */}
                    {expandedEvidence[loan.id] && (
                      <div className="mt-4 p-5 rounded-[24px] border border-blue-500/10 bg-blue-500/5 dark:bg-blue-500/5 space-y-5 animate-in slide-in-from-top-2 duration-300">
                        {/* 1. 채권자 신원 정보 영역 */}
                        <div className="space-y-2.5">
                          <span className="text-[10px] font-black uppercase text-blue-600 dark:text-blue-400 tracking-widest block">
                            {t('lender')} {t('identity_verification')}
                          </span>
                          {loan.status === 'pending_signature' && !isLender ? (
                            <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-[10px] text-slate-400 font-bold italic text-center">
                              {t('evidence_hidden_before_success')}
                            </div>
                          ) : (
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                              {[
                                { key: 'front1', label: t('id_front_1') },
                                { key: 'back1', label: t('id_back_1') },
                                { key: 'front2', label: t('id_front_2') },
                                { key: 'back2', label: t('id_back_2') },
                                { key: 'selfie', label: t('selfie_label') }
                              ].map((photoItem) => {
                                const photoUrl = evidence?.photos?.lender?.[photoItem.key] || (loan.status !== 'pending_signature' && evidence?.photos?.[photoItem.key]);
                                return (
                                  <div key={photoItem.key} className="space-y-1 text-center">
                                    <div className={`aspect-[4/3] ${photoItem.key === 'selfie' ? 'rounded-full max-w-[64px] max-h-[64px] mx-auto' : 'rounded-xl'} bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-white/10 overflow-hidden relative group`}>
                                      {photoUrl ? (
                                        <img src={photoUrl} alt={photoItem.label} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" />
                                      ) : (
                                        <div className="w-full h-full flex items-center justify-center text-slate-400 dark:text-slate-600 bg-slate-200/50 dark:bg-slate-800/50 text-[10px] italic">
                                          {t('not_submitted')}
                                        </div>
                                      )}
                                    </div>
                                    <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wide block">{photoItem.label}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* 2. 채무자 신원 정보 영역 */}
                        <div className="space-y-2.5 border-t border-blue-500/10 pt-3">
                          <span className="text-[10px] font-black uppercase text-blue-600 dark:text-blue-400 tracking-widest block">
                            {t('borrower')} {t('identity_verification')}
                          </span>
                          {loan.status === 'pending_signature' && isLender ? (
                            <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-[10px] text-slate-400 font-bold italic text-center">
                              {t('evidence_hidden_before_success')}
                            </div>
                          ) : (
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                              {[
                                { key: 'front1', label: t('id_front_1') },
                                { key: 'back1', label: t('id_back_1') },
                                { key: 'front2', label: t('id_front_2') },
                                { key: 'back2', label: t('id_back_2') },
                                { key: 'selfie', label: t('selfie_label') }
                              ].map((photoItem) => {
                                const photoUrl = evidence?.photos?.borrower?.[photoItem.key] || (loan.status !== 'pending_signature' && evidence?.photos?.[photoItem.key]);
                                return (
                                  <div key={photoItem.key} className="space-y-1 text-center">
                                    <div className={`aspect-[4/3] ${photoItem.key === 'selfie' ? 'rounded-full max-w-[64px] max-h-[64px] mx-auto' : 'rounded-xl'} bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-white/10 overflow-hidden relative group`}>
                                      {photoUrl ? (
                                        <img src={photoUrl} alt={photoItem.label} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" />
                                      ) : (
                                        <div className="w-full h-full flex items-center justify-center text-slate-400 dark:text-slate-600 bg-slate-200/50 dark:bg-slate-800/50 text-[10px] italic">
                                          {t('not_submitted')}
                                        </div>
                                      )}
                                    </div>
                                    <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wide block">{photoItem.label}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* Signatures Row */}
                        <div className="grid grid-cols-2 gap-4 border-t border-blue-500/10 pt-3">
                          <div className="text-center bg-white dark:bg-slate-900/60 p-3 rounded-2xl border border-slate-100 dark:border-white/5">
                            <span className="text-[8px] font-black text-slate-400 uppercase block mb-1">LENDER SIGNATURE</span>
                            <div className="h-12 flex items-center justify-center">
                              {loan.status === 'pending_signature' && !isLender ? (
                                <span className="text-[9px] text-slate-400 italic">비공개</span>
                              ) : sigData.lender ? (
                                <img src={sigData.lender} alt="Lender Signature" className="max-h-10 object-contain" />
                              ) : (
                                <span className="text-[9px] text-slate-400 italic">{t('no_signature')}</span>
                              )}
                            </div>
                          </div>
                          <div className="text-center bg-white dark:bg-slate-900/60 p-3 rounded-2xl border border-slate-100 dark:border-white/5">
                            <span className="text-[8px] font-black text-slate-400 uppercase block mb-1">BORROWER SIGNATURE</span>
                            <div className="h-12 flex items-center justify-center">
                              {loan.status === 'pending_signature' && isLender ? (
                                <span className="text-[9px] text-slate-400 italic">비공개</span>
                              ) : sigData.borrower ? (
                                <img src={sigData.borrower} alt="Borrower Signature" className="max-h-10 object-contain" />
                              ) : (
                                <span className="text-[9px] text-slate-400 italic">{t('no_signature')}</span>
                              )}
                            </div>
                          </div>
                        </div>
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
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">{t('gcash_payment_proof')}</span>
                          </div>
                          <div>
                            <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full shadow-sm inline-block ${
                              latestProof.status === 'submitted' ? 'bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400' :
                              latestProof.status === 'confirmed' || latestProof.status === 'auto_confirmed' ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400' :
                              'bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400'
                            }`}>
                              {latestProof.status === 'submitted' ? t('proof_status_submitted') :
                               latestProof.status === 'confirmed' ? t('proof_status_confirmed') :
                               latestProof.status === 'auto_confirmed' ? t('proof_status_auto_confirmed') : t('proof_status_rejected')}
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3.5 text-xs border-t border-dashed border-slate-200 dark:border-white/5 pt-3">
                          <div>
                            <span className="font-bold text-slate-400">{t('gcash_ref_label')}</span>
                            <p className="font-extrabold text-slate-700 dark:text-slate-200 mt-0.5">{latestProof.gcash_reference || '-'}</p>
                          </div>
                          <div>
                            <span className="font-bold text-slate-400">{t('actual_deposit_label')}</span>
                            <p className="font-extrabold text-slate-700 dark:text-slate-200 mt-0.5">PHP {Number(latestProof.amount_claimed).toLocaleString()}</p>
                          </div>
                          <div>
                            <span className="font-bold text-slate-400">{t('deposit_time_label')}</span>
                            <p className="font-extrabold text-slate-700 dark:text-slate-200 mt-0.5">
                              {latestProof.deposited_at ? format(new Date(latestProof.deposited_at), 'yyyy-MM-dd HH:mm') : '-'}
                            </p>
                          </div>
                          <div>
                            <span className="font-bold text-slate-400">{t('submitted_at_label')}</span>
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
                                ? t('proof_lender_guide') 
                                : t('proof_borrower_guide')}
                              <p className="mt-1 text-[10px] text-amber-500/80 font-black">
                                {t('auto_confirm_scheduled')} {format(new Date(latestProof.auto_confirm_deadline), 'yyyy-MM-dd HH:mm')}
                              </p>
                            </div>
                          </div>
                        )}

                        {latestProof.status === 'rejected' && (
                          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-500/5 border border-rose-500/10 text-rose-600 dark:text-rose-400">
                            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                            <div className="text-[11px] font-bold">
                              {t('proof_rejected_guide')}
                            </div>
                          </div>
                        )}

                        {latestProof.screenshot_url && (
                          <div className="space-y-1.5 pt-1">
                            <span className="font-bold text-slate-400 text-xs">{t('attached_receipt')}</span>
                            <div className="relative aspect-[4/3] w-full max-w-[200px] rounded-2xl overflow-hidden border border-slate-200 dark:border-white/10 group cursor-pointer shadow-sm">
                              <img 
                                src={latestProof.screenshot_url} 
                                alt="GCash Receipt" 
                                className="w-full h-full object-cover transition-transform group-hover:scale-105"
                                onClick={() => window.open(latestProof.screenshot_url, '_blank')}
                              />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-[10px] font-black transition-opacity">
                                {t('view_larger_label')}
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
                              {t('reject_btn')}
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
                              {t('confirm_deposit_btn')}
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
                        {t('repay_with_gcash').replace('{amount}', Number(loan.repay_amount).toLocaleString())}
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
        <DialogContent 
          style={isCameraOpen ? { display: 'none' } : undefined}
          className="max-w-md w-[95%] h-[85vh] md:h-[75vh] rounded-[32px] dark:bg-slate-950 dark:border-white/5 px-6 pt-8 flex flex-col outline-none overflow-hidden"
        >
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
                    <Label className="font-black text-[10px] uppercase tracking-[0.2em] text-slate-400 px-1">{t('amount_php')}</Label>
                    <Input 
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                      className="h-16 rounded-2xl text-2xl font-black bg-slate-50 dark:bg-white/5 border-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  
                  <div className="space-y-3">
                    <Label className="font-black text-[10px] uppercase tracking-[0.2em] text-slate-400 px-1">{t('interest_rate_percent')}</Label>
                    <Input 
                      type="number"
                      value={interestRate}
                      onChange={(e) => setInterestRate(e.target.value)}
                      onFocus={(e) => { if (interestRate === '0') setInterestRate(''); }}
                      onBlur={(e) => { if (e.target.value === '') setInterestRate('0'); }}
                      placeholder="0"
                      className="h-16 rounded-2xl text-xl font-black bg-slate-50 dark:bg-white/5 border-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div className="space-y-3">
                    <Label className="font-black text-[10px] uppercase tracking-[0.2em] text-slate-400 px-1">{t('repayment_amount_due')}</Label>
                    <div className="h-20 flex flex-col justify-center px-5 rounded-2xl bg-blue-500/10 dark:bg-blue-600/20 border border-blue-500/25">
                      <span className="text-[10px] font-black uppercase tracking-[0.1em] text-blue-600 dark:text-blue-400 mb-0.5">{t('total_repay_amount_desc')}</span>
                      <span className="text-2xl font-black text-blue-700 dark:text-blue-300">
                        { (Number(amount || 0) * (1 + Number(interestRate || 0) / 100)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
                      </span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Label className="font-black text-[10px] uppercase tracking-[0.2em] text-slate-400 px-1">{t('overdue_policy_label')}</Label>
                    <Select value={policyType} onValueChange={(value) => {
                      setPolicyType(value);
                      if (value !== 'custom') {
                        setOverduePolicy(value);
                      } else {
                        setOverduePolicy(customPolicy || 'custom');
                      }
                    }}>
                      <SelectTrigger className="h-16 rounded-2xl bg-slate-50 dark:bg-white/5 border-none font-bold focus:ring-2 focus:ring-blue-500">
                        <SelectValue placeholder={t('overdue_policy_placeholder')} />
                      </SelectTrigger>
                      <SelectContent className="rounded-2xl dark:bg-slate-900 border-none shadow-xl">
                        <SelectItem value="overdue_policy_4" className="font-bold">{t('overdue_policy_4')}</SelectItem>
                        <SelectItem value="overdue_policy_5" className="font-bold">{t('overdue_policy_5')}</SelectItem>
                        <SelectItem value="overdue_policy_6" className="font-bold">{t('overdue_policy_6')}</SelectItem>
                        <SelectItem value="custom" className="font-bold">{t('custom')}</SelectItem>
                      </SelectContent>
                    </Select>
                    {policyType === 'custom' && (
                      <Input 
                        value={customPolicy}
                        onChange={(e) => {
                          setCustomPolicy(e.target.value);
                          setOverduePolicy(e.target.value);
                        }}
                        placeholder={t('custom_policy_placeholder')}
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
                          <span>{t('platform_fee_label')}</span>
                          <span>PHP {transactionFee.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] font-bold opacity-80 border-t border-current/10 pt-2">
                          <span>{t('available_recharge_credit')}</span>
                          <span>PHP {currentCredit.toLocaleString()}</span>
                        </div>
                        {isInsufficient && (
                          <div className="space-y-3 mt-2">
                            <div className="text-[10px] font-extrabold text-rose-500 bg-rose-500/5 p-3 rounded-xl border border-rose-500/10 leading-relaxed">
                              {isZeroCredit ? t('no_credit_msg') : t('credit_insufficient_msg')}
                            </div>
                            <Link 
                              href="/deposit"
                              className="flex items-center justify-center gap-2 w-full py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-[16px] font-black text-xs shadow-md shadow-rose-500/25 active:scale-95 transition-all text-center"
                            >
                              <span>{t('recharge_credit_go')}</span>
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
                      <div 
                        onClick={() => {
                          setActivePhotoId(p.id);
                          setCameraMode('id');
                          setIsTransactionOpen(false);
                          setIsCameraOpen(true);
                        }}
                        className="aspect-[4/3] bg-slate-50 dark:bg-white/5 rounded-[32px] border-2 border-dashed border-slate-200 dark:border-white/10 flex flex-col items-center justify-center gap-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-white/10 transition-all relative overflow-hidden group"
                      >
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
                      </div>
                    </div>
                  ))}
                </div>

                {/* 추가 본인 대조 Selfie 촬영 영역 (가로 전체 100%) */}
                <div className="space-y-2 text-center">
                  <div 
                    onClick={() => {
                      setActivePhotoId('selfie');
                      setCameraMode('selfie');
                      setIsTransactionOpen(false);
                      setIsCameraOpen(true);
                    }}
                    className="w-full h-28 bg-slate-50 dark:bg-white/5 rounded-[32px] border-2 border-dashed border-slate-200 dark:border-white/10 flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-slate-100 dark:hover:bg-white/10 transition-all relative overflow-hidden group"
                  >
                    {idPhotos.selfie?.preview ? (
                      <div className="flex items-center gap-4 w-full h-full px-6">
                        <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-blue-500">
                          <img src={idPhotos.selfie.preview} alt="Selfie" className="w-full h-full object-cover" />
                        </div>
                        <div className="text-left">
                          <p className="text-xs font-black text-blue-600 uppercase tracking-wide">Selfie Captured</p>
                          <p className="text-[10px] text-slate-400 font-bold mt-1">{t('selfie_verified_label')}</p>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="w-10 h-10 rounded-full bg-white dark:bg-slate-800 shadow-sm flex items-center justify-center group-hover:scale-110 transition-transform">
                          <Camera className="w-5 h-5 text-blue-600" />
                        </div>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">{t('selfie_capture_required')}</span>
                      </>
                    )}
                  </div>
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
                {isUserLender ? (
                  <>
                    <div className="space-y-4">
                      <Label className="font-black text-[10px] uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2 px-1">
                        <Signature className="w-4 h-4 text-blue-500" /> {t('lender_signature')}
                      </Label>
                      <SignaturePad onSave={setLenderSignature} onClear={() => setLenderSignature(null)} />
                    </div>
                    <div className="space-y-4 p-5 rounded-[24px] border border-dashed border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 flex flex-col items-center justify-center text-center">
                      <Clock className="w-8 h-8 text-slate-400 animate-pulse" />
                      <span className="text-xs font-bold text-slate-500 mt-2">{t('partner_sig_pending')}</span>
                      <span className="text-[10px] text-slate-400 mt-1">Lender(나)의 서약 작성 후 대기 상태로 등록됩니다.</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="space-y-4 p-5 rounded-[24px] border border-dashed border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 flex flex-col items-center justify-center text-center">
                      <Clock className="w-8 h-8 text-slate-400 animate-pulse" />
                      <span className="text-xs font-bold text-slate-500 mt-2">{t('partner_sig_pending')}</span>
                      <span className="text-[10px] text-slate-400 mt-1">Borrower(나)의 서약 작성 후 대기 상태로 등록됩니다.</span>
                    </div>
                    <div className="space-y-4">
                      <Label className="font-black text-[10px] uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2 px-1">
                        <Signature className="w-4 h-4 text-blue-500" /> {t('borrower_signature')}
                      </Label>
                      <SignaturePad onSave={setBorrowerSignature} onClear={() => setBorrowerSignature(null)} />
                    </div>
                  </>
                )}
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
                  onClick={() => {
                    if (txStep === 2 && !isSelfAdminTx) {
                      const front1Captured = !!idPhotos.front1.preview;
                      const back1Captured = !!idPhotos.back1.preview;
                      const front2Captured = !!idPhotos.front2.preview;
                      const back2Captured = !!idPhotos.back2.preview;
                      const selfieCaptured = !!idPhotos.selfie?.preview;
                      
                      if (!front1Captured || !back1Captured || !front2Captured || !back2Captured || !selfieCaptured) {
                        setIsIdWarningOpen(true);
                        return;
                      }
                    }
                    if (txStep === 3) {
                      setIsCreditDeductOpen(true);
                      return;
                    }
                    txStep < 3 ? setTxStep(prev => prev + 1) : handleCreateTransaction();
                  }}
                  disabled={(txStep === 1 && (!amount || isCreditInsufficient)) || (txStep === 3 && (isUserLender ? !lenderSignature : !borrowerSignature)) || isSubmitting || isUploadingPhotos}
                  className="flex-1 h-16 bg-blue-600 hover:bg-blue-700 text-white rounded-[24px] font-black text-xl shadow-2xl shadow-blue-500/40 active:scale-95 transition-all"
                >
                  {txStep === 3 ? (isSubmitting || isUploadingPhotos ? t('saving') : t('confirm_and_save')) : t('next')}
                </Button>
              );
            })()}
          </div>
        </DialogContent>
      </Dialog>

      {/* ID Verification Warning Modal */}
      <Dialog open={isIdWarningOpen} onOpenChange={setIsIdWarningOpen}>
        <DialogContent className="max-w-sm w-[90%] rounded-[32px] dark:bg-slate-950 dark:border-white/5 p-6 outline-none flex flex-col items-center text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-rose-100 dark:bg-rose-500/10 flex items-center justify-center text-rose-600 dark:text-rose-400">
            <AlertTriangle className="w-8 h-8 animate-bounce" />
          </div>
          <DialogHeader>
            <DialogTitle className="text-xl font-black dark:text-white">
              {t('id_warning_title')}
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-bold">
            {t('id_warning_message')}
          </p>
          <Button 
            onClick={() => setIsIdWarningOpen(false)}
            className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black text-sm active:scale-95 transition-all shadow-md"
          >
            {t('confirm')}
          </Button>
        </DialogContent>
      </Dialog>

      {/* Credit Deduction Consent & Reminder Modal */}
      <Dialog open={isCreditDeductOpen} onOpenChange={setIsCreditDeductOpen}>
        <DialogContent className="max-w-md w-[95%] rounded-[32px] dark:bg-slate-950 dark:border-white/5 p-6 outline-none flex flex-col space-y-5">
          <DialogHeader>
            <DialogTitle className="text-xl font-black dark:text-white text-center">
              {t('credit_deduction_title')}
            </DialogTitle>
          </DialogHeader>

          {(() => {
            const transactionFee = parseFloat(amount || '0') * feeRate;
            const currentCredit = profile?.credit ? parseFloat(profile.credit.toString()) : 0;
            const isCreditInsufficient = currentCredit <= 0 || currentCredit < transactionFee;
            const remainingCredit = currentCredit - transactionFee;

            return (
              <div className="space-y-5 text-sm font-bold">
                <div className="p-4 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-white/5 space-y-2.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400">{t('amount_php')}:</span>
                    <span className="text-slate-800 dark:text-slate-200">PHP {parseFloat(amount || '0').toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400">{t('platform_fee_label')}:</span>
                    <span className="text-rose-600 dark:text-rose-400 font-extrabold">PHP {transactionFee.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="border-t border-dashed border-slate-200 dark:border-white/5 my-2 pt-2" />
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400">{t('available_recharge_credit')}:</span>
                    <span className="text-slate-800 dark:text-slate-200">PHP {currentCredit.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400">{t('remaining_credit')}:</span>
                    <span className={`font-extrabold ${remainingCredit < 0 ? 'text-rose-600' : 'text-emerald-600 dark:text-emerald-400'}`}>
                      PHP {remainingCredit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                {isCreditInsufficient ? (
                  <div className="space-y-4">
                    <p className="text-xs text-rose-500 bg-rose-500/5 p-4 rounded-2xl border border-rose-500/10 leading-relaxed font-bold text-center">
                      {t('credit_deduction_insufficient')}
                    </p>
                    <div className="flex gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsCreditDeductOpen(false)}
                        className="flex-1 h-12 rounded-xl border-slate-200 dark:border-white/10 text-xs active:scale-95 transition-transform"
                      >
                        {t('close')}
                      </Button>
                      <Button
                        type="button"
                        onClick={() => {
                          setIsCreditDeductOpen(false);
                          router.push('/deposit');
                        }}
                        className="flex-1 h-12 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-black text-xs shadow-md shadow-rose-500/25 active:scale-95 transition-all text-center flex items-center justify-center"
                      >
                        {t('recharge_credit_btn')}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="text-xs text-slate-500 dark:text-slate-400 bg-blue-500/5 p-4 rounded-2xl border border-blue-500/10 leading-relaxed font-bold text-center">
                      {t('credit_deduction_confirm')}
                    </p>
                    <div className="flex gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsCreditDeductOpen(false)}
                        disabled={isSubmitting}
                        className="flex-1 h-12 rounded-xl border-slate-200 dark:border-white/10 text-xs active:scale-95 transition-transform"
                      >
                        {t('cancel')}
                      </Button>
                      <Button
                        type="button"
                        onClick={() => {
                          setIsCreditDeductOpen(false);
                          handleCreateTransaction();
                        }}
                        disabled={isSubmitting}
                        className="flex-1 h-12 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-xs shadow-md shadow-blue-500/25 active:scale-95 transition-all flex items-center justify-center"
                      >
                        {t('credit_deduction_btn')}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Create Matching Request Modal */}
      <Dialog open={isPostModalOpen} onOpenChange={setIsPostModalOpen}>
        <DialogContent className="max-w-md w-[95%] h-[85vh] md:h-[75vh] rounded-[32px] dark:bg-slate-950 dark:border-white/5 px-6 pt-8 flex flex-col outline-none overflow-hidden">
          <DialogHeader className="pb-4 shrink-0">
            <DialogTitle className="text-2xl font-black dark:text-white text-center">
              {matchingType === 'borrower' ? t('borrow_post_title') : t('lend_post_title')}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto py-6 space-y-6 scrollbar-hide">
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="space-y-3">
                <Label className="font-black text-[10px] uppercase tracking-[0.2em] text-slate-400 px-1">{t('post_category')}</Label>
                <div className="flex bg-slate-100 dark:bg-white/5 p-1 rounded-2xl">
                  <button 
                    type="button"
                    onClick={() => setMatchingType('borrower')}
                    className={`flex-1 py-3 rounded-xl text-xs font-black transition-all duration-300 ${matchingType === 'borrower' ? 'bg-white dark:bg-blue-600 shadow-md text-blue-600 dark:text-white' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    {t('borrow_request_tab')}
                  </button>
                  <button 
                    type="button"
                    onClick={() => setMatchingType('lender')}
                    className={`flex-1 py-3 rounded-xl text-xs font-black transition-all duration-300 ${matchingType === 'lender' ? 'bg-white dark:bg-blue-600 shadow-md text-blue-600 dark:text-white' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    {t('lend_offer_tab')}
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <Label className="font-black text-[10px] uppercase tracking-[0.2em] text-slate-400 px-1">{t('amount_php')}</Label>
                <Input 
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="h-16 rounded-2xl text-2xl font-black bg-slate-50 dark:bg-white/5 border-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div className="space-y-3">
                <Label className="font-black text-[10px] uppercase tracking-[0.2em] text-slate-400 px-1">{t('interest_rate_percent')}</Label>
                <Input 
                  type="number"
                  value={interestRate}
                  max={6}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (val > 6) {
                      setInterestRate('6');
                      toast.warning(t('interest_rate_warning'));
                    } else {
                      setInterestRate(e.target.value);
                    }
                  }}
                  onFocus={(e) => { if (interestRate === '0') setInterestRate(''); }}
                  onBlur={(e) => { if (e.target.value === '') setInterestRate('0'); }}
                  placeholder="0"
                  className="h-16 rounded-2xl text-xl font-black bg-slate-50 dark:bg-white/5 border-none focus:ring-2 focus:ring-blue-500"
                />
                <div className="p-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/30 rounded-xl text-blue-600 dark:text-blue-400 flex items-start gap-2 animate-in fade-in duration-300">
                  <ShieldCheck className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span className="text-[10px] font-bold leading-normal">
                    {t('interest_rate_warning')}
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                <Label className="font-black text-[10px] uppercase tracking-[0.2em] text-slate-400 px-1">{t('repayment_amount_due')}</Label>
                <div className="h-20 flex flex-col justify-center px-5 rounded-2xl bg-blue-500/10 dark:bg-blue-600/20 border border-blue-500/25">
                  <span className="text-[10px] font-black uppercase tracking-[0.1em] text-blue-600 dark:text-blue-400 mb-0.5">{t('total_repay_amount_desc')}</span>
                  <span className="text-2xl font-black text-blue-700 dark:text-blue-300">
                    {(Number(amount || 0) * (1 + Number(interestRate || 0) / 100)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                <Label className="font-black text-[10px] uppercase tracking-[0.2em] text-slate-400 px-1">{t('overdue_policy_label')}</Label>
                <Select value={policyType} onValueChange={(value) => {
                  setPolicyType(value);
                  if (value !== 'custom') {
                    setOverduePolicy(value);
                  } else {
                    setOverduePolicy(customPolicy || 'custom');
                  }
                }}>
                  <SelectTrigger className="h-16 rounded-2xl bg-slate-50 dark:bg-white/5 border-none font-bold focus:ring-2 focus:ring-blue-500">
                    <SelectValue placeholder={t('overdue_policy_placeholder')} />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl dark:bg-slate-900 border-none shadow-xl">
                    <SelectItem value="overdue_policy_3" className="font-bold">{t('overdue_policy_3')}</SelectItem>
                    <SelectItem value="overdue_policy_5" className="font-bold">{t('overdue_policy_5')}</SelectItem>
                    <SelectItem value="overdue_policy_6" className="font-bold">{t('overdue_policy_6')}</SelectItem>
                    <SelectItem value="custom" className="font-bold">{t('custom') || 'custom'}</SelectItem>
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
                      placeholder={t('custom_policy_placeholder')}
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
                        }
                      }
                      
                      if (isViolated) {
                        return (
                          <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900/30 rounded-xl text-red-600 dark:text-red-400 flex items-start gap-2 animate-in slide-in-from-top-1 duration-200">
                            <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5" />
                            <span className="text-[10px] font-bold leading-normal">
                              {t('overdue_policy_error')}
                            </span>
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>
                )}
                <div className="p-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/30 rounded-xl text-blue-600 dark:text-blue-400 flex items-start gap-2 animate-in fade-in duration-300">
                  <ShieldCheck className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span className="text-[10px] font-bold leading-normal">
                    {t('overdue_legal_warning')}
                  </span>
                </div>
              </div>

              {/* 만기 기일 설정 방식 */}
              <div className="space-y-3">
                <Label className="font-black text-[10px] uppercase tracking-[0.2em] text-slate-400 px-1">{t('due_date_adjustable_title')}</Label>
                <div className="flex bg-slate-100 dark:bg-white/5 p-1 rounded-2xl">
                  <button 
                    type="button"
                    onClick={() => setDueDateType('period')}
                    className={`flex-1 py-3 rounded-xl text-xs font-black transition-all duration-300 ${dueDateType === 'period' ? 'bg-white dark:bg-blue-600 shadow-md text-blue-600 dark:text-white' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    {t('due_date_adjustable_period')}
                  </button>
                  <button 
                    type="button"
                    onClick={() => setDueDateType('fixed')}
                    className={`flex-1 py-3 rounded-xl text-xs font-black transition-all duration-300 ${dueDateType === 'fixed' ? 'bg-white dark:bg-blue-600 shadow-md text-blue-600 dark:text-white' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    {t('due_date_adjustable_fixed')}
                  </button>
                </div>
              </div>

              {dueDateType === 'period' ? (
                <div className="space-y-4 animate-in fade-in duration-300">
                  <div className="space-y-3">
                    <Label className="font-black text-[10px] uppercase tracking-[0.2em] text-slate-400 px-1">{t('due_date_period_select') || t('due_date_adjustable_placeholder')}</Label>
                    <Select value={periodValue} onValueChange={setPeriodValue}>
                      <SelectTrigger className="h-16 rounded-2xl bg-slate-50 dark:bg-white/5 border-none font-bold focus:ring-2 focus:ring-blue-500">
                        <SelectValue placeholder={t('due_date_adjustable_placeholder')} />
                      </SelectTrigger>
                      <SelectContent className="rounded-2xl dark:bg-slate-900 border-none shadow-xl">
                        <SelectGroup>
                          <SelectLabel className="text-xs text-slate-400">{t('select_days_label')}</SelectLabel>
                          {Array.from({ length: 31 }, (_, i) => (
                            <SelectItem key={i + 1} value={(i + 1).toString()} className="font-bold">
                              {i + 1}{t('days')}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                        <SelectSeparator />
                        <SelectGroup>
                          <SelectLabel className="text-xs text-slate-400">{t('select_months_label')}</SelectLabel>
                          <SelectItem value="30" className="font-bold">1{t('month')} (30{t('days')})</SelectItem>
                          <SelectItem value="60" className="font-bold">2{t('months')} (60{t('days')})</SelectItem>
                          <SelectItem value="90" className="font-bold">3{t('months')} (90{t('days')})</SelectItem>
                        </SelectGroup>
                        <SelectSeparator />
                        <SelectGroup>
                          <SelectItem value="custom" className="font-bold text-blue-500">{t('custom_period_label')}</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    
                    {periodValue === 'custom' && (
                      <Input 
                        type="number"
                        value={customPeriodDays}
                        onChange={(e) => setCustomPeriodDays(e.target.value)}
                        placeholder={t('due_date_adjustable_custom_placeholder')}
                        className="h-14 mt-2 rounded-2xl bg-slate-50 dark:bg-white/5 border-none font-bold focus:ring-2 focus:ring-blue-500 animate-in fade-in duration-300"
                      />
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-3 animate-in fade-in duration-300">
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
                  {t('due_date_adjustable_checkbox')}
                </label>
              </div>

              <div className="space-y-3">
                <Label className="font-black text-[10px] uppercase tracking-[0.2em] text-slate-400 px-1">{t('description')}</Label>
                <Input 
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t('post_description_placeholder')}
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
              {t('cancel')}
            </Button>
            <Button 
              onClick={handleCreatePost}
              disabled={!amount || isSubmitting}
              className="flex-1 h-16 bg-blue-600 hover:bg-blue-700 text-white rounded-[24px] font-black text-xl shadow-2xl shadow-blue-500/40 active:scale-95 transition-all"
            >
              {isSubmitting ? t('post_publishing') : t('post_publish')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* GCash & Coin Payment Dialog */}
      <Dialog open={isPaymentOpen} onOpenChange={(open) => {
        if (!isUploadingProof) {
          setIsPaymentOpen(open);
          if (!open) { resetGCashPaymentForm(); }
        }
      }}>
        <DialogContent className="max-w-md w-[95%] rounded-[32px] dark:bg-slate-950 dark:border-white/5 px-5 pt-7 pb-7 outline-none flex flex-col max-h-[85vh] overflow-y-auto">
          <DialogHeader className="shrink-0">
            <DialogTitle className="text-xl font-black dark:text-white text-center">
              {t('repayment_evidence_submit_title')}
            </DialogTitle>
          </DialogHeader>

          {/* Payment Method Tabs */}
          <div className="flex border border-slate-200 dark:border-white/10 rounded-xl p-1 bg-slate-50 dark:bg-white/5 w-full shrink-0 my-2">
            <button
              type="button"
              onClick={() => setPaymentMethod('gcash')}
              className={`flex-1 py-2 text-xs font-black rounded-lg transition-all ${paymentMethod === 'gcash' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
            >
              {t('gcash_repay')}
            </button>
            <button
              type="button"
              onClick={() => setPaymentMethod('coin')}
              className={`flex-1 py-2 text-xs font-black rounded-lg transition-all ${paymentMethod === 'coin' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
            >
              {t('coin_repay')}
            </button>
          </div>

          <div className="space-y-5 py-3 flex-1">
            {paymentMethod === 'gcash' ? (
              <>
                {/* GCash Lender Account Details */}
                <div className="p-4 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-white/5 space-y-2.5 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-slate-400">{t('lender_name')}:</span>
                    <span className="font-extrabold text-slate-800 dark:text-slate-100">{payingLoan?.lender?.full_name || '-'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-slate-400">{t('gcash_transfer_number')}:</span>
                    <div className="flex items-center gap-2">
                      <span className="font-black text-blue-600 dark:text-blue-400">
                        {payingLoan?.lender?.gcash_number || payingLoan?.lender?.phone || t('no_number_registered')}
                      </span>
                      {(payingLoan?.lender?.gcash_number || payingLoan?.lender?.phone) && (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          type="button"
                          className="h-7 px-2 text-[10px] font-black rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 active:scale-95 transition-all text-slate-500"
                          onClick={() => {
                            const num = payingLoan.lender.gcash_number || payingLoan.lender.phone;
                            navigator.clipboard.writeText(num);
                            toast.success(t('phone_copied_toast'));
                          }}
                        >
                          {t('copy')}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Lender GCash QR Code */}
                {payingLoan?.lender?.gcash_qr_url ? (
                  <div className="flex flex-col items-center justify-center p-4 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-white/5 space-y-2">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">{t('lender_gcash_qr')}</span>
                    <div className="relative w-36 h-36 bg-white rounded-2xl overflow-hidden border border-slate-200 dark:border-white/10 p-1.5 shadow-sm">
                      <img 
                        src={payingLoan.lender.gcash_qr_url} 
                        alt="Lender GCash QR" 
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <span className="text-[9px] text-slate-400 font-bold">{t('save_image_hint')}</span>
                  </div>
                ) : (
                  <div className="p-4 bg-amber-500/5 border border-amber-500/10 rounded-2xl text-amber-600 dark:text-amber-400 flex items-start gap-2 text-xs font-bold leading-relaxed">
                    <Info className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                      {t('lender_no_qr_hint')}
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
                      toast.success(t('launching_gcash_toast'));
                    }}
                    className="flex-1 h-12 rounded-xl border-blue-200 dark:border-blue-900/50 hover:bg-blue-50 dark:hover:bg-blue-950/20 text-blue-600 font-extrabold text-xs flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all"
                  >
                    <Wallet className="w-3.5 h-3.5" />
                    {t('launch_gcash_app_btn')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      window.open('https://www.gcash.com', '_blank');
                      toast.success(t('go_to_gcash_web_toast'));
                    }}
                    className="flex-1 h-12 rounded-xl border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/5 text-slate-700 dark:text-slate-300 font-extrabold text-xs flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    {t('go_to_gcash_app')}
                  </Button>
                </div>
              </>
            ) : (
              <>
                {/* Coin Selection (USDT vs USDC) */}
                <div className="space-y-2">
                  <Label className="font-black text-[10px] uppercase tracking-wider text-slate-400 px-1">{t('select_coin_type')}</Label>
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
                    <span className="font-bold text-slate-400">{t('lender_name')}:</span>
                    <span className="font-extrabold text-slate-800 dark:text-slate-100">{payingLoan?.lender?.full_name || '-'}</span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className="font-bold text-slate-400">{t('lender_wallet_address')}:</span>
                    <div className="flex items-center justify-between gap-2 p-2 bg-slate-100 dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/5">
                      <span className="font-mono text-[10px] break-all select-all text-slate-700 dark:text-slate-300 w-[80%] leading-relaxed">
                        {payingLoan?.lender?.solana_wallet || t('wallet_not_registered')}
                      </span>
                      {payingLoan?.lender?.solana_wallet && (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          type="button"
                          className="h-7 px-2 text-[10px] font-black rounded-lg hover:bg-slate-200 dark:hover:bg-white/10 active:scale-95 transition-all text-slate-500 shrink-0"
                          onClick={() => {
                            navigator.clipboard.writeText(payingLoan.lender.solana_wallet);
                            toast.success(t('wallet_copied_toast'));
                          }}
                        >
                          {t('copy')}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Sender Wallet Address Input */}
                <div className="space-y-2">
                  <Label className="font-black text-[10px] uppercase tracking-wider text-slate-400 px-1">
                    {t('my_solana_wallet_label')}
                  </Label>
                  <Input 
                    type="text"
                    value={walletAddress}
                    onChange={(e) => setWalletAddress(e.target.value)}
                    placeholder={t('my_solana_wallet_placeholder')}
                    className="h-12 rounded-xl bg-slate-50 dark:bg-white/5 border-none font-bold text-xs focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </>
            )}

            <div className="border-t border-dashed border-slate-200 dark:border-white/5 my-4 pt-4 space-y-4">
              {/* Screenshot Upload Box */}
              <div className="space-y-2">
                <Label className="font-black text-[10px] uppercase tracking-wider text-slate-400 px-1">{t('attach_receipt')}</Label>
                <div className="aspect-[16/10] w-full bg-slate-50 dark:bg-white/5 rounded-2xl border-2 border-dashed border-slate-200 dark:border-white/10 flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-slate-100 dark:hover:bg-white/10 transition-all relative overflow-hidden group">
                  {proofPreview ? (
                    <>
                      <img src={proofPreview} alt="Screenshot Preview" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-black transition-opacity">
                        {t('select_image_btn')}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="w-10 h-10 rounded-full bg-white dark:bg-slate-800 shadow-sm flex items-center justify-center group-hover:scale-105 transition-transform border border-slate-100 dark:border-white/5">
                        <Camera className="w-5 h-5 text-blue-600" />
                      </div>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-wide">{t('upload_proof_btn')}</span>
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
                  <Label className="font-black text-[10px] uppercase tracking-wider text-slate-400 px-1">{t('gcash_ref')} (Reference ID)</Label>
                  <Input 
                    type="text"
                    value={gcashReference}
                    onChange={(e) => setGcashReference(e.target.value)}
                    placeholder={t('gcash_ref')}
                    className="h-12 rounded-xl bg-slate-50 dark:bg-white/5 border-none font-bold text-xs focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}

              {/* Amount input */}
              <div className="space-y-2">
                <Label className="font-black text-[10px] uppercase tracking-wider text-slate-400 px-1">{t('actual_amount')} (PHP)</Label>
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
                <Label className="font-black text-[10px] uppercase tracking-wider text-slate-400 px-1">{t('actual_time')}</Label>
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
              {t('close')}
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
                  {t('submitting')}
                </>
              ) : (
                <>
                  <Upload className="w-3.5 h-3.5" />
                  {t('submit_repayment_receipt')}
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <DialogContent className="max-w-md w-[90%] mx-auto bg-slate-900/95 dark:bg-slate-950/95 text-slate-100 border border-slate-800 dark:border-white/10 rounded-2xl p-6 backdrop-blur-xl animate-in fade-in duration-300">
          <DialogHeader className="space-y-3">
            <div className="mx-auto w-12 h-12 rounded-full bg-rose-500/10 flex items-center justify-center border border-rose-500/20">
              <AlertTriangle className="w-6 h-6 text-rose-500" />
            </div>
            <DialogTitle className="text-center text-base font-black tracking-tight text-white leading-tight">
              {t('delete_post_confirm')}
            </DialogTitle>
          </DialogHeader>
          <div className="py-2.5">
            <p className="text-center text-xs font-bold text-slate-400 leading-relaxed px-1">
              {t('delete_post_warn_msg')}
            </p>
          </div>
          <div className="flex gap-3 pt-3 border-t border-slate-800/80">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsDeleteConfirmOpen(false)}
              className="flex-1 h-11 rounded-xl border-slate-800 bg-transparent text-slate-400 hover:text-white hover:bg-slate-800/50 font-bold text-xs active:scale-95 transition-transform"
            >
              {t('cancel')}
            </Button>
            <Button
              type="button"
              onClick={handleConfirmDeletePost}
              className="flex-1 h-11 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-black text-xs shadow-lg shadow-rose-600/20 active:scale-95 transition-all flex items-center justify-center"
            >
              {t('delete')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Partner Signature Modal */}
      <Dialog open={isPartnerSignOpen} onOpenChange={setIsPartnerSignOpen}>
        <DialogContent 
          style={isCameraOpen ? { display: 'none' } : undefined}
          className="max-w-md w-[95%] h-[85vh] md:h-[75vh] rounded-[32px] dark:bg-slate-950 dark:border-white/5 px-6 pt-8 flex flex-col outline-none overflow-hidden"
        >
          <DialogHeader className="pb-4 shrink-0">
            <div className="flex justify-center mb-4">
              <div className="flex gap-1.5">
                {[1, 2].map(s => (
                  <div key={s} className={`h-1.5 rounded-full transition-all duration-500 ${partnerStep >= s ? 'w-8 bg-blue-600' : 'w-4 bg-slate-200 dark:bg-white/10'}`} />
                ))}
              </div>
            </div>
            <DialogTitle className="text-2xl font-black dark:text-white text-center">
              {partnerStep === 1 ? t('identity_verification') : t('agreement_record')}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto py-6 space-y-8 scrollbar-hide">
            {partnerStep === 1 && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { id: 'front1', label: t('id_front_1') },
                    { id: 'back1', label: t('id_back_1') },
                    { id: 'front2', label: t('id_front_2') },
                    { id: 'back2', label: t('id_back_2') }
                  ].map((p) => (
                    <div key={p.id} className="space-y-2 text-center">
                      <div 
                        onClick={() => {
                          setActivePhotoId(p.id);
                          setCameraMode('id');
                          setIsPartnerSignOpen(false);
                          setIsCameraOpen(true);
                        }}
                        className="aspect-[4/3] bg-slate-50 dark:bg-white/5 rounded-[32px] border-2 border-dashed border-slate-200 dark:border-white/10 flex flex-col items-center justify-center gap-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-white/10 transition-all relative overflow-hidden group"
                      >
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
                      </div>
                    </div>
                  ))}
                </div>

                <div className="space-y-2 text-center">
                  <div 
                    onClick={() => {
                      setActivePhotoId('selfie');
                      setCameraMode('selfie');
                      setIsPartnerSignOpen(false);
                      setIsCameraOpen(true);
                    }}
                    className="w-full h-28 bg-slate-50 dark:bg-white/5 rounded-[32px] border-2 border-dashed border-slate-200 dark:border-white/10 flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-slate-100 dark:hover:bg-white/10 transition-all relative overflow-hidden group"
                  >
                    {idPhotos.selfie?.preview ? (
                      <div className="flex items-center gap-4 w-full h-full px-6">
                        <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-blue-500">
                          <img src={idPhotos.selfie.preview} alt="Selfie" className="w-full h-full object-cover" />
                        </div>
                        <div className="text-left">
                          <p className="text-xs font-black text-blue-600 uppercase tracking-wide">Selfie Captured</p>
                          <p className="text-[10px] text-slate-400 font-bold mt-1">{t('selfie_verified_label')}</p>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="w-10 h-10 rounded-full bg-white dark:bg-slate-800 shadow-sm flex items-center justify-center group-hover:scale-110 transition-transform">
                          <Camera className="w-5 h-5 text-blue-600" />
                        </div>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">{t('selfie_capture_required')}</span>
                      </>
                    )}
                  </div>
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

            {partnerStep === 2 && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                {(() => {
                  let existingSigs: { lender?: string; borrower?: string } = {};
                  try {
                    const raw = partnerSignLoan?.signature_data;
                    existingSigs = typeof raw === 'string' ? JSON.parse(raw || '{}') : (raw || {});
                  } catch {
                    existingSigs = {};
                  }
                  const showLenderSign = isAdmin ? !existingSigs.lender : (partnerSignLoan?.lender_id === user?.id);
                  return showLenderSign ? (
                    <div className="space-y-4">
                      <Label className="font-black text-[10px] uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2 px-1">
                        <Signature className="w-4 h-4 text-blue-500" /> {t('lender_signature')}
                      </Label>
                      <SignaturePad onSave={setLenderSignature} onClear={() => setLenderSignature(null)} />
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <Label className="font-black text-[10px] uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2 px-1">
                        <Signature className="w-4 h-4 text-blue-500" /> {t('borrower_signature')}
                      </Label>
                      <SignaturePad onSave={setBorrowerSignature} onClear={() => setBorrowerSignature(null)} />
                    </div>
                  );
                })()}
                <div className="p-5 bg-slate-50 dark:bg-white/5 rounded-[32px] border border-slate-100 dark:border-white/5">
                  <p className="text-[10px] font-medium text-slate-500 leading-relaxed italic">
                    {t('legal_disclaimer')}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="pt-4 pb-8 flex gap-4 shrink-0">
            {partnerStep > 1 && (
              <Button 
                variant="outline" 
                onClick={() => setPartnerStep(prev => prev - 1)}
                className="h-16 w-16 rounded-[24px] border-slate-200 dark:border-white/10 font-bold p-0 active:scale-95 transition-transform"
              >
                <ChevronLeft className="w-6 h-6" />
              </Button>
            )}
            <Button
              onClick={() => {
                if (partnerStep === 1) {
                  if (!isSelfAdminPartnerTx) {
                    const missingPhotos = Object.entries(idPhotos).filter(([key, photo]) => !photo.preview);
                    if (missingPhotos.length > 0) {
                      toast.error(t('complete_all_fields'));
                      return;
                    }
                  }
                  setPartnerStep(2);
                } else {
                  handleCompletePartnerSign();
                }
              }}
              disabled={isSubmitting}
              className="flex-1 h-16 bg-blue-600 hover:bg-blue-700 text-white rounded-[24px] font-black text-sm shadow-xl shadow-blue-500/25 active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t('submitting')}
                </>
              ) : partnerStep === 1 ? (
                <>
                  <span>{t('next')}</span>
                  <ChevronRight className="w-4 h-4" />
                </>
              ) : (
                <>
                  <span>{t('sign_agreement_btn')}</span>
                  <CheckCircle2 className="w-4 h-4" />
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {isCameraOpen && activePhotoId && (
        <MLIDCamera 
          mode={cameraMode}
          onCapture={(file, preview) => {
            setIsCameraOpen(false);
            if (partnerSignLoan) {
              setIsPartnerSignOpen(true);
            } else {
              setIsTransactionOpen(true);
            }
            processCapturedPhoto(activePhotoId, file, preview);
          }}
          onClose={() => {
            setIsCameraOpen(false);
            if (partnerSignLoan) {
              setIsPartnerSignOpen(true);
            } else {
              setIsTransactionOpen(true);
            }
          }}
          t={t}
        />
      )}

      {/* PDF 미리보기 모달 */}
      <Dialog open={isPdfPreviewOpen} onOpenChange={(open) => {
        setIsPdfPreviewOpen(open);
        if (!open && pdfPreviewUrl) {
          URL.revokeObjectURL(pdfPreviewUrl);
          setPdfPreviewUrl(null);
        }
      }}>
        <DialogContent className="max-w-4xl h-[80vh] flex flex-col p-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <DialogHeader>
            <DialogTitle className="text-sm font-black dark:text-white">
              {t('pdf_preview_title') || '계약서 PDF 미리보기'}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 w-full bg-slate-100 dark:bg-slate-800 rounded-2xl overflow-hidden mt-2 relative">
            {pdfPreviewUrl ? (
              <iframe
                src={pdfPreviewUrl}
                className="w-full h-full border-none rounded-2xl"
                title="PDF Preview"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 mt-4 shrink-0">
            <Button
              variant="outline"
              onClick={() => setIsPdfPreviewOpen(false)}
              className="rounded-xl font-bold h-11 text-xs border-slate-200 dark:border-white/10"
            >
              {t('close') || '닫기'}
            </Button>
            {pdfPreviewUrl && (
              <Button
                onClick={() => {
                  const a = document.createElement('a');
                  a.href = pdfPreviewUrl;
                  a.download = `Agreement_Preview.pdf`;
                  a.click();
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black h-11 text-xs"
              >
                {t('download') || '다운로드'}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
