"use client";

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, User, Phone, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  notes: string | null;
}

export default function Customers() {
  const { user, t } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // New Customer State
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (user) {
      fetchCustomers();
    }
  }, [user]);

  const fetchCustomers = async () => {
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCustomers(data || []);
    } catch (error: any) {
      console.error('Error fetching customers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    
    // Optimistic Update
    const tempId = Math.random().toString();
    const optimisticCustomer: Customer = {
      id: tempId,
      name: newName,
      phone: newPhone || null,
      notes: newNotes || null
    };
    
    setCustomers(prev => [optimisticCustomer, ...prev]);
    setIsOpen(false);
    setNewName('');
    setNewPhone('');
    setNewNotes('');
    setIsSubmitting(true);

    try {
      const { data, error } = await supabase
        .from('customers')
        .insert([{
          user_id: user?.id,
          name: optimisticCustomer.name,
          phone: optimisticCustomer.phone,
          notes: optimisticCustomer.notes
        }])
        .select()
        .single();

      if (error) throw error;
      
      // Replace optimistic customer with real data
      setCustomers(prev => prev.map(c => c.id === tempId ? data : c));
      toast.success(t('customer_added') || 'Customer added successfully');
    } catch (error: any) {
      // Rollback
      setCustomers(prev => prev.filter(c => c.id !== tempId));
      toast.error(error.message || t('error_occurred'));
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (c.phone && c.phone.includes(searchTerm))
  );

  return (
    <div className="p-4 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">{t('customers')}</h1>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger render={
            <Button size="sm" className="bg-slate-900 text-white dark:bg-white dark:text-slate-900 hover:bg-slate-800 rounded-xl font-bold h-9 px-4">
              <Plus className="w-4 h-4 mr-1.5" />
              {t('add')}
            </Button>
          } />
          <DialogContent className="max-w-md w-[95%] h-[80vh] rounded-[32px] dark:bg-slate-950 dark:border-white/5 px-6 pt-8 flex flex-col outline-none overflow-hidden">
            <DialogHeader className="pb-2 shrink-0">
              <DialogTitle className="text-2xl font-black text-slate-900 dark:text-white text-center">{t('add_customer')}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateCustomer} className="flex flex-col gap-5 mt-6 flex-1 overflow-y-auto">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-slate-600 dark:text-slate-400 font-bold">{t('customer_name')} *</Label>
                <Input 
                  id="name" 
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={t('customer_name_placeholder')}
                  className="rounded-2xl h-12 border-slate-200 dark:border-white/10 dark:bg-white/5 font-bold"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone" className="text-slate-600 dark:text-slate-400 font-bold">{t('phone_number')} ({t('optional')})</Label>
                <Input 
                  id="phone" 
                  type="tel"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="09123456789"
                  className="rounded-2xl h-12 border-slate-200 dark:border-white/10 dark:bg-white/5 font-bold"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes" className="text-slate-600 dark:text-slate-400 font-bold">{t('notes')} ({t('optional')})</Label>
                <Input 
                  id="notes" 
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder={t('customer_notes_placeholder')}
                  className="rounded-2xl h-12 border-slate-200 dark:border-white/10 dark:bg-white/5 font-bold"
                />
              </div>
              <Button type="submit" className="mt-auto w-full bg-blue-600 hover:bg-blue-700 text-white rounded-2xl h-14 font-bold text-lg mb-4 shadow-lg shadow-blue-200 dark:shadow-blue-900/20 active:scale-95 transition-all" disabled={isSubmitting}>
                {isSubmitting ? t('saving') : t('save_customer')}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </header>
      
      <div className="relative">
        <Search className="absolute left-3.5 top-3.5 h-5 w-5 text-slate-400" />
        <Input 
          placeholder={t('search_customers')} 
          className="pl-11 rounded-xl bg-white dark:bg-slate-900 border-slate-200 dark:border-white/10 h-12"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="space-y-3 pb-8">
        {loading ? (
          <div className="text-center text-sm text-slate-500 py-8 animate-pulse">{t('loading')}</div>
        ) : filteredCustomers.length > 0 ? (
          filteredCustomers.map(customer => (
            <div key={customer.id} className="bg-white border border-slate-100 p-4 rounded-2xl flex justify-between items-center shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600 font-bold text-lg">
                  {customer.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white">{customer.name}</h3>
                  {customer.phone && (
                    <div className="flex items-center text-xs text-slate-500 mt-0.5">
                      <Phone className="w-3 h-3 mr-1" />
                      {customer.phone}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="bg-white dark:bg-slate-900/50 border border-slate-100 dark:border-white/5 p-8 rounded-2xl text-center text-slate-500 flex flex-col items-center">
            <User className="w-12 h-12 mb-3 text-slate-300 dark:text-slate-700" />
            <p className="font-medium text-slate-900 dark:text-white">{searchTerm ? t('no_results') : t('no_customers')}</p>
            {!searchTerm && <p className="text-sm mt-1">{t('add_customer_hint')}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
