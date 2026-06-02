"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { TierBadge } from "@/components/ui/tier-badge";
import { toast } from "sonner";
import { 
  Users, 
  Settings, 
  Bell, 
  History, 
  Search, 
  Loader2, 
  TrendingUp, 
  Coins, 
  ShieldCheck, 
  UserCheck, 
  X, 
  FileText, 
  ChevronRight, 
  ArrowLeftRight,
  AlertTriangle,
  Mail,
  Send,
  Check,
  XCircle,
  Clock,
  Sparkles
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";

interface UserProfile {
  id: string;
  full_name: string | null;
  phone: string | null;
  trust_score: number;
  trust_tier: string;
  is_verified: boolean;
  credit: number;
  updated_at: string;
}

interface LoanRecord {
  id: string;
  amount: number;
  repay_amount: number;
  description: string;
  due_date: string | null;
  status: string;
  created_at: string;
  lender: { full_name: string | null } | null;
  borrower: { full_name: string | null } | null;
}

interface PaymentProof {
  id: string;
  loan_id: string;
  screenshot_url: string;
  status: string;
  gcash_reference: string | null;
  created_at: string;
}

interface DepositRequest {
  id: string;
  user_id: string;
  amount: number;
  unique_amount: number;
  method: string;
  from_wallet: string | null;
  status: string;
  reference_no: string | null;
  proof_image_url?: string | null;
  created_at: string;
  profile?: { full_name: string | null; phone: string | null };
}

export default function AdminConsole() {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<"settings" | "users" | "notifications" | "logs">("settings");
  const [loading, setLoading] = useState(true);

  // 1. 수수료 및 정책 상태
  const [feeRate, setFeeRate] = useState("1");
  const [feeDescription, setFeeDescription] = useState("");
  const [isUpdatingSettings, setIsUpdatingSettings] = useState(false);

  // 2. 회원 정보 상태
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [creditAdjustment, setCreditAdjustment] = useState("");
  const [trustScoreAdjustment, setTrustScoreAdjustment] = useState("");
  const [selectedTier, setSelectedTier] = useState("");
  const [isSavingUserChanges, setIsSavingUserChanges] = useState(false);

  // 3. 알림 상태
  const [notificationTitle, setNotificationTitle] = useState("");
  const [notificationMessage, setNotificationMessage] = useState("");
  const [targetUserId, setTargetUserId] = useState("all");
  const [isSendingNotification, setIsSendingNotification] = useState(false);

  // 4. 거래 로그 & 충전 승인 상태
  const [loans, setLoans] = useState<LoanRecord[]>([]);
  const [depositRequests, setDepositRequests] = useState<DepositRequest[]>([]);
  const [selectedDeposit, setSelectedDeposit] = useState<DepositRequest | null>(null);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [isProcessingDeposit, setIsProcessingDeposit] = useState(false);

  // 5. 결제 증빙(거래증) & 이미지 프리뷰 상태
  const [paymentProofs, setPaymentProofs] = useState<PaymentProof[]>([]);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState<string>("");
  const [isImagePreviewOpen, setIsImagePreviewOpen] = useState(false);

  const handleOpenImagePreview = (url: string, title: string) => {
    setPreviewImageUrl(url);
    setPreviewTitle(title);
    setIsImagePreviewOpen(true);
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      // 수수료율 설정 로드
      const { data: settingsData, error: settingsErr } = await supabase
        .from("system_settings")
        .select("*")
        .eq("key", "credit_fee_rate")
        .single();
      
      if (settingsData) {
        setFeeRate((parseFloat(settingsData.value) * 100).toString());
        setFeeDescription(settingsData.description || "");
      }

      // 회원 목록 로드
      const { data: usersData, error: usersErr } = await supabase
        .from("profiles")
        .select("*")
        .order("updated_at", { ascending: false });
      
      if (usersData) setUsers(usersData);

      // 외상거래 로그 로드
      const { data: loansData, error: loansErr } = await supabase
        .from("loans")
        .select(`
          *,
          lender:profiles!loans_lender_id_fkey(full_name),
          borrower:profiles!loans_borrower_id_fkey(full_name)
        `)
        .order("created_at", { ascending: false });
      
      if (loansData) setLoans(loansData as any);

      // 결제 증빙(거래증) 로드
      const { data: proofsData, error: proofsErr } = await supabase
        .from("payment_proofs")
        .select("*")
        .order("created_at", { ascending: false });

      if (proofsData) setPaymentProofs(proofsData);

      // 충전 요청 건 로드
      const { data: depositsData, error: depositsErr } = await supabase
        .from("deposit_requests")
        .select("*")
        .order("created_at", { ascending: false });

      if (depositsData) {
        // 회원 매칭 조인
        const extendedDeposits = await Promise.all(
          depositsData.map(async (dep) => {
            const { data: prof } = await supabase
              .from("profiles")
              .select("full_name, phone")
              .eq("id", dep.user_id)
              .single();
            return {
              ...dep,
              profile: prof ? { full_name: prof.full_name, phone: prof.phone } : { full_name: "미확인 유저", phone: "" }
            };
          })
        );
        setDepositRequests(extendedDeposits as any);
      }

    } catch (e: any) {
      console.error(e);
      toast.error("데이터를 로드하는 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // 1. 수수료 설정 저장
  const handleSaveSettings = async () => {
    setIsUpdatingSettings(true);
    try {
      const parsedRate = parseFloat(feeRate) / 100;
      if (isNaN(parsedRate) || parsedRate < 0 || parsedRate > 0.5) {
        toast.error("올바른 수수료 비율을 입력해 주세요 (0% ~ 50%).");
        setIsUpdatingSettings(false);
        return;
      }

      const { error } = await supabase
        .from("system_settings")
        .update({ 
          value: parsedRate.toString(),
          description: `외상거래 수수료 비율 (${feeRate}% = ${parsedRate})`
        })
        .eq("key", "credit_fee_rate");

      if (error) throw error;
      toast.success(`외상거래 수수료율이 ${feeRate}%로 업데이트되었습니다.`);
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "설정 저장에 실패했습니다.");
    } finally {
      setIsUpdatingSettings(false);
    }
  };

  // 2. 회원 상태 수동 변경 액션
  const handleOpenUserModal = (user: UserProfile) => {
    setSelectedUser(user);
    setCreditAdjustment("");
    setTrustScoreAdjustment("");
    setSelectedTier(user.trust_tier);
    setIsUserModalOpen(true);
  };

  const handleSaveUserChanges = async () => {
    if (!selectedUser) return;
    setIsSavingUserChanges(true);

    try {
      let updatedCredit = selectedUser.credit;
      if (creditAdjustment.trim()) {
        const adjustment = parseFloat(creditAdjustment);
        if (!isNaN(adjustment)) {
          updatedCredit = parseFloat((selectedUser.credit + adjustment).toFixed(2));
        }
      }

      let updatedTrustScore = selectedUser.trust_score;
      if (trustScoreAdjustment.trim()) {
        const adjustment = parseInt(trustScoreAdjustment, 10);
        if (!isNaN(adjustment)) {
          updatedTrustScore = selectedUser.trust_score + adjustment;
        }
      }

      const { error } = await supabase
        .from("profiles")
        .update({
          credit: updatedCredit,
          trust_score: updatedTrustScore,
          trust_tier: selectedTier
        })
        .eq("id", selectedUser.id);

      if (error) throw error;

      // 크레딧 변동 알림 발송
      if (creditAdjustment.trim()) {
        const adjustment = parseFloat(creditAdjustment);
        if (!isNaN(adjustment)) {
          const actionText = adjustment >= 0 ? `₱${adjustment} 가산 충전` : `₱${Math.abs(adjustment)} 차감 조정`;
          await supabase
            .from("notifications")
            .insert({
              user_id: selectedUser.id,
              title: "관리자 크레딧 변동 알림",
              message: `관리자 계정에 의해 사용 크레딧이 ${actionText} 되었습니다. 현재 잔액: ₱${updatedCredit}`,
              type: "deposit"
            });
        }
      }

      toast.success(`${selectedUser.full_name || "회원"}님의 정보가 성공적으로 수정되었습니다.`);
      setIsUserModalOpen(false);
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "회원 정보 수정 중 오류가 발생했습니다.");
    } finally {
      setIsSavingUserChanges(false);
    }
  };

  const handleToggleVerification = async (user: UserProfile) => {
    try {
      const nextStatus = !user.is_verified;
      const { error } = await supabase
        .from("profiles")
        .update({ is_verified: nextStatus })
        .eq("id", user.id);

      if (error) throw error;

      await supabase
        .from("notifications")
        .insert({
          user_id: user.id,
          title: nextStatus ? "ID 본인인증 승인" : "ID 본인인증 보류",
          message: nextStatus 
            ? "축하합니다! 신분증 검증이 완료되어 정식 ID 본인인증 회원으로 전환되었습니다." 
            : "보안 검토 정책에 따라 회원님의 신분증 검증 상태가 보류/반려 처리되었습니다.",
          type: "system"
        });

      toast.success(`${user.full_name || "회원"}님의 본인인증 상태를 변경했습니다.`);
      
      // 모달 내부 상태 동기화
      if (selectedUser && selectedUser.id === user.id) {
        setSelectedUser({ ...selectedUser, is_verified: nextStatus });
      }
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "인증 처리 실패");
    }
  };

  // 3. 알림 일괄/개별 전송
  const handleSendNotification = async () => {
    if (!notificationTitle.trim() || !notificationMessage.trim()) {
      toast.error("알림 제목과 메시지를 입력해 주세요.");
      return;
    }

    setIsSendingNotification(true);
    try {
      if (targetUserId === "all") {
        // 전체 회원 발송
        const notificationPromises = users.map(u => 
          supabase
            .from("notifications")
            .insert({
              user_id: u.id,
              title: notificationTitle.trim(),
              message: notificationMessage.trim(),
              type: "system"
            })
        );
        await Promise.all(notificationPromises);
        toast.success(`가입된 회원 ${users.length}명 전체에게 알림을 성공적으로 발송했습니다.`);
      } else {
        // 개별 회원 발송
        const { error } = await supabase
          .from("notifications")
          .insert({
            user_id: targetUserId,
            title: notificationTitle.trim(),
            message: notificationMessage.trim(),
            type: "system"
          });
        
        if (error) throw error;
        const targetUser = users.find(u => u.id === targetUserId);
        toast.success(`${targetUser?.full_name || "지정 회원"}님에게 알림이 발송되었습니다.`);
      }

      setNotificationTitle("");
      setNotificationMessage("");
      setTargetUserId("all");
    } catch (err: any) {
      toast.error(err.message || "알림 발송에 실패했습니다.");
    } finally {
      setIsSendingNotification(false);
    }
  };

  // 4. 충전 승인/반려
  const handleApproveDeposit = async (req: DepositRequest) => {
    setIsProcessingDeposit(true);
    try {
      // 1. 사용자 기존 크레딧 조회
      const { data: userProfile, error: profileErr } = await supabase
        .from("profiles")
        .select("credit")
        .eq("id", req.user_id)
        .single();
      
      if (profileErr) throw profileErr;

      const currentCredit = parseFloat(userProfile.credit?.toString() || "0");
      const newCredit = currentCredit + parseFloat(req.amount.toString());

      // 2. 크레딧 업데이트
      const { error: updateProfileErr } = await supabase
        .from("profiles")
        .update({ credit: newCredit })
        .eq("id", req.user_id);
      
      if (updateProfileErr) throw updateProfileErr;

      // 3. 충전 요청 완료
      const { error: updateReqErr } = await supabase
        .from("deposit_requests")
        .update({ status: "completed" })
        .eq("id", req.id);
      
      if (updateReqErr) throw updateReqErr;

      // 4. 알림 발송
      await supabase
        .from("notifications")
        .insert({
          user_id: req.user_id,
          title: "크레딧 충전 완료",
          message: `요청하신 ₱${Number(req.amount).toLocaleString()} 크레딧이 정상 충전 완료되었습니다.`,
          type: "deposit"
        });

      toast.success("입금 충전 승인이 정상 완료되었습니다.");
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "승인 처리 중 오류 발생");
    } finally {
      setIsProcessingDeposit(false);
    }
  };

  const handleRejectDeposit = async () => {
    if (!selectedDeposit) return;
    if (!rejectReason.trim()) {
      toast.error("반려 사유를 필히 기재해 주세요.");
      return;
    }
    
    setIsProcessingDeposit(true);
    try {
      const { error: updateReqErr } = await supabase
        .from("deposit_requests")
        .update({ status: "rejected" })
        .eq("id", selectedDeposit.id);

      if (updateReqErr) throw updateReqErr;

      await supabase
        .from("notifications")
        .insert({
          user_id: selectedDeposit.user_id,
          title: "크레딧 충전 반려",
          message: `충전 요청이 반려되었습니다. 반려 사유: ${rejectReason.trim()}`,
          type: "deposit"
        });

      toast.success("충전 요청이 정상적으로 반려 및 취소되었습니다.");
      setIsRejectModalOpen(false);
      setRejectReason("");
      setSelectedDeposit(null);
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "반려 처리 중 오류 발생");
    } finally {
      setIsProcessingDeposit(false);
    }
  };

  const filteredUsers = users.filter((u) => {
    const q = searchQuery.toLowerCase();
    if (!q) return true;
    return (
      (u.full_name || "").toLowerCase().includes(q) ||
      (u.phone || "").toLowerCase().includes(q) ||
      (u.trust_tier || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="p-4 space-y-6 max-w-lg mx-auto">
      <header className="space-y-4 pt-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="text-3xl font-black dark:text-white leading-none">
              관리자 콘솔
            </h1>
            <p className="text-slate-400 font-bold text-xs">
              MUtang 시스템 실시간 운영 제어
            </p>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-blue-600/10 text-blue-600 flex items-center justify-center shadow-inner">
            <Sparkles className="w-5 h-5 animate-pulse" />
          </div>
        </div>

        {/* 탭 네비게이션 */}
        <div className="grid grid-cols-4 bg-slate-100 dark:bg-white/5 p-1 rounded-[20px] backdrop-blur-sm gap-0.5">
          {[
            { id: "settings", icon: Settings, label: "정책" },
            { id: "users", icon: Users, label: "회원" },
            { id: "notifications", icon: Bell, label: "알림" },
            { id: "logs", icon: History, label: "로그" }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`py-3 rounded-[16px] text-[10px] font-black transition-all duration-300 flex flex-col items-center justify-center gap-1 ${
                activeTab === tab.id
                  ? "bg-white dark:bg-blue-600 shadow-md text-blue-600 dark:text-white scale-[1.03]"
                  : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              }`}
            >
              <tab.icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </header>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 space-y-4">
          <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
          <p className="text-slate-400 font-bold text-sm">데이터를 조회하고 있습니다</p>
        </div>
      ) : (
        <div className="space-y-6">
          
          {/* 탭 1: 수수료 및 정책 관리 */}
          {activeTab === "settings" && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-3 duration-500">
              <Card className="p-6 rounded-[32px] border-slate-100 dark:border-white/5 bg-white dark:bg-slate-900/50 space-y-6 border-b-4 border-b-slate-100 dark:border-b-white/5 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
                    <Coins className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-base dark:text-white">외상거래 수수료 정책</h3>
                    <p className="text-[10px] text-slate-400 font-bold">외상 성사 완료 시 채권자로부터 자동 차감되는 크레딧 비율</p>
                  </div>
                </div>

                <div className="space-y-4 p-5 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-white/5">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs font-black text-slate-500 dark:text-slate-400">
                      <span>설정된 수수료 비율</span>
                      <span className="text-blue-600 dark:text-blue-400 text-lg font-black">{feeRate}%</span>
                    </div>
                    <Input
                      type="number"
                      value={feeRate}
                      onChange={(e) => setFeeRate(e.target.value)}
                      placeholder="수수료율 입력 (예: 1.5)"
                      className="h-14 rounded-xl text-lg font-black bg-white dark:bg-slate-900 border-slate-200 dark:border-white/10"
                    />
                  </div>

                  <div className="text-[10px] font-bold text-slate-400 leading-normal">
                    설명: {feeDescription || "지정되지 않음"}
                  </div>
                </div>

                <Button
                  onClick={handleSaveSettings}
                  disabled={isUpdatingSettings}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-2xl h-14 font-black text-md shadow-xl shadow-blue-500/20 active:scale-95 transition-all"
                >
                  {isUpdatingSettings ? "업데이트 중..." : "수수료 설정 저장하기"}
                </Button>
              </Card>

              <Card className="p-6 rounded-[32px] border-slate-100 dark:border-white/5 bg-white dark:bg-slate-900/50 space-y-4 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-base dark:text-white">보안 및 정책 가이드라인</h3>
                    <p className="text-[10px] text-slate-400 font-bold">플랫폼 무결성을 위한 보안 동작 원칙</p>
                  </div>
                </div>
                <div className="text-xs text-slate-500 leading-relaxed space-y-2">
                  <p>1. 외상 성사 시 profiles 테이블의 credit 컬럼 차감 로직은 Supabase DB 트리거에 의해 백엔드 차원에서 트랜잭션 단위로 안전하게 보장됩니다.</p>
                  <p>2. 관리자가 변경한 수수료율은 데이터베이스 system_settings 테이블을 거쳐 즉각적으로 전 사용자의 외상 계산 및 DB 트리거 계산에 실시간 적용됩니다.</p>
                </div>
              </Card>
            </div>
          )}

          {/* 탭 2: 회원 관리 디렉토리 */}
          {activeTab === "users" && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-3 duration-500">
              <div className="relative group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                <Input
                  placeholder="이름, 번호, 등급 검색..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-11 h-12 rounded-2xl border-slate-200 dark:border-white/5 bg-white dark:bg-white/5 font-bold focus:ring-2 focus:ring-blue-500 shadow-sm"
                />
              </div>

              <div className="space-y-3">
                {filteredUsers.length > 0 ? (
                  <div className="overflow-x-auto rounded-2xl border border-slate-100 dark:border-white/5 bg-white dark:bg-slate-900/50 shadow-sm">
                    <table className="w-full min-w-[550px] text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/5 text-[10px] font-black uppercase tracking-wider text-slate-400 whitespace-nowrap">
                          <th className="py-3 px-4 whitespace-nowrap">회원명</th>
                          <th className="py-3 px-3 whitespace-nowrap">신용등급</th>
                          <th className="py-3 px-3 whitespace-nowrap">연락처</th>
                          <th className="py-3 px-4 text-right whitespace-nowrap">크레딧</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                        {filteredUsers.map((u) => (
                          <tr
                            key={u.id}
                            onClick={() => handleOpenUserModal(u)}
                            className="hover:bg-slate-50 dark:hover:bg-white/5 transition-all cursor-pointer text-xs"
                          >
                            <td className="py-3.5 px-4 font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded bg-slate-100 dark:bg-white/5 flex items-center justify-center font-black text-[9px] text-slate-400 shrink-0">
                                  {u.full_name?.charAt(0) || "U"}
                                </div>
                                <span className="whitespace-nowrap shrink-0">
                                  {u.full_name || "이름 미등록"}
                                </span>
                                {u.is_verified && (
                                  <span className="text-[8px] bg-emerald-500/10 text-emerald-500 border border-emerald-500/10 px-1.5 py-0.5 rounded font-black shrink-0">
                                    인증
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-3.5 px-3 whitespace-nowrap">
                              <TierBadge tier={u.trust_tier || "Bronze"} />
                            </td>
                            <td className="py-3.5 px-3 text-slate-500 font-medium whitespace-nowrap">
                              {u.phone || "미등록"}
                            </td>
                            <td className="py-3.5 px-4 text-right font-black text-blue-600 dark:text-blue-400 whitespace-nowrap">
                              ₱{u.credit ? u.credit.toLocaleString() : 0}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="py-12 text-center text-slate-400 font-bold text-xs">
                    검색 결과와 일치하는 회원이 없습니다.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 탭 3: 알림 및 공지 센터 */}
          {activeTab === "notifications" && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-3 duration-500">
              <Card className="p-6 rounded-[32px] border-slate-100 dark:border-white/5 bg-white dark:bg-slate-900/50 space-y-5 border-b-4 border-b-slate-100 dark:border-b-white/5 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center">
                    <Bell className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-base dark:text-white">실시간 알림 및 시스템 공지 발송</h3>
                    <p className="text-[10px] text-slate-400 font-bold">사용자들에게 모바일 푸시 및 인앱 메시지 전송</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="font-black text-[10px] uppercase tracking-wider text-slate-400">수신 대상 설정</Label>
                    <Select value={targetUserId} onValueChange={setTargetUserId}>
                      <SelectTrigger className="h-12 rounded-xl bg-slate-50 dark:bg-white/5 border-none font-bold">
                        <SelectValue placeholder="수신자 선택" />
                      </SelectTrigger>
                      <SelectContent className="rounded-2xl dark:bg-slate-950 dark:border-white/5">
                        <SelectItem value="all" className="font-bold">전체 가입 회원 일괄 발송 ({users.length}명)</SelectItem>
                        {users.map(u => (
                          <SelectItem key={u.id} value={u.id} className="text-xs">
                            [개별] {u.full_name || "이름없음"} ({u.phone || "번호없음"})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="font-black text-[10px] uppercase tracking-wider text-slate-400">알림 제목</Label>
                    <Input
                      placeholder="알림의 제목을 입력하세요"
                      value={notificationTitle}
                      onChange={(e) => setNotificationTitle(e.target.value)}
                      className="h-12 rounded-xl bg-slate-50 dark:bg-white/5 border-none font-bold focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="font-black text-[10px] uppercase tracking-wider text-slate-400">알림 상세 내용</Label>
                    <Input
                      placeholder="회원들이 수신하게 될 핵심 공지 내용을 적으세요"
                      value={notificationMessage}
                      onChange={(e) => setNotificationMessage(e.target.value)}
                      className="h-14 rounded-xl bg-slate-50 dark:bg-white/5 border-none font-bold focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <Button
                    onClick={handleSendNotification}
                    disabled={isSendingNotification}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-2xl h-14 font-black shadow-xl shadow-blue-500/20 active:scale-95 transition-all flex items-center justify-center gap-2 mt-2"
                  >
                    {isSendingNotification ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        <span>실시간 알림 발송하기</span>
                      </>
                    )}
                  </Button>
                </div>
              </Card>
            </div>
          )}

          {/* 탭 4: 거래 로그 & 충전 승인 */}
          {activeTab === "logs" && (
            <div className="space-y-5 animate-in fade-in slide-in-from-bottom-3 duration-500">
              
              {/* 크레딧 충전 요청 관리 */}
              <div className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <h3 className="font-extrabold text-sm text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    크레딧 입금 충전 대기 건
                  </h3>
                  <span className="text-[10px] bg-blue-500/10 text-blue-600 border border-blue-500/20 px-2 py-0.5 rounded-full font-black">
                    {depositRequests.filter(d => d.status === "pending").length}건 대기
                  </span>
                </div>

                <div className="space-y-3">
                  {depositRequests.filter(d => d.status === "pending").length > 0 ? (
                    depositRequests
                      .filter(d => d.status === "pending")
                      .map((dep) => (
                        <Card
                          key={dep.id}
                          className="p-5 rounded-[24px] border-slate-100 dark:border-white/5 bg-white dark:bg-slate-900/50 space-y-4 border-b-4 border-b-slate-100 dark:border-b-white/5"
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-extrabold text-sm dark:text-white">
                                  {dep.profile?.full_name}
                                </span>
                                <span className="text-[9px] bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded text-slate-500 font-bold">
                                  {dep.method === "gcash" ? "GCash" : "Solana USDT"}
                                </span>
                              </div>
                              <p className="text-[10px] text-slate-400 font-bold mt-1">
                                참조번호: {dep.reference_no || "없음"}
                              </p>
                              {dep.from_wallet && (
                                <p className="text-[9px] text-slate-400 font-medium truncate max-w-[200px]">
                                  보낸주소: {dep.from_wallet}
                                </p>
                              )}
                              {dep.proof_image_url && (
                                <button
                                  onClick={() => handleOpenImagePreview(dep.proof_image_url!, `${dep.profile?.full_name || "유저"}님의 입금증 영수증`)}
                                  className="mt-2 text-[10px] font-extrabold bg-blue-500/10 text-blue-600 dark:text-blue-400 px-3 py-1.5 rounded-lg border border-blue-500/20 active:scale-95 transition-all flex items-center gap-1"
                                >
                                  <FileText className="w-3.5 h-3.5" />
                                  입금증 보기
                                </button>
                              )}
                            </div>
                            <div className="text-right">
                              <span className="text-[10px] text-slate-400 font-bold block">
                                신청금액
                              </span>
                              <span className="font-black text-md text-emerald-600 dark:text-emerald-400">
                                ₱{Number(dep.amount).toLocaleString()}
                              </span>
                            </div>
                          </div>

                          <div className="flex gap-2 pt-2 border-t border-slate-100 dark:border-white/5">
                            <Button
                              onClick={() => {
                                setSelectedDeposit(dep);
                                setIsRejectModalOpen(true);
                              }}
                              variant="outline"
                              disabled={isProcessingDeposit}
                              className="flex-1 h-11 rounded-xl border-rose-200 dark:border-rose-900/30 hover:bg-rose-50 dark:hover:bg-rose-950/20 text-rose-500 font-black text-xs transition-colors"
                            >
                              <XCircle className="w-3.5 h-3.5 mr-1" />
                              반려하기
                            </Button>
                            <Button
                              onClick={() => handleApproveDeposit(dep)}
                              disabled={isProcessingDeposit}
                              className="flex-1 h-11 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs shadow-md shadow-emerald-500/20 transition-all"
                            >
                              <Check className="w-3.5 h-3.5 mr-1" />
                              입금 승인 완료
                            </Button>
                          </div>
                        </Card>
                      ))
                  ) : (
                    <div className="py-6 text-center text-slate-400 border border-dashed border-slate-200 dark:border-white/10 rounded-2xl text-xs font-bold bg-white/20 dark:bg-slate-900/10">
                      현재 대기 중인 크레딧 입금 충전 신청이 없습니다.
                    </div>
                  )}
                </div>
              </div>

              {/* 외상거래 실시간 로그 */}
              <div className="space-y-3">
                <h3 className="font-extrabold text-sm text-slate-500 dark:text-slate-400 uppercase tracking-wider px-1">
                  외상거래 실시간 로그 모니터 (최근 50건)
                </h3>

                <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1 scrollbar-hide">
                  {loans.length > 0 ? (
                    loans.map((loan) => {
                      const loanProof = paymentProofs.find(p => p.loan_id === loan.id);
                      return (
                        <Card
                          key={loan.id}
                          className="p-4 rounded-2xl border-slate-100 dark:border-white/5 bg-white dark:bg-slate-900/50 space-y-2 border-b-2 border-b-slate-100 dark:border-b-white/5 text-xs"
                        >
                          <div className="flex justify-between items-center">
                            <div className="flex items-center gap-1.5 font-extrabold">
                              <span className="text-slate-600 dark:text-slate-300">
                                {loan.lender?.full_name || "채권자"}
                              </span>
                              <ChevronRight className="w-3 h-3 text-slate-400" />
                              <span className="text-slate-600 dark:text-slate-300">
                                {loan.borrower?.full_name || "채무자"}
                              </span>
                            </div>
                            <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                              loan.status === "paid" 
                                ? "bg-emerald-500/10 text-emerald-500"
                                : loan.status === "overdue"
                                ? "bg-rose-500/10 text-rose-500"
                                : "bg-amber-500/10 text-amber-500"
                            }`}>
                              {loan.status === "paid" ? "상환완료" : loan.status === "overdue" ? "연체중" : "진행중"}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-400 font-bold leading-relaxed truncate">
                            내역: {loan.description}
                          </p>
                          <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 pt-1 border-t border-slate-100 dark:border-white/5">
                            <span>
                              거래액: ₱{Number(loan.amount).toLocaleString()}
                            </span>
                            <span>
                              상환일: {loan.due_date ? format(new Date(loan.due_date), "yyyy-MM-dd") : "미지정"}
                            </span>
                          </div>
                          {loanProof?.screenshot_url && (
                            <div className="pt-2 border-t border-slate-100 dark:border-white/5 flex justify-end">
                              <button
                                onClick={() => handleOpenImagePreview(loanProof.screenshot_url, `${loan.borrower?.full_name || "채무자"}님의 상환 거래증`)}
                                className="text-[10px] font-extrabold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-3 py-1.5 rounded-lg border border-emerald-500/20 active:scale-95 transition-all flex items-center gap-1"
                              >
                                <FileText className="w-3.5 h-3.5" />
                                거래증 보기
                              </button>
                            </div>
                          )}
                        </Card>
                      );
                    })
                  ) : (
                    <div className="py-12 text-center text-slate-400 font-bold text-xs">
                      체결된 외상거래 로그 기록이 존재하지 않습니다.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

        </div>
      )}

      {/* 회원 상세 수정 다이얼로그 모달 */}
      <Dialog open={isUserModalOpen} onOpenChange={setIsUserModalOpen}>
        <DialogContent className="max-w-md w-[95%] rounded-[32px] dark:bg-slate-950 dark:border-white/5 px-6 pt-8 pb-6 outline-none flex flex-col overflow-hidden">
          {selectedUser && (
            <>
              <DialogHeader className="pb-3 border-b border-slate-100 dark:border-white/5 flex flex-row justify-between items-center">
                <DialogTitle className="text-xl font-black dark:text-white flex items-center gap-2">
                  <UserCheck className="w-5 h-5 text-blue-600" />
                  <span>회원 세부 조정 권한</span>
                </DialogTitle>
              </DialogHeader>

              <div className="flex-1 overflow-y-auto py-5 space-y-5 scrollbar-hide text-xs">
                
                {/* 현재 프로필 요약 카드 */}
                <div className="p-4 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-white/5 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="font-extrabold text-sm dark:text-white">
                      {selectedUser.full_name}
                    </span>
                    <span className="text-[10px] text-slate-400 font-bold">
                      {selectedUser.phone || "번호없음"}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400/80 font-bold border-t border-slate-100 dark:border-white/5 pt-1.5 break-all">
                    회원 고유 ID (UUID): <code className="bg-slate-200 dark:bg-white/10 px-1 py-0.5 rounded select-all font-mono">{selectedUser.id}</code>
                  </div>
                  <div className="flex justify-between items-center text-[10px] text-slate-500 font-extrabold border-t border-slate-100 dark:border-white/5 pt-1.5">
                    <span>현재 사용 크레딧: ₱{selectedUser.credit ? selectedUser.credit.toLocaleString() : 0}</span>
                    <span>현재 신용 점수: {selectedUser.trust_score}점</span>
                  </div>
                </div>

                {/* 크레딧 가산/차감 */}
                <div className="space-y-2">
                  <Label className="font-black text-[10px] uppercase tracking-wider text-slate-400">사용 크레딧 직접 조정</Label>
                  <Input
                    placeholder="조정할 금액 입력 (예: 500 또는 -200)"
                    value={creditAdjustment}
                    onChange={(e) => setCreditAdjustment(e.target.value)}
                    className="h-12 rounded-xl bg-slate-50 dark:bg-white/5 border-none font-bold"
                  />
                  <span className="text-[9px] text-slate-400 block px-1 leading-normal font-bold">
                    양수를 입력하면 가산 충전되며, 음수를 입력하면 해당 잔액만큼 강제 차감됩니다.
                  </span>
                </div>

                {/* 신용점수 및 등급 조정 */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="font-black text-[10px] uppercase tracking-wider text-slate-400">신용점수 변동</Label>
                    <Input
                      placeholder="예: 5 또는 -3"
                      value={trustScoreAdjustment}
                      onChange={(e) => setTrustScoreAdjustment(e.target.value)}
                      className="h-12 rounded-xl bg-slate-50 dark:bg-white/5 border-none font-bold"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-black text-[10px] uppercase tracking-wider text-slate-400">신용 등급 부여</Label>
                    <Select value={selectedTier} onValueChange={setSelectedTier}>
                      <SelectTrigger className="h-12 rounded-xl bg-slate-50 dark:bg-white/5 border-none font-bold">
                        <SelectValue placeholder="등급" />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl dark:bg-slate-950 dark:border-white/5">
                        {["Iron", "Bronze", "Silver", "Gold", "Platinum", "Diamond"].map((t) => (
                          <SelectItem key={t} value={t} className="font-bold text-xs">
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* ID 본인인증 강제 토글 */}
                <div className="flex justify-between items-center p-4 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-white/5">
                  <div>
                    <p className="font-extrabold text-xs dark:text-white">ID 본인인증 심사</p>
                    <p className="text-[9px] text-slate-400 font-bold mt-0.5">신분증 검증 상태를 수동으로 승인 및 보류합니다.</p>
                  </div>
                  <Button
                    onClick={() => handleToggleVerification(selectedUser)}
                    variant={selectedUser.is_verified ? "destructive" : "default"}
                    className="h-10 px-4 rounded-xl text-xs font-black"
                  >
                    {selectedUser.is_verified ? "인증 취소" : "인증 승인"}
                  </Button>
                </div>

              </div>

              <div className="pt-4 border-t border-slate-100 dark:border-white/5 flex gap-3">
                <Button
                  onClick={() => setIsUserModalOpen(false)}
                  variant="outline"
                  className="flex-1 h-12 rounded-xl font-bold text-xs"
                >
                  닫기
                </Button>
                <Button
                  onClick={handleSaveUserChanges}
                  disabled={isSavingUserChanges}
                  className="flex-1 h-12 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-xs shadow-md shadow-blue-500/20 active:scale-95 transition-all"
                >
                  {isSavingUserChanges ? "수정 중..." : "설정 반영 완료"}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* 충전 반려 사유 입력 모달 */}
      <Dialog open={isRejectModalOpen} onOpenChange={setIsRejectModalOpen}>
        <DialogContent className="max-w-md w-[95%] rounded-[32px] dark:bg-slate-950 dark:border-white/5 px-6 pt-8 pb-6 outline-none flex flex-col overflow-hidden">
          <DialogHeader className="pb-3 border-b border-slate-100 dark:border-white/5 flex flex-row justify-between items-center">
            <DialogTitle className="text-lg font-black dark:text-white flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-rose-500" />
              <span>충전 반려 사유 필히 기재</span>
            </DialogTitle>
            <button onClick={() => setIsRejectModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          </DialogHeader>

          <div className="py-5 space-y-4 text-xs">
            <div className="space-y-2">
              <Label className="font-black text-[10px] uppercase tracking-wider text-slate-400">구체적 반려 사유</Label>
              <Input
                placeholder="예: 송금 참조번호 불일치, 입금액 미확인, 영수증 훼손"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="h-12 rounded-xl bg-slate-50 dark:bg-white/5 border-none font-bold"
              />
              <span className="text-[9px] text-slate-400 block px-1 leading-normal font-bold">
                입력하신 반려 사유가 실시간 PWA 알림을 통해 신청 회원에게 명확히 전달됩니다.
              </span>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 dark:border-white/5 flex gap-3">
            <Button
              onClick={() => {
                setIsRejectModalOpen(false);
                setRejectReason("");
                setSelectedDeposit(null);
              }}
              variant="outline"
              className="flex-1 h-12 rounded-xl font-bold text-xs"
            >
              닫기
            </Button>
            <Button
              onClick={handleRejectDeposit}
              disabled={isProcessingDeposit}
              className="flex-1 h-12 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-black text-xs shadow-md shadow-rose-500/20 active:scale-95 transition-all"
            >
              {isProcessingDeposit ? "반려 처리 중..." : "확인 및 반려 완료"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 이미지 영수증(입금증/거래증) 프리뷰 글래스모피즘 모달 */}
      <Dialog open={isImagePreviewOpen} onOpenChange={setIsImagePreviewOpen}>
        <DialogContent className="max-w-lg w-[95%] rounded-[32px] bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl border border-slate-200/50 dark:border-white/10 px-6 pt-8 pb-6 outline-none flex flex-col overflow-hidden shadow-2xl">
          <DialogHeader className="pb-3 border-b border-slate-100/50 dark:border-white/5 flex flex-row justify-between items-center">
            <DialogTitle className="text-lg font-black dark:text-white flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <span>{previewTitle || "증빙 영수증 확인"}</span>
            </DialogTitle>
            <button onClick={() => setIsImagePreviewOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          </DialogHeader>

          <div className="py-4 flex items-center justify-center bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-100/50 dark:border-white/5 overflow-hidden min-h-[300px] max-h-[450px]">
            {previewImageUrl ? (
              <img
                src={previewImageUrl}
                alt="영수증 증빙"
                className="max-w-full max-h-[400px] object-contain rounded-lg shadow-md hover:scale-[1.02] transition-transform duration-300"
              />
            ) : (
              <div className="text-slate-400 font-bold text-xs">이미지를 불러올 수 없습니다.</div>
            )}
          </div>

          <div className="pt-4 border-t border-slate-100/50 dark:border-white/5">
            <Button
              onClick={() => setIsImagePreviewOpen(false)}
              className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-xs shadow-md shadow-blue-500/20 active:scale-95 transition-all"
            >
              닫기
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
