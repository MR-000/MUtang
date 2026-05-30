"use client";

import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  Home, 
  Users, 
  ScrollText, 
  Package, 
  ShieldCheck,
  Settings
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect } from 'react';

const getNavItems = (t: (k: string) => string, isAdmin?: boolean) => {
  const items = [
    { name: t('dashboard'), path: '/', icon: Home },
    { name: t('customers'), path: '/customers', icon: Users },
    { name: t('debts'), path: '/debts', icon: ScrollText },
    { name: t('inventory'), path: '/inventory', icon: Package },
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

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [user, loading, router]);

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
            
            return (
              <Link
                key={item.path}
                href={item.path}
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

      {/* Safe Area Bottom Spacer */}
      <div className="h-safe-area-bottom"></div>
    </div>
  );
}
