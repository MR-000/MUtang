import * as React from "react"
import { 
  Medal, 
  Gem, 
  Diamond as DiamondIcon, 
  CircleDot, 
  Crown,
  Heart,
  Sparkles,
  X,
  ShieldCheck,
  Coins,
  CalendarCheck,
  Zap,
  AlertTriangle
} from "lucide-react"
import { cn } from "@/lib/utils"
import { AnimatePresence, motion } from "framer-motion"
import { Button } from "@/components/ui/button"

export type TierType = 'Iron' | 'Bronze' | 'Silver' | 'Gold' | 'Platinum' | 'Emerald' | 'Diamond' | 'Master';

interface TierBadgeProps {
  tier: string | TierType;
  className?: string;
  showText?: boolean;
  size?: 'sm' | 'md' | 'lg';
  clickable?: boolean;
}

const tierConfig: Record<TierType, { 
  icon: React.ElementType, 
  color: string, 
  bgColor: string,
  label: string 
}> = {
  Iron: { 
    icon: Medal, 
    color: "text-zinc-500", 
    bgColor: "from-zinc-50 to-zinc-200 dark:from-zinc-900/30 dark:to-zinc-800/20",
    label: "IRON"
  },
  Bronze: { 
    icon: Medal, 
    color: "text-orange-700", 
    bgColor: "from-orange-50 to-orange-100 dark:from-orange-950/30 dark:to-orange-900/20",
    label: "BRONZE"
  },
  Silver: { 
    icon: Medal, 
    color: "text-slate-400", 
    bgColor: "from-slate-50 to-slate-200 dark:from-slate-800/30 dark:to-slate-700/20",
    label: "SILVER"
  },
  Gold: { 
    icon: Medal, 
    color: "text-amber-500", 
    bgColor: "from-amber-50 to-amber-200 dark:from-amber-900/30 dark:to-amber-800/20",
    label: "GOLD"
  },
  Platinum: { 
    icon: Sparkles, 
    color: "text-cyan-500", 
    bgColor: "from-cyan-50 to-cyan-100 dark:from-cyan-900/30 dark:to-cyan-800/20",
    label: "PLATINUM"
  },
  Emerald: { 
    icon: CircleDot, 
    color: "text-emerald-500", 
    bgColor: "from-emerald-50 to-emerald-100 dark:from-emerald-900/30 dark:to-emerald-800/20",
    label: "EMERALD"
  },
  Diamond: { 
    icon: DiamondIcon, 
    color: "text-blue-500", 
    bgColor: "from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/20",
    label: "DIAMOND"
  },
  Master: { 
    icon: Heart, 
    color: "text-purple-600", 
    bgColor: "from-purple-50 to-purple-100 dark:from-purple-900/30 dark:to-purple-800/20",
    label: "MASTER"
  }
};

