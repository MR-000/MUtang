import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-slate-900 text-white hover:bg-slate-900/80 dark:bg-white dark:text-slate-950 dark:hover:bg-white/80",
        secondary:
          "border-transparent bg-slate-100 text-slate-900 hover:bg-slate-100/80 dark:bg-white/10 dark:text-slate-50 dark:hover:bg-white/20",
        destructive:
          "border-transparent bg-red-500 text-white hover:bg-red-500/80 dark:bg-red-900 dark:text-red-50 dark:hover:bg-red-900/80",
        outline: "text-slate-950 dark:text-slate-50 border-slate-200 dark:border-white/10",
        success: "border-transparent bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400",
        warning: "border-transparent bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
