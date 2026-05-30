"use client";

import { useEffect, useState } from 'react';
import { CreditCard, Receipt } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';

interface Payment {
  id: string;
  amount: number;
  method: string;
  reference_no: string | null;
  paid_at: string;
  debts?: {
    customers?: { name: string };
  } | any; // Fix for supabase typing
}

export default function Payments() {
  const { user, t } = useAuth();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchPayments();
    }
  }, [user]);

  const fetchPayments = async () => {
    try {
      const { data, error } = await supabase
        .from('payments')
        .select(`
          *,
          debts (
            customers (name)
          )
        `)
        .eq('user_id', user?.id)
        .order('paid_at', { ascending: false });

      if (error) throw error;
      setPayments(data || []);
    } catch (error: any) {
      console.error('Error fetching payments:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 space-y-6">
      <header>
        <h1 className="text-xl font-bold text-slate-900">{t('payments')}</h1>
        <p className="text-sm text-slate-500 font-medium">{t('payments_subtitle')}</p>
      </header>

      <div className="space-y-3 pb-8">
        {loading ? (
          <div className="text-center text-sm text-slate-500 py-8 animate-pulse">{t('loading')}</div>
        ) : payments.length > 0 ? (
          payments.map((payment) => (
            <div key={payment.id} className="bg-white border border-slate-100 p-4 rounded-2xl flex justify-between items-center shadow-sm">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${payment.method === 'gcash' ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600'}`}>
                  <Receipt className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">
                    {payment.debts?.customers?.name || t('unknown_customer')}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium capitalize mt-0.5">
                    {payment.method} {payment.reference_no && `• Ref: ${payment.reference_no}`}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5 font-medium">
                    {format(new Date(payment.paid_at), 'MMM d, yyyy h:mm a')}
                  </p>
                </div>
              </div>
              <div className="font-black text-green-600">
                +₱{Number(payment.amount).toFixed(2)}
              </div>
            </div>
          ))
        ) : (
          <div className="bg-white border border-slate-100 p-8 rounded-2xl text-center text-slate-500 flex flex-col items-center">
            <CreditCard className="w-12 h-12 mb-3 text-slate-300" />
            <p className="font-bold text-slate-900">{t('no_payments')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
