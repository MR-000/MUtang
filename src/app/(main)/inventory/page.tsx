"use client";

import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Package, 
  TrendingUp, 
  ShoppingCart, 
  PlusCircle, 
  ArrowDownToLine, 
  History, 
  ClipboardList,
  X,
  Calendar,
  ArrowUpRight
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

interface LedgerLog {
  id: string;
  created_at: string;
  barcode: string;
  type: 'sale';
  quantity_change: number;
  price: number;
}

export default function InventoryDashboard() {
  const { user, t, language } = useAuth();
  const router = useRouter();
  
  const [totalProducts, setTotalProducts] = useState(0);
  const [todaySales, setTodaySales] = useState(0);
  const [todayRevenue, setTodayRevenue] = useState(0);
  const [loading, setLoading] = useState(true);

  // Sales Ledger States & Products for lookup
  const [ledgerLogs, setLedgerLogs] = useState<LedgerLog[]>([]);
  const [timeRange, setTimeRange] = useState<'day' | 'month'>('day');
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [showLedger, setShowLedger] = useState(false);
  const [products, setProducts] = useState<any[]>([]);

  useEffect(() => {
    if (user) {
      fetchDashboardData();
      fetchAllProducts();
      fetchLedgerLogs(timeRange);
    }
  }, [user]);

  const fetchDashboardData = async () => {
    try {
      // Fetch total products count
      const { count: productsCount } = await supabase
        .from('inventory')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user?.id);
        
      setTotalProducts(productsCount || 0);

      // Fetch today's sales from logs
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const { data: logs } = await supabase
        .from('inventory_logs')
        .select('quantity_change, price')
        .eq('user_id', user?.id)
        .eq('type', 'sale')
        .gte('created_at', startOfDay.toISOString());

      if (logs) {
        let salesCount = 0;
        let revenue = 0;
        logs.forEach(log => {
          const qty = Math.abs(log.quantity_change);
          salesCount += qty;
          revenue += qty * log.price;
        });
        setTodaySales(salesCount);
        setTodayRevenue(revenue);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchAllProducts = async () => {
    if (!user) return;
    try {
      const { data } = await supabase
        .from('inventory')
        .select('sku, name')
        .eq('user_id', user.id);
      setProducts(data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchLedgerLogs = async (range: 'day' | 'month') => {
    if (!user) return;
    setLedgerLoading(true);
    try {
      const startDate = new Date();
      if (range === 'day') {
        startDate.setHours(0, 0, 0, 0);
      } else {
        startDate.setDate(startDate.getDate() - 30);
        startDate.setHours(0, 0, 0, 0);
      }

      // 오직 매출(type: 'sale') 데이터만 쿼리해와 속도 및 보안 극대화
      const { data, error } = await supabase
        .from('inventory_logs')
        .select('*')
        .eq('user_id', user?.id)
        .eq('type', 'sale')
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;
      setLedgerLogs(data as any || []);
    } catch (e: any) {
      toast.error(e.message || '장부 로딩 실패');
    } finally {
      setLedgerLoading(false);
    }
  };

  // Memo Map for SKU name lookup
  const productMap = useMemo(() => {
    const map: { [key: string]: string } = {};
    products.forEach(p => {
      map[p.sku] = p.name;
    });
    return map;
  }, [products]);

  // Sales-only 요약 지표 산출
  const totalSales = useMemo(() => {
    return ledgerLogs
      .reduce((sum, log) => sum + Math.abs(log.quantity_change) * log.price, 0);
  }, [ledgerLogs]);

  const navItems = [
    {
      title: t('sell_barcode_scan'),
      desc: t('sell_barcode_desc'),
      icon: <ShoppingCart className="w-8 h-8" />,
      href: "/inventory/sell",
      color: "bg-blue-500",
      shadow: "shadow-blue-500/20"
    },
    {
      title: t('inbound_stock'),
      desc: t('inbound_stock_desc'),
      icon: <ArrowDownToLine className="w-8 h-8" />,
      href: "/inventory/inbound",
      color: "bg-green-500",
      shadow: "shadow-green-500/20"
    },
    {
      title: t('register_new_product'),
      desc: t('register_new_product_desc'),
      icon: <PlusCircle className="w-8 h-8" />,
      href: "/inventory/register",
      color: "bg-purple-500",
      shadow: "shadow-purple-500/20"
    },
    {
      title: t('stock_list'),
      desc: t('stock_list_desc'),
      icon: <ClipboardList className="w-8 h-8" />,
      href: "/inventory/stock",
      color: "bg-orange-500",
      shadow: "shadow-orange-500/20"
    },
    {
      title: t('ledger_title'),
      desc: t('ledger_desc'),
      icon: <TrendingUp className="w-8 h-8" />,
      href: "#ledger", // Trigger custom popup modal
      color: "bg-blue-600",
      shadow: "shadow-blue-600/20"
    }
  ];

  return (
    <div className="space-y-6 pb-24 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header>
        <h1 className="text-2xl font-black dark:text-white">{t('mobile_inventory')}</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1 font-medium">{t('scan_save_check')}</p>
      </header>

      {/* Dashboard Stats */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="col-span-2 p-5 bg-gradient-to-br from-slate-900 to-slate-800 dark:from-white/10 dark:to-white/5 border-none text-white shadow-xl flex flex-col justify-center rounded-[24px]">
          <div className="flex items-center gap-2 text-white/70 mb-2 font-bold text-sm">
            <TrendingUp className="w-4 h-4" />
            {t('today_revenue')}
          </div>
          <div className="text-4xl font-black">
            ₱{todayRevenue.toLocaleString()}
          </div>
          <div className="text-sm mt-2 text-white/50 font-medium">
            {t('total_sales_count').replace('{count}', todaySales.toString())}
          </div>
        </Card>

        <Card className="p-5 bg-white dark:bg-slate-900 border-none shadow-lg rounded-[24px]">
          <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 mb-2 font-bold text-xs">
            <Package className="w-4 h-4" />
            {t('registered_products_count')}
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white">
            {totalProducts}
          </div>
        </Card>

        <Card className="p-5 bg-white dark:bg-slate-900 border-none shadow-lg rounded-[24px] flex items-center justify-between" onClick={() => fetchDashboardData()}>
          <div>
            <div className="text-slate-500 dark:text-slate-400 mb-2 font-bold text-xs">{t('status')}</div>
            <div className="text-lg font-black text-green-500">{t('auto_synced')}</div>
          </div>
          <History className="w-6 h-6 text-slate-200 dark:text-slate-700" />
        </Card>
      </div>

      {/* Navigation list with 5th element Sales Ledger */}
      <div className="space-y-4 mt-8">
        <h2 className="text-lg font-bold dark:text-white px-1">{t('select_task')}</h2>
        {navItems.map((item, i) => (
          <button
            key={i}
            type="button"
            onClick={() => {
              if (item.href === "#ledger") {
                fetchAllProducts();
                fetchLedgerLogs(timeRange);
                setShowLedger(true);
              } else {
                router.push(item.href);
              }
            }}
            className="w-full text-left bg-white dark:bg-slate-900 p-5 rounded-[24px] shadow-lg flex items-center gap-5 active:scale-95 transition-transform"
          >
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-white ${item.color} ${item.shadow} shadow-lg shrink-0`}>
              {item.icon}
            </div>
            <div>
              <div className="font-black text-lg dark:text-white mb-1">{item.title}</div>
              <div className="text-sm text-slate-500 font-medium">{item.desc}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Sales-only Slide Popup Modal */}
      {showLedger && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-in fade-in duration-300">
          <div 
            className="bg-[#0A0F1E]/95 border border-white/10 w-full max-w-lg rounded-[36px] overflow-hidden shadow-2xl flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200 text-left"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-6 pb-4 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-black text-white">{t('ledger_title')}</h2>
                  <p className="text-[10px] text-slate-400 font-medium">{t('ledger_desc')}</p>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setShowLedger(false)}
                className="rounded-full w-10 h-10 bg-white/5 hover:bg-white/10 text-white"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              
              {/* Time Range Selector & Total Sales Card */}
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-blue-400" />
                    {t('appearance')}
                  </span>
                  
                  {/* Selector Tabs */}
                  <div className="bg-white/5 p-1 rounded-2xl flex gap-1 shadow-inner shrink-0 border border-white/5">
                    <button
                      type="button"
                      onClick={() => {
                        setTimeRange('day');
                        fetchLedgerLogs('day');
                      }}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                        timeRange === 'day'
                          ? 'bg-blue-600 text-white shadow-md'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {t('one_day')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTimeRange('month');
                        fetchLedgerLogs('month');
                      }}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                        timeRange === 'month'
                          ? 'bg-blue-600 text-white shadow-md'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {t('one_month')}
                    </button>
                  </div>
                </div>

                {/* Sales-Only Premium Card Dashboard */}
                <Card className="p-6 bg-gradient-to-br from-blue-600 to-indigo-700 border-none text-white shadow-xl flex flex-col justify-center rounded-3xl relative overflow-hidden">
                  <div className="absolute right-[-20px] bottom-[-20px] w-32 h-32 bg-white/5 rounded-full blur-2xl"></div>
                  <div className="flex items-center gap-1.5 text-white/80 text-xs font-black uppercase tracking-wider mb-2">
                    <ArrowUpRight className="w-4 h-4 text-white" />
                    {t('total_sales')}
                  </div>
                  <div className="text-3xl font-black">
                    ₱{totalSales.toLocaleString()}
                  </div>
                </Card>
              </div>

              {/* Transactions List */}
              <div className="space-y-3">
                <div className="text-xs font-black text-slate-400 uppercase tracking-widest px-1">
                  {t('debts')}
                </div>

                {ledgerLoading ? (
                  <div className="text-center py-10">
                    <div className="text-slate-400 font-bold animate-pulse text-xs">{t('loading')}</div>
                  </div>
                ) : ledgerLogs.length === 0 ? (
                  <div className="text-center py-12 bg-white/5 rounded-3xl space-y-2 border border-white/5">
                    <Package className="w-10 h-10 text-slate-700 mx-auto" />
                    <div className="text-slate-400 text-xs font-bold">기록된 매출 내역이 없습니다.</div>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {ledgerLogs.map((log) => {
                      const productName = productMap[log.barcode] || log.barcode;
                      const qty = Math.abs(log.quantity_change);
                      const totalAmount = qty * log.price;
                      const formattedDate = new Date(log.created_at).toLocaleDateString() + ' ' + new Date(log.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

                      return (
                        <div 
                          key={log.id} 
                          className="p-4 bg-white/5 border border-white/5 shadow-sm rounded-2xl flex items-center justify-between"
                        >
                          <div className="flex items-center gap-3.5 min-w-0">
                            <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0">
                              <ArrowUpRight className="w-5 h-5" />
                            </div>
                            
                            <div className="min-w-0">
                              <div className="font-bold text-white truncate text-xs">{productName}</div>
                              <div className="text-[10px] text-slate-400 font-medium mt-0.5">{formattedDate}</div>
                            </div>
                          </div>

                          <div className="text-right shrink-0 ml-3">
                            <div className="text-sm font-black text-blue-400">
                              +₱{totalAmount.toLocaleString()}
                            </div>
                            <div className="text-[9px] text-slate-400 font-medium mt-0.5">
                              {qty}개 × ₱{log.price.toLocaleString()}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
