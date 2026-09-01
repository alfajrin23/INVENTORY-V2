import { motion, type HTMLMotionProps } from 'framer-motion'

import { cn } from '@/lib/utils'

type GlassPanelProps = HTMLMotionProps<'div'> & {
  glow?: 'cyan' | 'emerald' | 'amber' | 'rose' | 'violet' | 'none'
}

const glowClasses = {
  cyan: 'shadow-[0_18px_60px_rgba(0,210,255,0.14)]',
  emerald: 'shadow-[0_18px_60px_rgba(0,201,167,0.14)]',
  amber: 'shadow-[0_18px_60px_rgba(255,171,64,0.14)]',
  rose: 'shadow-[0_18px_60px_rgba(255,107,107,0.14)]',
  violet: 'shadow-[0_18px_60px_rgba(123,47,247,0.14)]',
  none: '',
}

export function GlassPanel({ className, glow = 'cyan', children, ...props }: GlassPanelProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: 'easeOut' }}
      className={cn(
        'rounded-xl border border-white/10 bg-white/[0.075] text-card-foreground backdrop-blur-2xl',
        'ring-1 ring-white/5 transition duration-300 hover:border-white/18',
        glowClasses[glow],
        className,
      )}
      {...props}
    >
      {children}
    </motion.div>
  )
}
