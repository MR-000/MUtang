"use client";

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  HandCoins, 
  Search, 
  Filter, 
  TrendingUp, 
  ShieldCheck, 
  ChevronRight,
  Info
} from 'lucide-react';
import { TierBadge } from '@/components/ui/tier-badge';
import { toast } from 'sonner';

export default function Marketplace() {
  const { user, profile, t } = useAuth();
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    // In a real app, we'd fetch from matching_requests table
    // For now, we'll show mock data that matches the premium UI
    const mockRequests = [
      {
        id: '1',
        borrower_name: 'Maria Santos',
        store_type: 'Sari-Sari Store',
        amount: 5000,
        purpose: 'Inventory Restock',
        tier: 'Gold',
        repayment_rate: '98%',
        created_at: new Date().toISOString()
      },
      {
        id: '2',
        borrower_name: 'Jun-Jun Store',
        store_type: 'Bakery',
        amount: 12000,
        purpose: 'New Equipment',
        tier: 'Platinum',
        repayment_rate: '100%',
        created_at: new Date().toISOString()
      }
    ];
    
    setRequests(mockRequests);
    setLoading(false);
  };

  const handleInvest = (req: any) => {
    toast.success(`${t('investment_request_sent')} ${req.borrower_name}`);
  };

  return (
    <div className="space-y-8 pb-24">
      <header className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-black dark:text-white">{t('marketplace')}</h1>
          <Button variant="outline" className="rounded-2xl border-slate-200 dark:border-white/10">
            <Filter className="w-4 h-4 mr-2" /> {t('filter')}
          </Button>
        </div>
        <p className="text-slate-500 font-medium">
          {t('marketplace_subtitle')}
        </p>
      </header>

      {/* Featured Insights */}
      <section className="grid md:grid-cols-2 gap-4">
        <Card className="p-6 bg-[#0A0F1E] border-none text-white overflow-hidden relative group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/20 blur-3xl rounded-full -mr-16 -mt-16 group-hover:bg-blue-600/30 transition-all"></div>
          <div className="relative space-y-4">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-400">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold">{t('trust_investing')}</h3>
              <p className="text-xs text-slate-400 mt-1">{t('trust_investing_desc')}</p>
            </div>
            <Button size="sm" className="bg-white text-slate-950 hover:bg-slate-200 rounded-xl font-bold px-4">
              {t('learn_more')}
            </Button>
          </div>
        </Card>
        
        <Card className="p-6 bg-emerald-950 border-none text-emerald-100 overflow-hidden relative group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/20 blur-3xl rounded-full -mr-16 -mt-16 group-hover:bg-emerald-500/30 transition-all"></div>
          <div className="relative space-y-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">{t('secure_matches')}</h3>
              <p className="text-xs text-emerald-400/70 mt-1">{t('secure_matches_desc')}</p>
            </div>
            <div className="flex items-center gap-2 text-xs font-bold text-white bg-emerald-900/50 w-fit px-3 py-1 rounded-full border border-emerald-500/20">
              <Info className="w-3 h-3" /> {t('rls_protected')}
            </div>
          </div>
        </Card>
      </section>

      {/* Requests List */}
      <section className="space-y-4">
        <h2 className="text-xl font-black dark:text-white px-2">{t('active_requests')}</h2>
        <div className="space-y-4">
          {loading ? (
            <div className="text-center py-10 text-slate-400 animate-pulse">{t('loading')}</div>
          ) : requests.length > 0 ? (
            requests.map((req) => (
              <Card key={req.id} className="p-6 bg-white dark:bg-slate-900/50 border-slate-100 dark:border-white/5 rounded-[32px] shadow-sm hover:shadow-md transition-all group">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div className="flex items-center gap-5">
                    <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-white/5 flex items-center justify-center text-2xl font-black text-slate-900 dark:text-white">
                      {req.borrower_name.charAt(0)}
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-lg text-slate-900 dark:text-white">{req.borrower_name}</h3>
                        <TierBadge tier={req.tier} />
                      </div>
                      <p className="text-sm text-slate-500 font-medium">{req.store_type} • {req.purpose}</p>
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-[10px] font-black uppercase tracking-wider text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-full">
                          {req.repayment_rate} {t('repaid')}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between md:flex-col md:items-end gap-2 border-t md:border-t-0 pt-4 md:pt-0 border-slate-50 dark:border-white/5">
                    <div className="text-right">
                      <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">{t('funding_needed')}</p>
                      <div className="text-2xl font-black text-slate-900 dark:text-white">₱{req.amount.toLocaleString()}</div>
                    </div>
                    <Button 
                      onClick={() => handleInvest(req)}
                      className="bg-blue-600 hover:bg-blue-700 text-white rounded-2xl px-8 h-12 font-black shadow-lg shadow-blue-500/20"
                    >
                      {t('fund_now')}
                    </Button>
                  </div>
                </div>
              </Card>
            ))
          ) : (
            <div className="text-center py-20 text-slate-400">
              {t('no_active_requests')}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
