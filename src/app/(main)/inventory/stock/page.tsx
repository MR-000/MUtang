"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { ArrowLeft, Package, Pencil, Check, X, Search, ArrowUpRight, TrendingUp, Calendar } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface InventoryItem {
  id: string;
  sku: string;
  name: string;
  price: number;
  stock: number;
}

interface LedgerLog {
  id: string;
  created_at: string;
  barcode: string;
  type: 'sale';
  quantity_change: number;
  price: number;
}

export default function StockListPage() {
  const { user, t } = useAuth();
  const router = useRouter();

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSku, setEditSku] = useState('');
  const [editName, setEditName] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editStock, setEditStock] = useState('');
  const [saving, setSaving] = useState(false);

  // Sales-Only Ledger States
  const [ledgerLogs, setLedgerLogs] = useState<LedgerLog[]>([]);
  const [timeRange, setTimeRange] = useState<'day' | 'month'>('day');
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [showLedger, setShowLedger] = useState(false);

  useEffect(() => {
    if (user) {
      fetchItems();
      fetchLedgerLogs(timeRange);
    }
  }, [user]);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('inventory')
        .select('*')
        .eq('user_id', user?.id)
        .order('name', { ascending: true });

      setItems(data || []);
    } finally {
      setLoading(false);
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
        // Recent 30 Days
        startDate.setDate(startDate.getDate() - 30);
        startDate.setHours(0, 0, 0, 0);
      }

      // 오직 'sale' 타입의 매출 기록만 엄격히 필터링해서 가져옴
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

  const startEdit = (item: InventoryItem) => {
    setEditingId(item.id);
    setEditSku(item.sku);
    setEditName(item.name);
    setEditPrice(String(item.price));
    setEditStock(String(item.stock));
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const saveEdit = async (id: string) => {
    if (!editSku || !editName || !editPrice) return;
    setSaving(true);
    try {
      // 바코드 중복 체크
      const { data: existing } = await supabase
        .from('inventory')
        .select('id')
        .eq('user_id', user?.id)
        .eq('sku', editSku)
        .neq('id', id)
        .maybeSingle();

      if (existing) {
        toast.error(t('duplicate_barcode_edit'));
        setSaving(false);
        return;
      }

      const { error } = await supabase
        .from('inventory')
        .update({
          sku: editSku,
          name: editName,
          price: parseFloat(editPrice),
          stock: parseInt(editStock) || 0
        })
        .eq('id', id)
        .eq('user_id', user?.id);

      if (error) throw error;

      toast.success(t('stock_updated'));
      setEditingId(null);
      await fetchItems();
      await fetchLedgerLogs(timeRange);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  // Helper Memo Maps for Ledger Lookup
  const productMap = useMemo(() => {
    const map: { [key: string]: string } = {};
    items.forEach(item => {
      map[item.sku] = item.name;
    });
    return map;
  }, [items]);

  // 오직 매출(sales)에 대한 총액 지표만 계산 (매입 및 순수익 관련 수식 전면 영구 삭제)
  const totalSales = useMemo(() => {
    return ledgerLogs
      .reduce((sum, log) => sum + Math.abs(log.quantity_change) * log.price, 0);
  }, [ledgerLogs]);

  const filtered = items.filter(item =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.sku.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 pb-24 animate-in slide-in-from-right-8 duration-300">
      <header className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.back()}
          className="rounded-full w-12 h-12 bg-white dark:bg-white/5 shadow-sm"
        >
          <ArrowLeft className="w-6 h-6" />
        </Button>
        <div>
          <h1 className="text-2xl font-black dark:text-white">{t('stock_list')}</h1>
          <p className="text-sm text-slate-500 font-medium">{t('stock_list_desc')}</p>
        </div>
      </header>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <Input
          placeholder={t('search_items')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-14 pl-12 rounded-2xl bg-white dark:bg-slate-900 border-none shadow-md text-base font-medium"
        />
      </div>

      {loading ? (
        <div className="text-center py-20">
          <div className="text-slate-400 font-bold animate-pulse">{t('loading')}</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 space-y-2">
          <Package className="w-12 h-12 text-slate-200 dark:text-slate-700 mx-auto" />
          <div className="text-slate-400 font-bold">{t('no_stock_data')}</div>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => (
            <Card
              key={item.id}
              className="p-5 bg-white dark:bg-slate-900 border-none shadow-md rounded-[24px]"
            >
              {editingId === item.id ? (
                <div className="space-y-3">
                  <div className="text-xs font-black text-slate-400 uppercase tracking-widest">{t('edit_stock')}</div>
                  <div className="space-y-1">
                    <div className="text-xs text-slate-400 font-bold px-1">{t('edit_barcode')}</div>
                    <Input
                      value={editSku}
                      onChange={(e) => setEditSku(e.target.value)}
                      placeholder={t('barcode_number')}
                      className="h-12 rounded-xl bg-slate-50 dark:bg-white/5 border-none font-bold font-mono text-slate-600 dark:text-slate-300"
                    />
                  </div>
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder={t('product_name_label')}
                    className="h-12 rounded-xl bg-slate-50 dark:bg-white/5 border-none font-bold"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <div className="text-xs text-slate-400 font-bold px-1">{t('price')} (₱)</div>
                      <Input
                        type="number"
                        value={editPrice}
                        onChange={(e) => setEditPrice(e.target.value)}
                        className="h-12 rounded-xl bg-slate-50 dark:bg-white/5 border-none font-bold text-blue-600"
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs text-slate-400 font-bold px-1">{t('current_stock')}</div>
                      <Input
                        type="number"
                        value={editStock}
                        onChange={(e) => setEditStock(e.target.value)}
                        className="h-12 rounded-xl bg-slate-50 dark:bg-white/5 border-none font-bold text-green-600"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button
                      onClick={() => saveEdit(item.id)}
                      disabled={saving}
                      className="flex-1 h-12 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl font-black flex items-center justify-center gap-2"
                    >
                      <Check className="w-4 h-4" />
                      {saving ? t('processing') : t('save_changes')}
                    </Button>
                    <Button
                      onClick={cancelEdit}
                      variant="ghost"
                      className="h-12 w-12 rounded-2xl bg-slate-100 dark:bg-white/5"
                    >
                      <X className="w-5 h-5" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="font-black text-lg dark:text-white truncate">{item.name}</div>
                    <div className="text-xs text-slate-400 font-mono mt-0.5">{item.sku}</div>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-base font-bold text-blue-600">₱{item.price.toLocaleString()}</span>
                      <span className={`text-sm font-bold px-2 py-0.5 rounded-full ${item.stock <= 5 ? 'bg-red-100 text-red-600 dark:bg-red-900/30' : 'bg-green-100 text-green-700 dark:bg-green-900/30'}`}>
                        {t('stock')}: {item.stock}
                      </span>
                    </div>
                  </div>
                  <Button
                    onClick={() => startEdit(item)}
                    variant="ghost"
                    className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-white/5 shrink-0 ml-3"
                  >
                    <Pencil className="w-5 h-5 text-slate-500" />
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* 매출 장부 실행 토글 버튼 (Premium HSL Mesh Shadow) */}
      <div className="mt-6">
        <Button
          type="button"
          onClick={() => {
            fetchLedgerLogs(timeRange);
            setShowLedger(true);
          }}
          className="w-full h-16 rounded-[24px] bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black text-lg flex items-center justify-center gap-2.5 shadow-xl shadow-blue-500/20 active:scale-98 transition-all"
        >
          <TrendingUp className="w-6 h-6" />
          {t('ledger_title')}
        </Button>
      </div>

      {/* 매출 정보만 출력하는 전용 슬라이드 팝업 모달창 (매입 완벽 삭제) */}
      {showLedger && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-in fade-in duration-300">
          <div 
            className="bg-[#0A0F1E]/95 border border-white/10 w-full max-w-lg rounded-[36px] overflow-hidden shadow-2xl flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200"
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
