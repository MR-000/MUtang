"use client";

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { ArrowLeft, Package, Pencil, Check, X, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface InventoryItem {
  id: string;
  sku: string;
  name: string;
  price: number;
  stock: number;
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

  useEffect(() => {
    if (user) fetchItems();
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
      // 바코드 중복 체크 (자기 자신 제외)
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
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

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
    </div>
  );
}
