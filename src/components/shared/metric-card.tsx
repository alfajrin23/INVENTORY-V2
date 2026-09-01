import { motion } from 'framer-motion'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import type { ReactNode } from 'react'

import { GlassPanel } from '@/components/shared/glass-panel'
import { cn } from '@/lib/utils'

type MetricCardProps = {
  label: string
  value: string
  detail?: string
  trend?: number
  icon: ReactNode
  accent?: 'cyan' | 'emerald' | 'amber' | 'rose' | 'violet'
}

const accents = {
  cyan: 'from-cyan-300/28 to-sky-500/10 text-cyan-100',
  emerald: 'from-emerald-300/28 to-teal-500/10 text-emerald-100',
  amber: 'from-amber-300/30 to-orange-500/10 text-amber-100',
  rose: 'from-rose-300/28 to-red-500/10 text-rose-100',
  violet: 'from-violet-300/28 to-fuchsia-500/10 text-violet-100',
}

export function MetricCard({ label, value, detail, trend, icon, accent = 'cyan' }: MetricCardProps) {
  const positive = (trend ?? 0) >= 0

  return (
    <GlassPanel
      glow={accent}
      className="group relative min-h-36 overflow-hidden p-5"
      whileHover={{ y: -4, rotateX: 1.5, rotateY: -1.5 }}
      whileTap={{ scale: 0.98 }}
      style={{ transformPerspective: 1000 }}
    >
      <div
        className={cn(
          'absolute inset-x-0 top-0 h-1 bg-gradient-to-r opacity-80',
          accent === 'cyan' && 'from-cyan-300 via-sky-400 to-blue-500',
          accent === 'emerald' && 'from-emerald-300 via-teal-400 to-cyan-500',
          accent === 'amber' && 'from-amber-300 via-orange-400 to-rose-400',
          accent === 'rose' && 'from-rose-300 via-red-400 to-orange-400',
          accent === 'violet' && 'from-violet-300 via-fuchsia-400 to-cyan-400',
        )}
      />
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase text-white/48">{label}</p>
          <p className="mt-3 font-mono text-2xl font-semibold text-white sm:text-3xl">{value}</p>
          {detail ? <p className="mt-2 text-sm text-white/58">{detail}</p> : null}
        </div>
        <motion.div
          className={cn(
            'flex size-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br shadow-inner',
            accents[accent],
          )}
          whileHover={{ rotate: 8, scale: 1.06 }}
        >
          {icon}
        </motion.div>
      </div>
      {typeof trend === 'number' ? (
        <div
          className={cn(
            'mt-4 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold',
            positive
              ? 'border-emerald-300/30 bg-emerald-400/10 text-emerald-200'
              : 'border-rose-300/30 bg-rose-400/10 text-rose-200',
          )}
        >
          {positive ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
          {Math.abs(trend).toFixed(1)}%
        </div>
      ) : null}
      <div className="pointer-events-none absolute -right-10 -bottom-14 size-36 rounded-full bg-white/8 blur-2xl transition group-hover:bg-white/12" />
    </GlassPanel>
  )
}
