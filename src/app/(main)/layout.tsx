"use client";

import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  Home, 
  Users, 
  ScrollText, 
  Package, 
  ShieldCheck,
  Settings,
  Info,
  AlertTriangle,
  Download,
  X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const getNavItems = (t: (k: string) => string, isAdmin?: boolean) => {
  const items = [
    { name: t('dashboard'), path: '/', icon: Home },
    { name: t('customers'), path: '/customers', icon: Users },
    { name: t('inventory'), path: '/inventory', icon: Package },
    { name: t('debts'), path: '/debts', icon: ScrollText },
    { name: t('settings'), path: '/settings', icon: Settings },
  ];
  if (isAdmin) {
    items.push({ name: t('admin'), path: '/admin', icon: ShieldCheck });
  }
  return items;
};

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, t, profile } = useAuth();
  const navItems = getNavItems(t, profile?.is_admin === true);
  const [isDebtsNoticeOpen, setIsDebtsNoticeOpen] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [isIOSAndSafari, setIsIOSAndSafari] = useState(false);
  const [isSafariGuideOpen, setIsSafariGuideOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 1. 이미 앱(standalone) 모드로 실행 중인 경우 배너를 노출하지 않음
    if (window.matchMedia('(display-mode: standalone)').matches) {
      return;
    }

    // 2. 사용자가 이번 세션에 배너를 닫은 이력이 있다면 노출하지 않음
    const isDismissed = sessionStorage.getItem('pwa_install_dismissed') === 'true';
    if (isDismissed) {
      return;
    }

    // 3. iOS Safari 감지
    const ua = window.navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
    const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
    if (isIOS && isSafari) {
      setIsIOSAndSafari(true);
      setShowInstallBanner(true);
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallBanner(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`PWA install prompt outcome: ${outcome}`);
    setDeferredPrompt(null);
    setShowInstallBanner(false);
  };

  const handleDismissInstall = () => {
    setShowInstallBanner(false);
    sessionStorage.setItem('pwa_install_dismissed', 'true');
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0A0F1E]">
        <div className="relative">
          <div className="absolute inset-0 bg-blue-500 blur-2xl opacity-20 animate-pulse"></div>
          <ShieldCheck className="w-12 h-12 text-blue-500 animate-bounce relative" />
        </div>
      </div>
    );
  }

  const isAdminUser = profile?.is_admin === true;

  return (
    <div className="flex flex-col h-[100dvh] overflow-hidden bg-slate-50 dark:bg-[#0A0F1E]">
      {/* Premium Container with Mobile Constraint */}
      <main className="flex-1 w-full max-w-lg mx-auto relative bg-white dark:bg-[#0A0F1E] h-full flex flex-col overflow-hidden pb-24">
        {/* PWA 인앱 설치 유도 배너 */}
        {showInstallBanner && (deferredPrompt || isIOSAndSafari) && (
          <div className="mx-6 mt-4 p-4 bg-gradient-to-r from-blue-600/90 to-indigo-600/90 text-white rounded-2xl shadow-xl flex items-center justify-between gap-3 animate-in slide-in-from-top-4 duration-300 z-50 border border-white/10 backdrop-blur-md">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                <Download className="w-5 h-5 text-white animate-bounce" />
              </div>
              <div className="space-y-0.5">
                <p className="text-xs font-black">{t('pwa_install_banner_title')}</p>
                <p className="text-[10px] opacity-90 font-medium leading-tight">
                  {isIOSAndSafari ? t('ios_pwa_guide') : t('pwa_install_banner_desc')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button 
                onClick={handleDismissInstall}
                className="p-2 text-white/70 hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
              {isIOSAndSafari ? (
                <button 
                  onClick={() => setIsSafariGuideOpen(true)}
                  className="px-3 py-1.5 bg-white text-blue-600 font-black text-[10px] rounded-lg shadow-md hover:bg-slate-50 active:scale-95 transition-all"
                >
                  {t('confirm')}
                </button>
              ) : (
                <button 
                  onClick={handleInstallClick}
                  className="px-3.5 py-2 bg-white text-blue-600 font-black text-[11px] rounded-xl shadow-md hover:bg-slate-50 active:scale-95 transition-all"
                >
                  {t('pwa_install_banner_btn')}
                </button>
              )}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-6 pt-6 scrollbar-hide">
          {children}
        </div>
      </main>

      {/* Premium Floating Bottom Navigation */}
      <div className="fixed bottom-6 left-0 right-0 z-50 flex justify-center px-4 pointer-events-none">
        <nav className={cn(
          "w-full h-20 bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl border border-slate-200/50 dark:border-white/10 rounded-[32px] shadow-2xl flex items-center justify-around pointer-events-auto transition-all duration-300",
          isAdminUser ? "max-w-md px-2" : "max-w-sm px-4"
        )}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.path || 
              (item.path !== '/' && pathname.startsWith(item.path));
            
            const handleItemClick = (e: React.MouseEvent) => {
              if (item.path === '/debts') {
                e.preventDefault();
                setIsDebtsNoticeOpen(true);
              }
            };
            
            return (
              <Link
                key={item.path}
                href={item.path}
                onClick={handleItemClick}
                className={cn(
                  "relative flex flex-col items-center justify-center rounded-2xl transition-all duration-300",
                  isActive ? "text-amber-500 scale-105" : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-200",
                  isAdminUser ? "w-14 h-14" : "w-16 h-16"
                )}
              >
                {isActive && (
                  <span className="absolute inset-0 bg-amber-500/10 rounded-2xl animate-in fade-in zoom-in duration-300"></span>
                )}
                <Icon className={cn("z-10", isActive ? "stroke-[2.5px]" : "stroke-[1.5px]", isAdminUser ? "w-5 h-5" : "w-6 h-6")} />
                <span className={cn(
                  "font-bold mt-1 z-10 truncate text-center max-w-[56px]", 
                  isAdminUser ? "text-[9px]" : "text-[10px]"
                )}>
                  {item.name}
                </span>
                {isActive && (
                  <span className="absolute -bottom-1 w-1 h-1 bg-amber-500 rounded-full"></span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* 외상거래 안내 및 법적 책임 면책 고지 모달 */}
      <Dialog open={isDebtsNoticeOpen} onOpenChange={setIsDebtsNoticeOpen}>
        <DialogContent className="max-w-md w-[90%] mx-auto bg-slate-900/95 dark:bg-slate-950/95 text-slate-100 border border-slate-800 dark:border-white/10 rounded-3xl p-6 backdrop-blur-xl animate-in fade-in duration-300">
          <DialogHeader className="space-y-3">
            <div className="mx-auto w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
              <Info className="w-6 h-6 text-blue-500" />
            </div>
            <DialogTitle className="text-center text-base font-black tracking-tight text-white leading-tight">
              {t('debts_modal_title')}
            </DialogTitle>
          </DialogHeader>

          <div className="py-2.5 space-y-4 max-h-[40vh] overflow-y-auto scrollbar-hide pr-1 text-slate-300 text-xs leading-relaxed">
            <div className="space-y-1.5">
              <p className="font-black text-white">{t('debts_modal_sub1')}</p>
              <p>{t('debts_modal_desc1_1')}</p>
              <p>{t('debts_modal_desc1_2')}</p>
              <p>{t('debts_modal_desc1_3')}</p>
              <p>{t('debts_modal_desc1_4')}</p>
            </div>

            <div className="space-y-1.5 pt-3 border-t border-slate-800/80">
              <div className="flex items-center gap-1.5 text-rose-500 font-black">
                <AlertTriangle className="w-4 h-4" />
                <span>{t('debts_modal_sub2')}</span>
              </div>
              <p className="text-slate-400 font-medium">
                {t('debts_modal_desc2')}
              </p>
            </div>
          </div>

          <div className="flex gap-3 pt-4 border-t border-slate-800/80">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsDebtsNoticeOpen(false)}
              className="flex-1 h-11 rounded-xl border-slate-800 bg-transparent text-slate-400 hover:text-white hover:bg-slate-800/50 font-bold text-xs active:scale-95 transition-transform"
            >
              {t('debts_modal_cancel_btn')}
            </Button>
            <Button
              type="button"
              onClick={() => {
                setIsDebtsNoticeOpen(false);
                router.push('/debts');
              }}
              className="flex-1 h-11 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-xs shadow-lg shadow-blue-600/20 active:scale-95 transition-all flex items-center justify-center"
            >
              {t('debts_modal_agree_btn')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* iOS Safari PWA 설치 안내 모달 */}
      <Dialog open={isSafariGuideOpen} onOpenChange={setIsSafariGuideOpen}>
        <DialogContent className="max-w-md w-[90%] mx-auto bg-slate-900/95 dark:bg-slate-950/95 text-slate-100 border border-slate-800 dark:border-white/10 rounded-3xl p-6 backdrop-blur-xl animate-in fade-in duration-300">
          <DialogHeader className="space-y-3">
            <div className="mx-auto w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
              <Download className="w-6 h-6 text-blue-500 animate-bounce" />
            </div>
            <DialogTitle className="text-center text-base font-black tracking-tight text-white leading-tight">
              {t('pwa_install_banner_title')}
            </DialogTitle>
          </DialogHeader>

          <div className="py-2.5 space-y-4 text-slate-300 text-xs leading-relaxed">
            <p className="font-medium text-center text-[13px] text-white">
              {t('ios_pwa_guide')}
            </p>
            <div className="p-4 bg-white/5 rounded-xl border border-white/5 space-y-3">
              <p className="font-black text-slate-100 text-xs border-b border-white/10 pb-1.5">{t('pwa_guide_title')}</p>
              <p>{t('pwa_guide_step1')}</p>
              <p>{t('pwa_guide_step2')}</p>
              <p>{t('pwa_guide_step3')}</p>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800/80">
            <Button
              type="button"
              onClick={() => setIsSafariGuideOpen(false)}
              className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-xs shadow-lg shadow-blue-600/20 active:scale-95 transition-all flex items-center justify-center"
            >
              {t('confirm')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Safe Area Bottom Spacer */}
      <div className="h-safe-area-bottom"></div>
    </div>
  );
}
