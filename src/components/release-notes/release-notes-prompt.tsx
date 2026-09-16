import { ArrowRight, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  hasSeenReleaseNotes,
  markReleaseNotesSeen,
  releaseNoteForCurrentVersion,
  type ReleaseNote,
} from '@/lib/release-notes'
import { routes } from '@/lib/navigation'

const INITIAL_OPEN_DELAY_MS = 850
const MODAL_RETRY_DELAY_MS = 400

function hasAnotherOpenDialog() {
  return Boolean(document.querySelector('[data-slot="dialog-content"][data-state="open"]'))
}

export function ReleaseNotesPrompt() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [version, setVersion] = useState('')
  const [note, setNote] = useState<ReleaseNote | null>(null)
  const openTimer = useRef<number | null>(null)

  useEffect(() => {
    let cancelled = false

    const clearTimer = () => {
      if (openTimer.current !== null) window.clearTimeout(openTimer.current)
      openTimer.current = null
    }

    const tryOpen = () => {
      if (cancelled) return
      if (hasAnotherOpenDialog()) {
        openTimer.current = window.setTimeout(tryOpen, MODAL_RETRY_DELAY_MS)
        return
      }
      setOpen(true)
      openTimer.current = null
    }

    void releaseNoteForCurrentVersion().then(result => {
      if (cancelled || hasSeenReleaseNotes(result.version)) return
      setVersion(result.version)
      setNote(result.note)
      openTimer.current = window.setTimeout(tryOpen, INITIAL_OPEN_DELAY_MS)
    })

    return () => {
      cancelled = true
      clearTimer()
    }
  }, [])

  const dismiss = () => {
    if (version) markReleaseNotesSeen(version)
    setOpen(false)
  }

  const seeAll = () => {
    dismiss()
    navigate(routes.updates)
  }

  return (
    <Dialog open={open} onOpenChange={next => { if (!next) dismiss(); else setOpen(true) }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto border-slate-200 bg-white text-slate-950 shadow-2xl dark:border-white/12 dark:bg-[#121827]/98 dark:text-white sm:max-w-lg">
        <DialogHeader>
          <div className="mb-2 flex size-12 items-center justify-center rounded-2xl bg-violet-100 text-violet-700 dark:bg-violet-300/14 dark:text-violet-200" aria-hidden="true">
            <Sparkles className="size-6" />
          </div>
          <DialogTitle className="text-2xl text-slate-950 dark:text-white">🎉 Yang Baru di Inventory V2</DialogTitle>
          <DialogDescription className="text-base text-slate-600 dark:text-slate-300">
            Versi {version || 'terbaru'} · tampil satu kali di perangkat ini.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2" role="list" aria-label="Fitur baru versi ini">
          {(note?.summary ?? []).map(item => (
            <div key={item} role="listitem" className="flex gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/[0.045]">
              <span className="mt-1 size-2 shrink-0 rounded-full bg-cyan-700 dark:bg-cyan-300" aria-hidden="true" />
              <p className="text-sm leading-6 text-slate-700 dark:text-slate-200">{item}</p>
            </div>
          ))}
        </div>

        <DialogFooter className="gap-2 sm:grid sm:grid-cols-2">
          <Button
            type="button"
            variant="outline"
            className="min-h-11 border-slate-300 bg-white text-slate-900 hover:bg-slate-100 hover:text-slate-950 dark:border-white/20 dark:bg-transparent dark:text-white dark:hover:bg-white/10 dark:hover:text-white"
            onClick={dismiss}
          >
            Mengerti
          </Button>
          <Button
            type="button"
            className="min-h-11 bg-cyan-700 text-white hover:bg-cyan-800 dark:bg-cyan-300 dark:text-slate-950 dark:hover:bg-cyan-200"
            onClick={seeAll}
          >
            Lihat Semua Update
            <ArrowRight className="size-4" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
