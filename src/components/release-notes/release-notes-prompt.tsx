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
      <DialogContent className="max-h-[90dvh] overflow-y-auto border-white/12 bg-[#121827]/98 text-white sm:max-w-lg">
        <DialogHeader>
          <div className="mb-2 flex size-12 items-center justify-center rounded-2xl bg-violet-300/14 text-violet-100" aria-hidden="true">
            <Sparkles className="size-6" />
          </div>
          <DialogTitle className="text-2xl text-white">🎉 Yang Baru di Inventory V2</DialogTitle>
          <DialogDescription className="text-base text-white/62">Versi {version || 'terbaru'} · tampil satu kali di perangkat ini.</DialogDescription>
        </DialogHeader>

        <div className="space-y-2" role="list" aria-label="Fitur baru versi ini">
          {(note?.summary ?? []).map(item => (
            <div key={item} role="listitem" className="flex gap-3 rounded-xl border border-white/10 bg-white/[0.045] p-3">
              <span className="mt-1 size-2 shrink-0 rounded-full bg-cyan-300" aria-hidden="true" />
              <p className="text-sm leading-6 text-white/78">{item}</p>
            </div>
          ))}
        </div>

        <DialogFooter className="gap-2 sm:grid sm:grid-cols-2">
          <Button type="button" variant="outline" className="min-h-11 border-white/15" onClick={dismiss}>
            Mengerti
          </Button>
          <Button type="button" className="min-h-11" onClick={seeAll}>
            Lihat Semua Update
            <ArrowRight className="size-4" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
