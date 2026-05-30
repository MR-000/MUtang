"use client";

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { ShieldCheck, Phone, Mail, Globe, ArrowRight, Lock } from 'lucide-react';

export default function Login() {
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'phone' | 'otp' | 'admin_pass'>('phone');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const router = useRouter();

  const handleSendOtp = async (e: React.FormEvent, currentMode: 'login' | 'signup') => {
    e.preventDefault();
    
    // Admin ID Bypass Detection
    if (phoneNumber === 'tkdghksl0531@gmail.com') {
      setStep('admin_pass');
      toast.info('관리자 계정이 감지되었습니다. 비밀번호를 입력하세요.');
      return;
    }

    setLoading(true);
    setMode(currentMode);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        phone: phoneNumber,
      });

      if (error) throw error;
      toast.success('인증 번호가 발송되었습니다!');
      setStep('otp');
    } catch (error: any) {
      toast.error(error.message || '인증 번호 발송 실패');
    } finally {
      setLoading(false);
    }
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // For Admin, we use email/password login internally
      const { error } = await supabase.auth.signInWithPassword({
        email: 'tkdghksl0531@gmail.com',
        password: adminPassword,
      });

      if (error) throw error;
      toast.success('관리자 권한으로 로그인되었습니다.');
      router.push('/');
    } catch (error: any) {
      toast.error('관리자 인증 실패: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        phone: phoneNumber,
        token: otp,
        type: 'sms',
      });

      if (error) throw error;
      toast.success(mode === 'login' ? '환영합니다!' : '성공적으로 가입되었습니다!');
      router.push('/');
    } catch (error: any) {
      toast.error(error.message || '인증 번호가 올바르지 않습니다');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center overflow-hidden font-sans">
      {/* Background with Premium Gradient & Mesh */}
      <div className="absolute inset-0 bg-[#0A0F1E]">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/20 blur-[120px] rounded-full"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-amber-500/10 blur-[120px] rounded-full"></div>
      </div>

      <div className="relative w-full max-w-md px-6 py-12">
        {/* Glassmorphism Card */}
        <div className="bg-white/5 backdrop-blur-2xl rounded-[40px] p-8 shadow-2xl border border-white/10 ring-1 ring-white/10">
          
          <div className="text-center mb-10">
            {/* Logo Icon */}
            <div className="relative inline-block mb-6">
              <div className="absolute inset-0 bg-amber-500 blur-2xl opacity-20 animate-pulse"></div>
              <div className="relative bg-gradient-to-br from-amber-400 to-amber-600 w-20 h-20 rounded-3xl flex items-center justify-center shadow-2xl transform rotate-3">
                <ShieldCheck className="text-white w-12 h-12" />
              </div>
            </div>
            
            <h1 className="text-4xl font-black tracking-tighter text-white mb-2 italic">LENDER</h1>
            <p className="text-slate-400 font-medium tracking-tight">Trust-based Agreement Marketplace</p>
          </div>

          {step === 'phone' ? (
            <div className="space-y-8">
              <form onSubmit={(e) => handleSendOtp(e, 'login')} className="space-y-6">
                <div className="space-y-3">
                  <Label htmlFor="phone" className="text-slate-300 text-xs font-bold uppercase tracking-widest ml-1">Identity / Phone</Label>
                  <div className="relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">
                      <Phone className="w-5 h-5" />
                    </div>
                    <Input
                      id="phone"
                      type="text"
                      placeholder="Phone number or Admin ID"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      className="bg-white/5 border-white/10 text-white placeholder:text-slate-600 h-14 pl-12 rounded-2xl focus:ring-amber-500/50 focus:border-amber-500 transition-all text-lg"
                      required
                    />
                  </div>
                </div>

                <div className="grid gap-4">
                  <Button 
                    type="submit" 
                    className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 rounded-2xl h-16 font-black text-xl shadow-xl shadow-amber-900/20 group transition-all"
                    disabled={loading}
                  >
                    {loading && mode === 'login' ? 'Verifying...' : 'CONTINUE'}
                    <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </Button>

                  <div className="relative flex items-center py-4">
                    <div className="flex-grow border-t border-white/5"></div>
                    <span className="flex-shrink mx-4 text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em]">Partner Portals</span>
                    <div className="flex-grow border-t border-white/5"></div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <Button 
                      variant="outline" 
                      className="h-14 rounded-2xl border-white/10 bg-white/5 text-white hover:bg-white/10 transition-colors gap-2 font-bold"
                      onClick={() => toast.info('Google 연동 준비 중')}
                    >
                      <Globe className="w-5 h-5 text-blue-400" />
                      Google
                    </Button>
                    <Button 
                      variant="outline" 
                      className="h-14 rounded-2xl border-white/10 bg-white/5 text-white hover:bg-white/10 transition-colors gap-2 font-bold"
                      onClick={() => toast.info('Facebook 연동 준비 중')}
                    >
                      <Mail className="w-5 h-5 text-indigo-400" />
                      Email
                    </Button>
                  </div>
                </div>

                <div className="text-center mt-8">
                  <button 
                    type="button"
                    onClick={(e) => handleSendOtp(e, 'signup')}
                    className="text-amber-500 hover:text-amber-400 text-sm font-bold underline underline-offset-8 decoration-amber-500/30 transition-all"
                  >
                    Create a new Trust Identity
                  </button>
                </div>
              </form>
            </div>
          ) : step === 'admin_pass' ? (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="text-center space-y-2">
                <h3 className="text-2xl font-black text-white flex items-center justify-center gap-2">
                  <Lock className="w-6 h-6 text-amber-500" />
                  Admin Access
                </h3>
                <p className="text-slate-400 text-sm">Enter the administrative password for <br/><span className="text-white font-bold">{phoneNumber}</span></p>
              </div>

              <form onSubmit={handleAdminLogin} className="space-y-6">
                <div className="space-y-3">
                  <Label htmlFor="pass" className="text-slate-300 text-xs font-bold uppercase tracking-widest ml-1">Password</Label>
                  <Input
                    id="pass"
                    type="password"
                    placeholder="••••••••"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    className="bg-white/5 border-white/10 text-white placeholder:text-slate-600 h-14 rounded-2xl focus:ring-amber-500/50 focus:border-amber-500 transition-all text-lg"
                    required
                  />
                </div>

                <Button 
                  type="submit" 
                  className="w-full bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 rounded-2xl h-16 font-black text-xl shadow-xl shadow-amber-900/20"
                  disabled={loading}
                >
                  {loading ? 'AUTHENTICATING...' : 'ADMIN LOGIN'}
                </Button>

                <Button 
                  type="button" 
                  variant="ghost" 
                  className="w-full text-slate-500 hover:text-white font-bold h-12 rounded-xl transition-colors"
                  onClick={() => setStep('phone')}
                  disabled={loading}
                >
                  Back to Phone Login
                </Button>
              </form>
            </div>
          ) : (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="text-center space-y-2">
                <h3 className="text-2xl font-black text-white">Security Check</h3>
                <p className="text-slate-400 text-sm">Enter the 6-digit verification code sent to <br/><span className="text-white font-bold">{phoneNumber}</span></p>
              </div>

              <form onSubmit={handleVerifyOtp} className="space-y-6">
                <div className="flex justify-center">
                  <Input
                    id="otp"
                    type="text"
                    placeholder="000 000"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    className="bg-white/5 border-white/10 text-white placeholder:text-slate-600 h-20 rounded-3xl text-center text-4xl font-black tracking-[0.3em] focus:ring-amber-500/50 focus:border-amber-500 transition-all"
                    maxLength={6}
                    required
                  />
                </div>

                <Button 
                  type="submit" 
                  className="w-full bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 rounded-2xl h-16 font-black text-xl shadow-xl shadow-amber-900/20"
                  disabled={loading}
                >
                  {loading ? 'AUTHENTICATING...' : 'VERIFY & ENTER'}
                </Button>

                <Button 
                  type="button" 
                  variant="ghost" 
                  className="w-full text-slate-500 hover:text-white font-bold h-12 rounded-xl transition-colors"
                  onClick={() => setStep('phone')}
                  disabled={loading}
                >
                  Edit Phone Number
                </Button>
              </form>
            </div>
          )}
        </div>

        {/* Footer Disclaimer */}
        <div className="mt-12 text-center space-y-4 px-4">
          <p className="text-[10px] text-slate-500 leading-relaxed font-medium uppercase tracking-wider">
            This platform provides record-keeping tools for trust-based agreements. <br/>
            Transactions are between users. Repayment is not guaranteed by Lender.
          </p>
        </div>
      </div>
    </div>
  );
}
