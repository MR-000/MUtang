"use client";

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { compressImage } from '@/lib/kyc';
import { initPushNotifications, unsubscribePush, getNotificationStatus } from '@/lib/push-notifications';
import { 
  User, 
  Phone, 
  Mail, 
  QrCode, 
  Globe, 
  Moon, 
  Sun,
  LogOut,
  Camera,
  ShieldCheck,
  ChevronRight,
  Bell,
  BellOff,
  Wallet
} from 'lucide-react';
import Link from 'next/link';

export default function SettingsPage() {
  const { user, profile: globalProfile, t, language, setLanguage, theme, setTheme, signOut, refreshProfile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifStatus, setNotifStatus] = useState<'granted' | 'denied' | 'default' | 'unsupported'>('default');
  const [profile, setProfile] = useState({
    full_name: '',
    id_number: '',
    phone: '',
    email: '',
    gcash_qr_url: '',
    gcash_number: '',
    solana_wallet: ''
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setNotifStatus(getNotificationStatus() as any);
    }
  }, []);

  useEffect(() => {
    if (user) {
      fetchProfile();
    }
  }, [user]);

  const fetchProfile = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user?.id)
      .single();

    if (data) {
      setProfile({
        full_name: data.full_name || '',
        id_number: data.id_number || '',
        phone: data.phone || '',
        email: data.email || '',
        gcash_qr_url: data.gcash_qr_url || '',
        gcash_number: data.gcash_number || '',
        solana_wallet: data.solana_wallet || ''
      });
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase
      .from('profiles')
      .update(profile)
      .eq('id', user?.id);

    if (error) {
      toast.error(error.message);
    } else {
      await refreshProfile(); // Sync global state
      toast.success(t('profile_updated'));
    }
    setLoading(false);
  };

  const handleQRUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      // 이미지 사전 압축 (QR 판독용으로 800px 너비와 0.7 퀄리티가 성능과 분석에 가장 조화로움)
      const compressedBlob = await compressImage(file, 800, 0.7);
      const filePath = `${user?.id}/gcash_qr.jpg`; // JPEG으로 압축되므로 확장자는 jpg 고정

      const { error: uploadError } = await supabase.storage
        .from('profile-assets')
        .upload(filePath, compressedBlob, { upsert: true, contentType: 'image/jpeg' });

      if (uploadError) {
        toast.error(uploadError.message);
      } else {
        const { data: { publicUrl } } = supabase.storage
          .from('profile-assets')
          .getPublicUrl(filePath);
        
        // Update local state
        setProfile(prev => ({ ...prev, gcash_qr_url: publicUrl }));
        
        // Automatically update the database for the QR code
        const { error: dbError } = await supabase
          .from('profiles')
          .update({ gcash_qr_url: publicUrl })
          .eq('id', user?.id);

        if (dbError) {
          toast.error(t('qr_save_failed'));
        } else {
          await refreshProfile(); // Sync global state
          toast.success(t('qr_uploaded'));
        }
      }
    } catch (err: any) {
      toast.error(err.message || 'QR 이미지 압축 및 업로드 중 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleNotifications = async () => {
    if (!user) return;
    setNotifLoading(true);
    try {
      if (notifStatus === 'granted') {
        await unsubscribePush(user.id);
        setNotifStatus('default');
        toast.success('알림이 해제됐습니다.');
      } else {
        const success = await initPushNotifications(user.id);
        if (success) {
          setNotifStatus('granted');
          toast.success('알림이 활성화됐습니다!');
        } else {
          toast.error('알림 권한을 허용해 주세요.');
        }
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setNotifLoading(false);
    }
  };

  return (
    <div className="space-y-6 pb-24">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold dark:text-white">{t('settings')}</h1>
        <Button variant="ghost" size="icon" onClick={() => signOut()}>
          <LogOut className="w-5 h-5 text-red-500" />
        </Button>
      </header>

      {/* Admin Console Card - Premium Design for Admins */}
      {globalProfile?.is_admin && (
        <Link href="/admin">
          <Card className="relative overflow-hidden p-6 border-slate-200 dark:border-slate-800 rounded-[32px] bg-slate-900 text-white shadow-xl active:scale-[0.98] transition-all group cursor-pointer">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 blur-3xl rounded-full -mr-16 -mt-16 group-hover:bg-blue-500/20 transition-all"></div>
            <div className="relative flex items-center justify-between">
              <div className="flex items-center gap-5">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-blue-500/20 border border-blue-500/30 text-blue-400 shadow-lg">
                  <ShieldCheck className="w-7 h-7" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-lg font-black tracking-tight text-blue-400">
                    {t('admin_console')}
                  </h3>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                    {t('admin_console_desc')}
                  </p>
                </div>
              </div>
              <div className="p-2 rounded-full bg-slate-800 text-slate-300 group-hover:text-white transition-all">
                <ChevronRight className="w-5 h-5" />
              </div>
            </div>
          </Card>
        </Link>
      )}

      {/* Identity Verification Card - Premium Prominent Design */}
      <Link href="/settings/verification">
        <Card className={`relative overflow-hidden p-6 border-none rounded-[32px] shadow-xl shadow-blue-500/10 active:scale-[0.98] transition-all group ${
          globalProfile?.verification_status === 'verified' 
            ? 'bg-emerald-500/5 border border-emerald-500/10' 
            : 'bg-gradient-to-br from-blue-600 to-indigo-700 text-white'
        }`}>
          {/* Subtle Background Pattern */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 blur-3xl rounded-full -mr-16 -mt-16 group-hover:bg-white/20 transition-all"></div>
          
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-5">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg ${
                globalProfile?.verification_status === 'verified' 
                  ? 'bg-emerald-500/20 text-emerald-500' 
                  : 'bg-white/20 text-white backdrop-blur-md'
              }`}>
                <ShieldCheck className="w-7 h-7" />
              </div>
              <div className="space-y-1">
                <h3 className={`text-lg font-black tracking-tight ${
                  globalProfile?.verification_status === 'verified' ? 'text-emerald-500' : 'text-white'
                }`}>
                  {t('identity_verification')}
                </h3>
                <p className={`text-xs font-bold uppercase tracking-widest ${
                  globalProfile?.verification_status === 'verified' ? 'text-emerald-500/70' : 'text-blue-100/80'
                }`}>
                  {t('verification_status')}: {t(globalProfile?.verification_status || 'pending')}
                </p>
                {globalProfile?.verification_status !== 'verified' && (
                  <p className="text-[10px] font-medium text-white/60 mt-1">
                    {t('verification_benefits')}
                  </p>
                )}
              </div>
            </div>
            <div className={`p-2 rounded-full ${
              globalProfile?.verification_status === 'verified' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-white/20 text-white'
            }`}>
              <ChevronRight className="w-5 h-5" />
            </div>
          </div>
        </Card>
      </Link>

      {/* 푸시 알림 카드 */}
      <Card className="p-5 bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${
              notifStatus === 'granted' ? 'bg-green-100 dark:bg-green-900/30 text-green-600' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
            }`}>
              {notifStatus === 'granted' ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
            </div>
            <div>
              <p className="font-bold text-slate-900 dark:text-white text-sm">만기일 알림</p>
              <p className="text-xs text-slate-500">
                {notifStatus === 'granted' ? '알림 활성화됨 (D-1, D-2)' : notifStatus === 'denied' ? '브라우저에서 차단됨' : '비활성화'}
              </p>
            </div>
          </div>
          <button
            onClick={handleToggleNotifications}
            disabled={notifLoading || notifStatus === 'denied'}
            className={`relative w-14 h-7 rounded-full transition-all duration-300 ${
              notifStatus === 'granted' ? 'bg-green-500' : 'bg-slate-300 dark:bg-slate-600'
            } ${notifLoading ? 'opacity-50' : ''}`}
          >
            <span className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow-md transition-all duration-300 ${
              notifStatus === 'granted' ? 'left-7' : 'left-0.5'
            }`} />
          </button>
        </div>
        {notifStatus === 'denied' && (
          <p className="text-xs text-red-500 mt-3 px-1">브라우저 설정에서 알림 권한을 허용해 주세요.</p>
        )}
      </Card>

      {/* Language & Theme Card */}
      <Card className="p-4 bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 shadow-sm">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-500 flex items-center">
              <Globe className="w-3 h-3 mr-1" /> {t('language')}
            </label>
            <select 
              value={language}
              onChange={(e) => setLanguage(e.target.value as any)}
              className="w-full p-2 bg-slate-50 dark:bg-slate-800 rounded-lg text-sm border-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="en">English</option>
              <option value="tl">Tagalog</option>
              <option value="ko">한국어</option>
              <option value="zh">中文</option>
              <option value="ja">日本語</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-500 flex items-center">
              {theme === 'dark' ? <Moon className="w-3 h-3 mr-1" /> : <Sun className="w-3 h-3 mr-1" />} 
              {t('appearance')}
            </label>
            <div className="flex bg-slate-50 dark:bg-slate-800 rounded-lg p-1">
              <button 
                onClick={() => setTheme('light')}
                className={`flex-1 py-1 text-xs rounded-md transition-all ${theme === 'light' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500'}`}
              >
                {t('light')}
              </button>
              <button 
                onClick={() => setTheme('dark')}
                className={`flex-1 py-1 text-xs rounded-md transition-all ${theme === 'dark' ? 'bg-slate-700 shadow-sm text-blue-400' : 'text-slate-500'}`}
              >
                {t('dark')}
              </button>
            </div>
          </div>
        </div>
      </Card>

      {/* Profile Info Form */}
      <form onSubmit={handleUpdateProfile} className="space-y-4">
        <Card className="p-6 bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 shadow-sm space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium dark:text-slate-300">{t('full_name')}</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input 
                value={profile.full_name || ''}
                onChange={(e) => setProfile({...profile, full_name: e.target.value})}
                className="pl-10"
                placeholder={t('customer_name_placeholder')}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium dark:text-slate-300">{t('id_gov')}</label>
            <Input 
              value={profile.id_number || ''}
              onChange={(e) => setProfile({...profile, id_number: e.target.value})}
              placeholder={t('id_number_placeholder')}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium dark:text-slate-300">{t('contact_number')}</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input 
                  value={profile.phone || ''}
                  onChange={(e) => setProfile({...profile, phone: e.target.value})}
                  className="pl-10"
                  placeholder={t('phone_placeholder')}
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium dark:text-slate-300">{t('email_address')}</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input 
                  value={profile.email || ''}
                  onChange={(e) => setProfile({...profile, email: e.target.value})}
                  className="pl-10"
                  placeholder={t('email_placeholder')}
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium dark:text-slate-300">GCash Phone Number</label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input 
                value={profile.gcash_number || ''}
                onChange={(e) => setProfile({...profile, gcash_number: e.target.value})}
                className="pl-10"
                placeholder="09XXXXXXXXX"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium dark:text-slate-300">Solana Wallet Address (for Coin Repayment)</label>
            <div className="relative">
              <Wallet className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input 
                value={profile.solana_wallet || ''}
                onChange={(e) => setProfile({...profile, solana_wallet: e.target.value})}
                className="pl-10 font-mono text-xs"
                placeholder="솔라나 지갑 주소 (USDT/USDC 수금용)"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium dark:text-slate-300">{t('gcash_qr')}</label>
            <div className="flex items-center space-x-4">
              <div className="w-24 h-24 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center border-2 border-dashed border-slate-200 dark:border-slate-700 overflow-hidden relative">
                {profile.gcash_qr_url ? (
                  <img src={profile.gcash_qr_url} alt="GCash QR" className="w-full h-full object-cover" />
                ) : (
                  <QrCode className="w-8 h-8 text-slate-300" />
                )}
                <label className="absolute inset-0 cursor-pointer flex items-center justify-center bg-black/20 opacity-0 hover:opacity-100 transition-opacity">
                  <Camera className="w-6 h-6 text-white" />
                  <input type="file" className="hidden" accept="image/*" capture="environment" onChange={handleQRUpload} />
                </label>
              </div>
              <div className="flex-1 text-xs text-slate-500">
                {t('qr_hint')}
              </div>
            </div>
          </div>
        </Card>

        <Button type="submit" className="w-full h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold shadow-lg shadow-blue-500/20" disabled={loading}>
          {loading ? t('saving') : t('save_profile')}
        </Button>
      </form>
    </div>
  );
}
