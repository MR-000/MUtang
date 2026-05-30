"use client";

import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { ArrowLeft, ScanBarcode, PackagePlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';

const BarcodeScanner = dynamic(() => import('@/components/ui/BarcodeScanner').then(mod => mod.BarcodeScanner), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center text-white font-black text-lg animate-pulse">
      카메라 스캐너 로딩 중...
    </div>
  )
});

export default function RegisterProductPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [isScanning, setIsScanning] = useState(false);
  const [barcode, setBarcode] = useState('');
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleScan = (code: string) => {
    setBarcode(code);
    setIsScanning(false);
    toast.success("바코드가 스캔되었습니다.");
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcode || !name || !price) return;

    setIsSubmitting(true);
    try {
      // Use existing 'inventory' table, repurposing 'sku' for barcode
      const { error } = await supabase
        .from('inventory')
        .insert([{
          user_id: user?.id,
          sku: barcode,
          name: name,
          price: parseFloat(price),
          stock: 0 // Will be managed via logs
        }]);

      if (error) {
        if (error.code === '23505') {
          toast.error("이미 등록된 바코드입니다.");
        } else {
          throw error;
        }
      } else {
        toast.success("상품이 등록되었습니다.");
        router.push('/inventory');
      }
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
        <h1 className="text-2xl font-black dark:text-white">신규 상품 등록</h1>
      </header>

      <form onSubmit={handleSave} className="space-y-6">
        <Card className="p-6 bg-white dark:bg-slate-900 border-none shadow-xl rounded-[32px] space-y-6">
          
          <div className="space-y-3">
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest px-2">
              바코드 (필수)
            </label>
            <div className="flex gap-2">
              <Input 
                placeholder="바코드 번호"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                required
                className="h-16 rounded-2xl text-lg font-bold bg-slate-50 dark:bg-white/5 border-none"
              />
              <Button 
                type="button"
                onClick={() => setIsScanning(true)}
                className="h-16 w-16 shrink-0 bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 text-blue-600 rounded-2xl p-0"
              >
                <ScanBarcode className="w-8 h-8" />
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest px-2">
              상품명
            </label>
            <Input 
              placeholder="예: 코카콜라 500ml"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="h-16 rounded-2xl text-lg font-bold bg-slate-50 dark:bg-white/5 border-none"
            />
          </div>

          <div className="space-y-3">
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest px-2">
              판매 가격 (₱)
            </label>
            <Input 
              type="number"
              placeholder="0.00"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              required
              className="h-16 rounded-2xl text-2xl font-black text-blue-600 bg-slate-50 dark:bg-white/5 border-none"
            />
          </div>

        </Card>

        <Button 
          type="submit" 
          disabled={isSubmitting || !barcode || !name || !price}
          className="w-full h-16 bg-purple-600 hover:bg-purple-700 text-white rounded-[24px] font-black text-xl shadow-xl shadow-purple-500/30 flex items-center gap-2"
        >
          <PackagePlus className="w-6 h-6" />
          {isSubmitting ? "저장 중..." : "상품 등록 완료"}
        </Button>
      </form>

      {isScanning && (
        <BarcodeScanner 
          onScan={handleScan}
          onClose={() => setIsScanning(false)}
        />
      )}
    </div>
  );
}
