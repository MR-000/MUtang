"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, ShieldAlert } from "lucide-react";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile, loading } = useAuth();
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    if (!loading) {
      if (!profile || !profile.is_admin) {
        toast.error("관리자만 접근할 수 있는 페이지입니다.");
        router.replace("/");
      } else {
        setAuthorized(true);
      }
    }
  }, [profile, loading, router]);

  if (loading || !authorized) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-950 p-4 space-y-4">
        <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
        <p className="text-slate-500 dark:text-slate-400 font-bold text-sm">
          관리자 권한을 확인하고 있습니다
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-24">
      {children}
    </div>
  );
}
