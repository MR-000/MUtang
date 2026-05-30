"use client";

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { ArrowLeft, ScanBarcode, ArrowDownToLine, Minus, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';

export default function InboundProductPage() {
  const { user, t } = useAuth();
  const router = useRouter();
  const [isScanning, setIsScanning] = useState(false);
  const [barcode, setBarcode] = useState('');
  const [product, setProduct] = useState<any>(null);
  const [quantity, setQuantity] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const BarcodeScanner = dynamic(
    () => import('@/components/ui/BarcodeScanner').then(mod => mod.BarcodeScanner),
    {
      ssr: false,
      loading: () => (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center text-white font-black text-lg animate-pulse">
          {t('camera_scanner_loading')}
        </div>
      )
    }
  );

  useEffect(() => {
    if (barcode && barcode.length >= 3) {
      fetchProduct();
    } else {
      setProduct(null);
    }
  }, [barcode]);

  const fetchProduct = async () => {
    const { data } = await supabase
      .from('inventory')
      .select('*')
      .eq('user_id', user?.id)
      .eq('sku', barcode)
      .single();

    setProduct(data || null);
  };

  const handleScan = (code: string) => {
    setBarcode(code);
    setIsScanning(false);
  };

  const handleInbound = async () => {
    if (!product || quantity <= 0) return;

    setIsSubmitting(true);
    try {
      // 1. 입고 로그 기록
      const { error: logError } = await supabase
        .from('inventory_logs')
        .insert([{
          user_id: user?.id,
          barcode: product.sku,
          type: 'inbound',
          quantity_change: quantity,
          price: product.price
        }]);

      if (logError) throw logError;

      // 2. inventory 테이블 재고 증가
      const newStock = (product.stock ?? 0) + quantity;
      const { error: stockError } = await supabase
        .from('inventory')
        .update({ stock: newStock })
        .eq('sku', product.sku)
        .eq('user_id', user?.id);

      if (stockError) throw stockError;

      toast.success(t('inbound_success'));
      setBarcode('');
      setProduct(null);
      setQuantity(1);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

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
        <h1 className="text-2xl font-black dark:text-white">{t('product_inbound')}</h1>
      </header>

      <div className="space-y-6">
        <Card className="p-6 bg-white dark:bg-slate-900 border-none shadow-xl rounded-[32px] space-y-6">
          <div className="space-y-3">
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest px-2">
              {t('barcode_scan')}
            </label>
            <div className="flex gap-2">
              <Input
                placeholder={t('scan_or_type')}
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                className="h-16 rounded-2xl text-lg font-bold bg-slate-50 dark:bg-white/5 border-none"
              />
              <Button
                onClick={() => setIsScanning(true)}
                className="h-16 w-16 shrink-0 bg-green-100 hover:bg-green-200 dark:bg-green-900/30 dark:hover:bg-green-900/50 text-green-600 rounded-2xl p-0"
              >
                <ScanBarcode className="w-8 h-8" />
              </Button>
            </div>
          </div>
        </Card>

        {product ? (
          <Card className="p-6 bg-gradient-to-b from-green-50 to-white dark:from-slate-800 dark:to-slate-900 border-none shadow-xl rounded-[32px] animate-in zoom-in-95 duration-200">
            <div className="text-center space-y-2 mb-6">
              <div className="text-sm font-bold text-green-500 uppercase tracking-widest">{t('found_product')}</div>
              <div className="text-2xl font-black dark:text-white">{product.name}</div>
            </div>

            <div className="space-y-4">
              <div className="text-xs font-black text-slate-400 uppercase tracking-widest px-2">{t('quantity')}</div>
              <div className="flex items-center justify-between bg-slate-100 dark:bg-slate-950 p-2 rounded-[24px]">
                <Button
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  variant="ghost"
                  className="w-16 h-16 rounded-2xl hover:bg-white dark:hover:bg-slate-800 shrink-0"
                >
                  <Minus className="w-8 h-8" />
                </Button>
                <div className="text-4xl font-black text-green-600">+{quantity}</div>
                <Button
                  onClick={() => setQuantity(quantity + 1)}
                  variant="ghost"
                  className="w-16 h-16 rounded-2xl hover:bg-white dark:hover:bg-slate-800 shrink-0 text-green-600"
                >
                  <Plus className="w-8 h-8" />
                </Button>
              </div>

              <Button
                onClick={handleInbound}
                disabled={isSubmitting}
                className="w-full h-16 bg-green-600 hover:bg-green-700 text-white rounded-[24px] font-black text-xl shadow-xl shadow-green-500/30 flex items-center justify-center gap-3 mt-4"
              >
                <ArrowDownToLine className="w-6 h-6" />
                {isSubmitting ? t('processing') : t('inbound_complete')}
              </Button>
            </div>
          </Card>
        ) : barcode.length >= 3 ? (
          <div className="text-center py-10">
            <div className="text-slate-400 font-bold">{t('product_not_found')}</div>
          </div>
        ) : null}
      </div>

      {isScanning && (
        <BarcodeScanner
          onScan={handleScan}
          onClose={() => setIsScanning(false)}
        />
      )}
    </div>
  );
}
