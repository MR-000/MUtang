"use client";

import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { getTranslation } from '@/lib/i18n';
import { initDebugTools } from '@/lib/debug-tools';

type Language = 'en' | 'tl' | 'ko' | 'zh' | 'ja';
type Theme = 'light' | 'dark';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: any | null;
  signOut: () => Promise<void>;
  loading: boolean;
  language: Language;
  setLanguage: (lang: Language) => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  t: (key: string) => string;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [language, setLanguageState] = useState<Language>('en');
  const [theme, setThemeState] = useState<Theme>('dark');

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    setProfile(data);
  };

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id);
  };

  useEffect(() => {
    // Load settings from localStorage
    initDebugTools();
    const savedLang = localStorage.getItem('utang_lang') as Language;
    const savedTheme = localStorage.getItem('utang_theme') as Theme;
    if (savedLang) {
      setLanguageState(savedLang);
    } else {
      // 첫 접속 시 브라우저 기본 로케일 감지 및 5대 지원 언어 매핑
      const browserLang = (typeof navigator !== 'undefined' && navigator.language) 
        ? navigator.language.split('-')[0].toLowerCase() 
        : 'en';
      const supportedLangs: Language[] = ['en', 'tl', 'ko', 'zh', 'ja'];
      const defaultLang = supportedLangs.includes(browserLang as Language) ? (browserLang as Language) : 'en';
      setLanguageState(defaultLang);
      localStorage.setItem('utang_lang', defaultLang);
    }
    if (savedTheme) setThemeState(savedTheme);

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) fetchProfile(session.user.id);
        else setProfile(null);
        setLoading(false);
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('utang_lang', lang);
  };

  const setTheme = (theme: Theme) => {
    setThemeState(theme);
    localStorage.setItem('utang_theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  useEffect(() => {
    // Initial theme sync
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  useEffect(() => {
    // lang 속성 동기화 - SSR lang="en"과 실제 사용자 언어 일치시킴
    if (language) {
      document.documentElement.lang = language;
    }
  }, [language]);

  const t = (key: string) => getTranslation(key, language);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ 
      session, user, profile, signOut, loading, 
      language, setLanguage, theme, setTheme, t, refreshProfile 
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
