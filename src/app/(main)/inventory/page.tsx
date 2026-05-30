"use client";

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Card } from '@/components/ui/card';
import { Package, TrendingUp, ShoppingCart, PlusCircle, ArrowDownToLine, History, ClipboardList } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function InventoryDashboard() {
  const { user, t } = useAuth();
  const router = useRouter();
  
  const [totalProducts, setTotalProducts] = useState(0);
  const [todaySales, setTodaySales] = useState(0);
  const [todayRevenue, setTodayRevenue] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchDashboardData();
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
          // quantity_change is negative for sales, so we take absolute value
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

      {/* One Screen One Function Navigation */}
      <div className="space-y-4 mt-8">
        <h2 className="text-lg font-bold dark:text-white px-1">{t('select_task')}</h2>
        {navItems.map((item, i) => (
          <button
            key={i}
            onClick={() => router.push(item.href)}
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
    </div>
  );
}
