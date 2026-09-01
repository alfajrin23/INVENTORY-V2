import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, Info, XCircle } from 'lucide-react'

import { cn } from '@/lib/utils'

type ToastType = 'success' | 'error' | 'info'

type Toast = {
  id: string
  message: string
  type: ToastType
}

type ToastContextValue = {
  showToast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

function iconFor(type: ToastType) {
  if (type === 'success') {
    return <CheckCircle2 className="size-4 text-emerald-300" />
  }

  if (type === 'error') {
    return <XCircle className="size-4 text-rose-300" />
  }

  return <Info className="size-4 text-cyan-300" />
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`

    setToasts((current) => [...current, { id, message, type }])
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id))
    }, 3000)
  }, [])

  const value = useMemo(() => ({ showToast }), [showToast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[80] flex flex-col items-center gap-2 px-4 lg:bottom-6">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 20, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.96 }}
              className={cn(
                'flex items-center gap-2 rounded-full border px-4 py-2 text-sm shadow-2xl backdrop-blur-2xl',
                toast.type === 'success' && 'border-emerald-300/30 bg-emerald-500/15 text-emerald-50',
                toast.type === 'error' && 'border-rose-300/30 bg-rose-500/15 text-rose-50',
                toast.type === 'info' && 'border-cyan-300/30 bg-cyan-500/15 text-cyan-50',
              )}
            >
              {iconFor(toast.type)}
              <span>{toast.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const value = useContext(ToastContext)
  if (!value) {
    throw new Error('useToast harus dipakai di dalam ToastProvider')
  }

  return value
}
