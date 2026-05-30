"use client";

import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  ShieldCheck, 
  Users, 
  Package, 
  TrendingUp, 
  Clock, 
  ChevronRight,
  HandCoins,
  Bell,
  Coins,
  Plus,
  History,
  X,
  Copy,
  QrCode,
  Wallet,
  ExternalLink,
  Smartphone
} from 'lucide-react';
import Link from 'next/link';
import { TierBadge } from '@/components/ui/tier-badge';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

export default function Dashboard() {
  const { profile, loading: profileLoading, t, refreshProfile } = useAuth();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [isCreditModalOpen, setIsCreditModalOpen] = useState(false);
  const [creditTab, setCreditTab] = useState<'recharge' | 'history'>('recharge');
  
  const [creditHistory, setCreditHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [rechargeAmount, setRechargeAmount] = useState('');
  const [rechargeMethod, setRechargeMethod] = useState<'gcash' | 'solana_usdt'>('gcash');
  const [fromWallet, setFromWallet] = useState('');
  const [activeRequest, setActiveRequest] = useState<any | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [adminProfile, setAdminProfile] = useState<any>(null);

  const fetchAdminProfile = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('gcash_number, gcash_qr_url, solana_wallet')
        .eq('is_admin', true)
        .limit(1);
      
      if (data && data.length > 0) {
        setAdminProfile(data[0]);
      } else {
        setAdminProfile({
          gcash_number: '+639275884114',
          gcash_qr_url: '/gcash-qr.jpg',
          solana_wallet: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchCreditHistory = async () => {
    if (!profile?.id) return;
    setHistoryLoading(true);
    try {
      const { data, error } = await supabase
        .from('deposit_requests')
        .select('*')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false });

      if (data) {
        setCreditHistory(data);
        
        const active = data.find(req => {
          if (req.status !== 'pending') return false;
          const expiresTime = new Date(req.expires_at).getTime();
          return expiresTime > Date.now();
        });
        
        if (active) {
          setActiveRequest(active);
          const diff = Math.max(0, Math.floor((new Date(active.expires_at).getTime() - Date.now()) / 1000));
          setTimeLeft(diff);
        } else {
          setActiveRequest(null);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (timeLeft <= 0) {
      if (activeRequest) {
        setActiveRequest(null);
        fetchCreditHistory();
      }
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft(prev => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, activeRequest]);

  useEffect(() => {
    if (!profile?.id) return;

    const channel = supabase
      .channel(`db_deposit_dashboard_${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'deposit_requests',
          filter: `user_id=eq.${profile.id}`
        },
        (payload: any) => {
          if (payload.new && payload.new.status === 'completed') {
            console.log('[실시간 알림 요원] 입금 승인이 감지되었습니다. 보유 크레딧을 즉시 최신화합니다.');
            refreshProfile();
            toast.success('보유 크레딧이 실시간 입금 처리로 자동 갱신되었습니다!');
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id]);

  const handleRecharge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.id) return;
    
    const amountVal = parseFloat(rechargeAmount);
    if (isNaN(amountVal) || amountVal <= 0) {
      toast.error('올바른 금액을 입력해 주세요.');
      return;
    }

    if (rechargeMethod === 'solana_usdt' && !fromWallet) {
      toast.error('송금할 솔라나 지갑 주소를 입력해 주세요.');
      return;
    }

    setSubmitting(true);
    try {
      const randomCents = Math.floor(Math.random() * 99) + 1;
      const uniqueAmountVal = amountVal + (randomCents / 100);
      
      const now = new Date();
      const expiresAtVal = new Date(now.getTime() + 3 * 60 * 1000).toISOString(); // 3분

      const { data, error } = await supabase
        .from('deposit_requests')
        .insert({
          user_id: profile.id,
          amount: amountVal,
          unique_amount: uniqueAmountVal,
          method: rechargeMethod,
          from_wallet: rechargeMethod === 'solana_usdt' ? fromWallet : null,
          status: 'pending',
          expires_at: expiresAtVal
        })
        .select()
        .single();

      if (error) {
        toast.error(error.message);
      } else {
        setActiveRequest(data);
        setTimeLeft(180);
        setRechargeAmount('');
        setFromWallet('');
        toast.success('충전 요청이 정상 등록되었습니다!');
        fetchCreditHistory();
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('복사되었습니다.');
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const stats = [
    { label: t('active_records'), value: '0', icon: ShieldCheck, color: 'text-blue-500' },
    { label: t('reputation'), value: <TierBadge tier={profile?.trust_tier || 'Bronze'} />, icon: TrendingUp, color: 'text-amber-500' },
    { label: t('customers'), value: '0', icon: Users, color: 'text-emerald-500' },
    { label: t('inventory'), value: '0', icon: Package, color: 'text-indigo-500' },
  ];

  return (
    <div className="space-y-3 pb-4">
      {/* Premium Welcome Section */}
      <section className="relative overflow-hidden bg-[#0A0F1E] rounded-2xl p-4 text-white shadow-xl">
        <div className="absolute top-0 right-0 w-48 h-48 bg-blue-600/20 blur-[80px] rounded-full -mr-16 -mt-16"></div>
        <div className="relative flex flex-col gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-1.5 mb-1">
              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-500 text-[10px] font-bold uppercase tracking-wider">
                <ShieldCheck className="w-2.5 h-2.5" />
                {profile?.trust_tier || 'Bronze'} Tier
              </div>
              {profile?.is_admin && (
                <Link href="/admin">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/20 border border-blue-500/40 text-blue-400 text-[10px] font-bold uppercase tracking-wider hover:bg-blue-500/30 transition-all cursor-pointer">
                    <ShieldCheck className="w-2.5 h-2.5 text-blue-400 animate-pulse" />
                    관리자 콘솔
                  </span>
                </Link>
              )}
            </div>
            <h1 className="text-lg font-black tracking-tight">{t('hello')}, {profile?.full_name || t('lender')}</h1>
            <p className="text-[11px] text-slate-400 font-medium">{t('dashboard_subtitle')}</p>
          </div>
          
          {/* Credit Button and Action Buttons */}
          <div className="flex flex-col gap-2.5 w-full">
            {/* Credit Info (Top) */}
            <div className="w-full flex items-center justify-between bg-white/5 p-2 rounded-xl border border-white/5">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider px-1">{t('credit_balance')}</span>
              <Button 
                onClick={() => {
                  router.push('/deposit');
                }}
                className="bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl px-4 h-9 font-black transition-all shadow-md shadow-amber-500/15 flex items-center justify-center gap-1.5 text-xs"
              >
                <Coins className="w-4 h-4 stroke-[2.5]" />
                <span>{profile?.credit !== undefined && profile?.credit !== null ? Math.floor(Number(profile.credit)).toLocaleString('ko-KR') : '0'}</span>
              </Button>
            </div>
            
            {/* Action Buttons (Bottom) */}
            <div className="flex gap-2 w-full">
              <Link href="/debts" className="flex-1">
                <Button className="w-full bg-white text-slate-950 hover:bg-slate-200 rounded-xl h-10 font-bold text-xs transition-all shadow-md shadow-white/5">
                  {t('new_record')}
                </Button>
              </Link>
              <Button variant="outline" className="border-white/10 bg-white/5 hover:bg-white/10 rounded-xl px-3.5 h-10 shrink-0">
                <Bell className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {stats.map((stat, i) => (
          <Card key={i} className="p-3 bg-white dark:bg-slate-900/50 border-slate-100 dark:border-white/5 rounded-2xl shadow-sm hover:shadow-md transition-all group flex flex-col items-center text-center">
            <div className="space-y-2 flex flex-col items-center">
              <div className={`w-8 h-8 rounded-xl bg-slate-50 dark:bg-white/5 flex items-center justify-center ${stat.color} group-hover:scale-110 transition-transform`}>
                <stat.icon className="w-4 h-4" />
              </div>
              <div className="flex flex-col items-center">
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold">{stat.label}</p>
                <div className="text-base font-black text-slate-900 dark:text-white mt-0.5 flex justify-center">
                  {stat.value}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Quick Actions & Recent Activity */}
      <div className="grid md:grid-cols-2 gap-3">
        {/* Matching Section */}
        <section className="space-y-2">
          <div className="flex items-center justify-between px-2">
            <h2 className="text-xs font-black text-slate-900 dark:text-white">{t('matching_system')}</h2>
            <Link href="/marketplace" className="text-[11px] font-bold text-blue-500 hover:underline">{t('view_all')}</Link>
          </div>
          <Card className="overflow-hidden border-slate-100 dark:border-white/5 rounded-2xl bg-white dark:bg-slate-900/50 shadow-sm">
            <div className="p-3 space-y-2">
              <div className="text-center py-4 text-slate-500 text-xs italic">
                {t('no_requests')}
              </div>
            </div>
            <div className="bg-slate-50 dark:bg-white/5 p-2.5 text-center border-t border-slate-100 dark:border-white/5">
              <p className="text-[10px] font-bold text-slate-500">{t('matching_hint')}</p>
            </div>
          </Card>
        </section>

        {/* Reminders Section */}
        <section className="space-y-2">
          <div className="flex items-center justify-between px-2">
            <h2 className="text-xs font-black text-slate-900 dark:text-white">{t('reminders')}</h2>
            <Link href="/debts" className="text-[11px] font-bold text-blue-500 hover:underline">{t('view_all')}</Link>
          </div>
          <Card className="p-3 border-slate-100 dark:border-white/5 rounded-2xl bg-white dark:bg-slate-900/50 shadow-sm space-y-2">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                <Clock className="w-4 h-4" />
              </div>
              <div className="space-y-0.5">
                <p className="font-bold text-xs text-slate-900 dark:text-white">{t('all_caught_up')}</p>
                <p className="text-[10px] text-slate-500">{t('no_reminders')}</p>
              </div>
            </div>
          </Card>
        </section>
      </div>
    </div>
  );
}
