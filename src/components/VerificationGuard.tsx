"use client";

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { 
  ShieldAlert, 
  ChevronRight, 
  User, 
  Phone, 
  Mail, 
  IdCard,
  ArrowRight
} from 'lucide-react';
import Link from 'next/link';

interface VerificationGuardProps {
  onSuccess: () => void;
  isOpen: boolean;
  onClose: () => void;
}

export function VerificationGuard({ onSuccess, isOpen, onClose }: VerificationGuardProps) {
  const { profile, t } = useAuth();
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (isOpen) {
      // 마운트 후 아주 짧은 시간 뒤에 트랜지션 클래스를 켜주어 부드러운 하드웨어 가속 유도
      const timer = setTimeout(() => setActive(true), 30);
      return () => clearTimeout(timer);
    } else {
      setActive(false);
    }
  }, [isOpen]);

  const missingInfo = [];
  if (!profile?.full_name) missingInfo.push({ id: 'name', label: t('full_name'), icon: User });
  if (!profile?.phone) missingInfo.push({ id: 'phone', label: t('phone_number'), icon: Phone });
  if (!profile?.email) missingInfo.push({ id: 'email', label: t('email_address'), icon: Mail });
  if (!profile?.id_front_url || !profile?.id_front_url_2) missingInfo.push({ id: 'id', label: t('id_docs_count'), icon: IdCard });

  const isVerified = missingInfo.length === 0 && profile?.verification_status === 'verified';

  if (!isOpen) return null;

  if (isVerified) {
    onSuccess();
    return null;
  }

  return (
    <div 
      className={`fixed inset-0 z-[100] flex items-end justify-center bg-black/60 backdrop-blur-sm p-4 transition-all duration-300 ${
        active ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
      onClick={onClose}
    >
      <div 
        className={`w-full max-w-md bg-white dark:bg-slate-900 rounded-[40px] p-8 shadow-2xl transition-all duration-300 ease-out transform ${
          active ? 'translate-y-0 scale-100' : 'translate-y-full scale-95'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col items-center text-center space-y-6">
          <div className="w-20 h-20 bg-amber-500/10 rounded-3xl flex items-center justify-center text-amber-500 animate-pulse">
            <ShieldAlert className="w-10 h-10" />
          </div>
          
          <div className="space-y-2">
            <h2 className="text-2xl font-black dark:text-white">
              {t('verification_required')}
            </h2>
            <p className="text-slate-500 dark:text-slate-400 font-medium">
              {t('verification_desc')}
            </p>
          </div>

          <div className="w-full space-y-3 py-4">
            {missingInfo.map((info) => (
              <div 
                key={info.id}
                className="flex items-center justify-between p-4 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-white/5"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 flex items-center justify-center text-slate-400">
                    <info.icon className="w-5 h-5" />
                  </div>
                  <span className="font-bold dark:text-white">{info.label}</span>
                </div>
                <div className="text-amber-500 text-[10px] font-black uppercase tracking-widest">{t('missing')}</div>
              </div>
            ))}
            
            {missingInfo.length === 0 && profile?.verification_status !== 'verified' && (
              <div 
                className="flex items-center justify-between p-4 bg-blue-500/10 rounded-2xl border border-blue-500/20"
              >
                <div className="flex items-center gap-3 text-blue-500">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                    <IdCard className="w-5 h-5" />
                  </div>
                  <span className="font-bold">{t('identity_approval')}</span>
                </div>
                <div className="text-blue-500 text-[10px] font-black uppercase tracking-widest">{t('pending')}</div>
              </div>
            )}
          </div>

          <div className="w-full pt-4">
            <Link href="/settings" className="block w-full">
              <Button 
                className="w-full h-16 bg-blue-600 hover:bg-blue-700 text-white rounded-[24px] font-black text-lg shadow-xl shadow-blue-500/30 flex items-center justify-center gap-3"
                onClick={onClose}
              >
                {t('go_to_settings')} <ArrowRight className="w-5 h-5" />
              </Button>
            </Link>
            <button 
              onClick={onClose}
              className="w-full py-4 text-slate-400 font-bold text-sm hover:text-slate-600 transition-colors"
            >
              {t('maybe_later')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
