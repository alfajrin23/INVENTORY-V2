import { Info, LogOut, ShieldCheck } from 'lucide-react'
import { useState } from 'react'

import { GlassPanel } from '@/components/shared/glass-panel'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { demoEnabled, supabase } from '@/lib/supabase'
import { Link } from 'react-router-dom'
import { routes } from '@/lib/navigation'
import { useToast } from '@/hooks/use-toast'

export function SettingsPage() {
  const [aboutOpen, setAboutOpen] = useState(false)
  const { showToast } = useToast()

  const handleExit = async () => {
    if (supabase && !demoEnabled) {
      try { const { error } = await supabase.auth.signOut(); if (error) throw error } catch { showToast('Gagal keluar. Coba lagi.', 'error') }
      return
    }
    const confirmed = window.confirm('Keluar dari aplikasi?')
    if (!confirmed) {
      return
    }

    showToast('Sesi ditutup', 'info')
    window.setTimeout(() => {
      window.close()
      window.location.href = 'about:blank'
    }, 350)
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-cyan-100/70">Preference</p>
        <h1 className="mt-1 text-3xl font-bold text-white lg:text-4xl">Pengaturan</h1>
      </div>

      <div className="flex flex-wrap gap-2"><Button asChild variant="outline"><Link to={routes.profile}>Profil & Toko</Link></Button><Button asChild variant="outline"><Link to={routes.history}>History Barang</Link></Button></div>
      <GlassPanel className="max-w-2xl divide-y divide-white/10 p-2" glow="cyan">
        <button
          type="button"
          onClick={() => setAboutOpen(true)}
          className="flex w-full items-center justify-between rounded-xl px-4 py-4 text-left transition hover:bg-white/[0.07]"
        >
          <span className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-cyan-300/12 text-cyan-100">
              <Info className="size-5" />
            </span>
            <span>
              <span className="block font-semibold text-white">Tentang</span>
              <span className="text-sm text-white/52">ABElektronik Web Stock</span>
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={handleExit}
          className="flex w-full items-center justify-between rounded-xl px-4 py-4 text-left transition hover:bg-rose-400/10"
        >
          <span className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-rose-300/12 text-rose-100">
              <LogOut className="size-5" />
            </span>
            <span>
              <span className="block font-semibold text-white">Keluar</span>
              <span className="text-sm text-white/52">Tutup sesi aplikasi</span>
            </span>
          </span>
        </button>
      </GlassPanel>

      <Dialog open={aboutOpen} onOpenChange={setAboutOpen}>
        <DialogContent className="border-white/12 bg-[#121827]/96 text-white shadow-2xl sm:max-w-lg">
          <DialogHeader>
            <div className="mb-2 flex size-12 items-center justify-center rounded-2xl bg-cyan-300/12 text-cyan-100">
              <ShieldCheck className="size-6" />
            </div>
            <DialogTitle className="text-white">Tentang ABElektronik</DialogTitle>
            <DialogDescription className="text-white/62">
              ABElektronik adalah aplikasi manajemen stok barang elektronik dengan inventory, scanner,
              laporan, barcode, multi-store, dan resi digital.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border border-white/10 bg-white/[0.06] p-4 text-sm text-white/62">
            Versi 1.0.0 (c) by Al Fajrin A Alamsyah 2025
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setAboutOpen(false)}>
              Tutup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
