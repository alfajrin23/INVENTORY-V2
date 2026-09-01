import { AlertCircle, PackageSearch, RefreshCcw } from 'lucide-react'
import type { ReactNode } from 'react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export function LoadingGrid({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('grid gap-4 md:grid-cols-2 xl:grid-cols-3', className)}>
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className="h-32 rounded-xl bg-white/10" />
      ))}
    </div>
  )
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className="h-12 rounded-lg bg-white/10" />
      ))}
    </div>
  )
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="flex min-h-60 flex-col items-center justify-center rounded-xl border border-dashed border-white/14 bg-white/[0.045] p-8 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-cyan-400/12 text-cyan-200">
        <PackageSearch className="size-7" />
      </div>
      <h3 className="mt-4 text-base font-semibold text-white">{title}</h3>
      <p className="mt-2 max-w-md text-sm text-white/58">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Alert className="border-rose-300/25 bg-rose-500/10 text-rose-50">
      <AlertCircle className="size-4" />
      <AlertTitle>Data gagal dimuat</AlertTitle>
      <AlertDescription className="mt-2 flex flex-col gap-3 text-rose-100/80 sm:flex-row sm:items-center sm:justify-between">
        <span>{message}</span>
        <Button type="button" variant="outline" size="sm" onClick={onRetry} className="w-fit border-rose-200/30">
          <RefreshCcw className="size-4" />
          Coba lagi
        </Button>
      </AlertDescription>
    </Alert>
  )
}