export function TierBadge({ tier, className, showText = false, size = 'md', clickable = true }: TierBadgeProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const config = tierConfig[tier as TierType] || tierConfig.Bronze;
  const Icon = config.icon;

  const sizeClasses = {
    sm: "p-1.5 gap-1.5 text-[10px]",
    md: "p-2 gap-2 text-xs",
    lg: "p-3 gap-3 text-sm"
  };

  const iconSizes = {
    sm: "w-3.5 h-3.5",
    md: "w-5 h-5",
    lg: "w-8 h-8"
  };

  return (
    <>
      <div 
        onClick={() => clickable && setIsOpen(true)}
        className={cn(
          "inline-flex items-center rounded-2xl bg-gradient-to-br font-black tracking-tighter shadow-sm select-none",
          config.bgColor,
          sizeClasses[size],
          clickable && "cursor-pointer hover:scale-105 active:scale-95 transition-all duration-300",
          className
        )}
      >
        <div className={cn(
          "flex items-center justify-center rounded-xl bg-white/80 dark:bg-slate-900/80 shadow-inner",
          size === 'lg' ? "p-2" : "p-1"
        )}>
          <Icon className={cn(config.color, iconSizes[size], "drop-shadow-sm")} />
        </div>
        {showText && (
          <span className={cn(config.color, "uppercase drop-shadow-sm")}>
            {config.label}
          </span>
        )}
      </div>

      {/* 신용 점수 설명 팝업 모달 */}
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* 배경 오버레이 */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />

            {/* 모달 본체 */}
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: "spring", duration: 0.5 }}
              className="relative w-full max-w-md bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-white/10 p-6 rounded-[36px] shadow-2xl overflow-y-auto max-h-[85vh] z-10"
            >
              {/* 헤더 및 닫기 버튼 */}
              <div className="flex items-center justify-between mb-6 pb-2 border-b border-slate-100 dark:border-white/5">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-2xl bg-blue-600/10 flex items-center justify-center text-blue-600">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-black tracking-tight text-slate-800 dark:text-white">MUtang 신용 등급 정책</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Credit score guide</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsOpen(false)}
                  className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 flex items-center justify-center text-slate-500 dark:text-slate-400 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* 등급표 구간 목록 */}
              <div className="space-y-4 mb-8">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-400 px-1">신용 등급 구간 안내</h4>
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-3 bg-zinc-50 dark:bg-zinc-950/40 rounded-2xl flex items-center justify-between border border-zinc-100 dark:border-zinc-900">
                    <span className="text-[11px] font-black text-zinc-500">Iron 등급</span>
                    <span className="text-[11px] font-bold text-slate-400">0 - 99점</span>
                  </div>
                  <div className="p-3 bg-orange-50/50 dark:bg-orange-950/20 rounded-2xl flex items-center justify-between border border-orange-100/40 dark:border-orange-950/10">
                    <span className="text-[11px] font-black text-orange-700">Bronze 등급 (시작)</span>
                    <span className="text-[11px] font-bold text-slate-400">100 - 299점</span>
                  </div>
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/30 rounded-2xl flex items-center justify-between border border-slate-100 dark:border-slate-800/20">
                    <span className="text-[11px] font-black text-slate-400">Silver 등급</span>
                    <span className="text-[11px] font-bold text-slate-400">300 - 599점</span>
                  </div>
                  <div className="p-3 bg-amber-50/50 dark:bg-amber-950/20 rounded-2xl flex items-center justify-between border border-amber-100/40 dark:border-amber-950/10">
                    <span className="text-[11px] font-black text-amber-500">Gold 등급</span>
                    <span className="text-[11px] font-bold text-slate-400">600 - 799점</span>
                  </div>
                  <div className="p-3 bg-cyan-50/50 dark:bg-cyan-950/20 rounded-2xl flex items-center justify-between border border-cyan-100/40 dark:border-cyan-950/10">
                    <span className="text-[11px] font-black text-cyan-500">Platinum 등급</span>
                    <span className="text-[11px] font-bold text-slate-400">800 - 949점</span>
                  </div>
                  <div className="p-3 bg-blue-50/50 dark:bg-blue-950/20 rounded-2xl flex items-center justify-between border border-blue-100/40 dark:border-blue-950/10">
                    <span className="text-[11px] font-black text-blue-500">Diamond 등급 (최고)</span>
                    <span className="text-[11px] font-bold text-slate-400">950 - 1000점</span>
                  </div>
                </div>
                <p className="text-[10px] text-slate-400 font-bold px-1 text-center">
                  가입 시 기본 200점(Bronze 등급)에서 안전하게 시작합니다.
                </p>
              </div>

              {/* 신용 평가 산정 공식 */}
              <div className="space-y-4 mb-6">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-400 px-1">신용점수 산정 공식</h4>
                <div className="space-y-3">
                  
                  {/* 상환 점수 */}
                  <div className="flex gap-3 p-4 bg-slate-50 dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-white/5">
                    <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
                      <Coins className="w-4.5 h-4.5" />
                    </div>
                    <div className="flex-1">
                      <h5 className="text-[11px] font-black text-slate-800 dark:text-white">기본 상환 점수</h5>
                      <p className="text-[10px] text-slate-400 font-bold leading-relaxed mt-0.5">
                        상환이 완료된 금액을 기준으로 1000페소당 +1점을 자동으로 가산합니다. (예: 5000페소 상환 시 +5점, 최소 1점 보장)
                      </p>
                    </div>
                  </div>

                  {/* 성실 상환 */}
                  <div className="flex gap-3 p-4 bg-slate-50 dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-white/5">
                    <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
                      <CalendarCheck className="w-4.5 h-4.5" />
                    </div>
                    <div className="flex-1">
                      <h5 className="text-[11px] font-black text-slate-800 dark:text-white">성실 상환 보너스</h5>
                      <p className="text-[10px] text-slate-400 font-bold leading-relaxed mt-0.5">
                        만기일 이내에 밀리지 않고 정시에 갚았을 경우 성실 보너스로 +5점을 추가 가산합니다.
                      </p>
                    </div>
                  </div>

                  {/* 신속 상환 */}
                  <div className="flex gap-3 p-4 bg-slate-50 dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-white/5">
                    <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
                      <Zap className="w-4.5 h-4.5" />
                    </div>
                    <div className="flex-1">
                      <h5 className="text-[11px] font-black text-slate-800 dark:text-white">신속 상환 보너스</h5>
                      <p className="text-[10px] text-slate-400 font-bold leading-relaxed mt-0.5">
                        만기일보다 3일 이상 일찍 상환한 모범 회원에게는 보너스로 +10점을 추가 지급하여 빠른 자금 순환을 장려합니다.
                      </p>
                    </div>
                  </div>

                  {/* 연체 페널티 */}
                  <div className="flex gap-3 p-4 bg-red-500/5 dark:bg-red-500/10 rounded-3xl border border-red-500/10">
                    <div className="w-8 h-8 rounded-xl bg-red-500/10 text-red-500 flex items-center justify-center shrink-0">
                      <AlertTriangle className="w-4.5 h-4.5" />
                    </div>
                    <div className="flex-1">
                      <h5 className="text-[11px] font-black text-red-500">연체 페널티 차감</h5>
                      <p className="text-[10px] text-red-400 font-bold leading-relaxed mt-0.5">
                        만기일을 넘긴 경우, 연체된 일수 1일당 -2점씩 누적 페널티를 차감하여 엄격하게 신용도를 관리합니다.
                      </p>
                    </div>
                  </div>

                  {/* 연체 즉각 감점 */}
                  <div className="flex gap-3 p-4 bg-red-500/5 dark:bg-red-500/10 rounded-3xl border border-red-500/10">
                    <div className="w-8 h-8 rounded-xl bg-red-500/10 text-red-500 flex items-center justify-center shrink-0">
                      <AlertTriangle className="w-4.5 h-4.5" />
                    </div>
                    <div className="flex-1">
                      <h5 className="text-[11px] font-black text-red-500">연체 발생 즉각 감점</h5>
                      <p className="text-[10px] text-red-400 font-bold leading-relaxed mt-0.5">
                        만기일이 경과하여 대출 상태가 overdue로 전환되는 즉시 경고성으로 신용점수 -10점을 즉각 차감하고 경고 알림을 발송합니다.
                      </p>
                    </div>
                  </div>

                </div>
              </div>

              {/* 닫기 버튼 */}
              <Button 
                onClick={() => setIsOpen(false)}
                className="w-full h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-[20px] font-black"
              >
                가이드 확인 완료
              </Button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
