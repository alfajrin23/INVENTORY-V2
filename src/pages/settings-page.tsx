import { ChevronRight, Database, History, Info, LogOut, MessageCircle, Moon, Save, ScrollText, ShieldCheck, Store, Sun, UserCog, X, Bell } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'

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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useThemeMode } from '@/hooks/use-theme-mode'
import { useInventory } from '@/hooks/use-inventory'
import { useToast } from '@/hooks/use-toast'
import { routes } from '@/lib/navigation'
import { demoEnabled, supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

function getAccountErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message
  }

  if (typeof error === 'object' && error && 'message' in error) {
    return String((error as { message?: unknown }).message)
  }

  return 'Periksa koneksi atau sesi login Anda.'
}

export function SettingsPage() {
  const { activeStore, mode } = useInventory()
  const { openWhatsApp } = useOutletContext<{ openWhatsApp: () => void }>()
  const [aboutOpen, setAboutOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [accountEmail, setAccountEmail] = useState('')
  const [currentEmail, setCurrentEmail] = useState('')
  const [accountPassword, setAccountPassword] = useState('')
  const [accountConfirm, setAccountConfirm] = useState('')
  const [accountLoading, setAccountLoading] = useState(false)
  const [accountSaving, setAccountSaving] = useState(false)
  const [accountError, setAccountError] = useState('')
  const [accountNotice, setAccountNotice] = useState('')
  const { theme, toggleTheme } = useThemeMode()
  const { showToast } = useToast()

  useEffect(() => {
    if (!accountOpen || !supabase || demoEnabled) return

    let alive = true
    void supabase.auth.getUser()
      .then(({ data, error }) => {
        if (!alive) return
        if (error) throw error
        const email = data.user?.email ?? ''
        setAccountEmail(email)
        setCurrentEmail(email)
      })
      .catch(() => {
        if (alive) setAccountError('Data akun gagal dimuat. Coba masuk ulang jika sesi sudah habis.')
      })
      .finally(() => {
        if (alive) setAccountLoading(false)
      })

    return () => {
      alive = false
    }
  }, [accountOpen])

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

  const openAccountSettings = () => {
    setAccountError('')
    setAccountNotice('')
    setAccountPassword('')
    setAccountConfirm('')
    if (!supabase || demoEnabled) {
      setAccountEmail('demo@abelektronik.local')
      setCurrentEmail('demo@abelektronik.local')
      setAccountLoading(false)
    } else {
      setAccountEmail('')
      setCurrentEmail('')
      setAccountLoading(true)
    }
    setAccountOpen(true)
  }

  const handleAccountSave = async () => {
    setAccountError('')
    setAccountNotice('')

    if (!supabase || demoEnabled) {
      setAccountNotice('Mode demo tidak mengubah akun Supabase.')
      return
    }

    const nextEmail = accountEmail.trim()
    if (!nextEmail) {
      setAccountError('Email wajib diisi.')
      return
    }

    if (accountPassword && accountPassword.length < 8) {
      setAccountError('Password minimal 8 karakter.')
      return
    }

    if (accountPassword && accountPassword !== accountConfirm) {
      setAccountError('Konfirmasi password belum sama.')
      return
    }

    setAccountSaving(true)
    try {
      await supabase.auth.refreshSession().catch(() => null)
      const { data: userData, error: userError } = await supabase.auth.getUser()
      if (userError) throw userError

      const latestEmail = userData.user?.email ?? currentEmail
      if (latestEmail && latestEmail !== currentEmail) {
        setCurrentEmail(latestEmail)
      }

      const updates: { email?: string; password?: string } = {}
      if (nextEmail !== latestEmail) updates.email = nextEmail
      if (accountPassword) updates.password = accountPassword

      if (!Object.keys(updates).length) {
        setAccountNotice('Tidak ada perubahan akun yang perlu disimpan.')
        return
      }

      const { data, error } = await supabase.auth.updateUser(updates, {
        emailRedirectTo: `${window.location.origin}${routes.settings}`,
      })
      if (error) throw error

      const savedEmail = data.user?.email ?? nextEmail
      setCurrentEmail(savedEmail)
      setAccountEmail(savedEmail)
      setAccountPassword('')
      setAccountConfirm('')
      setAccountNotice(updates.email ? 'Akun diperbarui. Jika Supabase meminta konfirmasi email, cek inbox email lama dan baru.' : 'Password berhasil diperbarui.')
      showToast('Pengaturan akun diperbarui', 'success')
    } catch (error) {
      setAccountError(`Pengaturan akun gagal disimpan. ${getAccountErrorMessage(error)}`)
    } finally {
      setAccountSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="mobile-settings lg:hidden"><div className="mobile-page-heading"><div><h1>Pengaturan</h1><p>Sesuai cara kamu kerja.</p></div></div><div className="settings-group"><Link to={routes.profile} className="settings-row"><span className="settings-icon incoming"><Store /></span><span><strong>{activeStore?.name ?? 'Profil toko'}</strong><small>Profil & pengelolaan toko</small></span><ChevronRight size={17} /></Link></div><p className="mobile-section-eyebrow">TAMPILAN</p><div className="mobile-filter-row theme-segment" role="group" aria-label="Tampilan"><button aria-pressed={theme === 'light'} className={theme === 'light' ? 'selected' : ''} onClick={() => { if (theme !== 'light') toggleTheme() }}><Sun size={15} /> Terang</button><button aria-pressed={theme === 'dark'} className={theme === 'dark' ? 'selected' : ''} onClick={() => { if (theme !== 'dark') toggleTheme() }}><Moon size={15} /> Gelap</button></div><p className="mobile-section-eyebrow">PREFERENSI TOKO</p><div className="settings-group"><button className="settings-row" onClick={() => showToast('Notifikasi stok tersedia melalui ikon lonceng di atas.', 'info')}><span className="settings-icon incoming"><Bell /></span><span><strong>Notifikasi Android</strong><small>Ringkasan stok di panel notifikasi</small></span><ChevronRight size={17} /></button><button className="settings-row" onClick={openWhatsApp}><span className="settings-icon incoming"><MessageCircle /></span><span><strong>Ringkasan WhatsApp</strong><small>Siapkan laporan untuk dibagikan</small></span><ChevronRight size={17} /></button><Link to={routes.logsInput} className="settings-row"><span className="settings-icon info"><Database /></span><span><strong>Data & koneksi</strong><small>{mode === 'supabase' ? 'Terhubung ke Supabase' : 'Mode demo'} · Logs Input</small></span><ChevronRight size={17} /></Link></div><p className="mobile-section-eyebrow">AKUN & APLIKASI</p><div className="settings-group"><button className="settings-row" onClick={openAccountSettings}><span className="settings-icon incoming"><UserCog /></span><span><strong>Pengaturan akun</strong><small>Email & kata sandi</small></span><ChevronRight size={17} /></button><Link to={routes.history} className="settings-row"><span className="settings-icon incoming"><History /></span><span><strong>History barang</strong><small>Riwayat seluruh transaksi</small></span><ChevronRight size={17} /></Link><Link to={routes.logsInput} className="settings-row"><span className="settings-icon incoming"><ScrollText /></span><span><strong>Logs Input</strong><small>Jejak perubahan data</small></span><ChevronRight size={17} /></Link><button className="settings-row" onClick={() => setAboutOpen(true)}><span className="settings-icon incoming"><Info /></span><span><strong>Tentang aplikasi</strong><small>ABElektronik · Inventory V2</small></span><ChevronRight size={17} /></button><button className="settings-row" onClick={() => void handleExit()}><span className="settings-icon outgoing"><LogOut /></span><span><strong>Keluar akun</strong><small>Akhiri sesi di perangkat ini</small></span><ChevronRight size={17} /></button></div></div>
      <div className="hidden lg:block"><div>
        <p className="text-sm text-cyan-100/70">Preference</p>
        <h1 className="mt-1 text-3xl font-bold text-white lg:text-4xl">Pengaturan</h1>
      </div>

      <div className="grid max-w-4xl gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <Button asChild variant="outline" className="h-11 justify-start border-white/12 bg-white/[0.07] text-white hover:bg-white/12">
          <Link to={routes.profile}>
            <Store className="size-4" />
            Profil & Toko
          </Link>
        </Button>
        <Button asChild variant="outline" className="h-11 justify-start border-white/12 bg-white/[0.07] text-white hover:bg-white/12">
          <Link to={routes.history}>
            <History className="size-4" />
            History Barang
          </Link>
        </Button>
        <Button asChild variant="outline" className="h-11 justify-start border-white/12 bg-white/[0.07] text-white hover:bg-white/12">
          <Link to={routes.logsInput}>
            <ScrollText className="size-4" />
            Logs Input
          </Link>
        </Button>
        <Button type="button" variant="outline" onClick={openAccountSettings} className="h-11 justify-start border-white/12 bg-white/[0.07] text-white hover:bg-white/12">
          <UserCog className="size-4" />
          Pengaturan Akun
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={toggleTheme}
          className={cn(
            'theme-toggle-button h-11 justify-start border-white/12 text-white transition-colors',
            theme === 'light'
              ? 'bg-gradient-to-r from-amber-300/24 via-cyan-300/16 to-white/10 hover:from-amber-300/32'
              : 'bg-gradient-to-r from-indigo-300/18 via-cyan-300/14 to-white/[0.07] hover:from-indigo-300/26',
          )}
        >
          {theme === 'light' ? <Sun className="size-4" /> : <Moon className="size-4" />}
          {theme === 'light' ? 'Mode Light' : 'Mode Dark'}
        </Button>
      </div>

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
      </div>

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
            Versi 1.1.0-beta.1 (c) by Al Fajrin A Alamsyah 2025
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setAboutOpen(false)}>
              <X className="size-4" />
              Tutup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={accountOpen} onOpenChange={setAccountOpen}>
        <DialogContent className="border-white/12 bg-[#121827]/96 text-white shadow-2xl sm:max-w-lg">
          <DialogHeader>
            <div className="mb-2 flex size-12 items-center justify-center rounded-2xl bg-emerald-300/12 text-emerald-100">
              <UserCog className="size-6" />
            </div>
            <DialogTitle className="text-white">Pengaturan Akun</DialogTitle>
            <DialogDescription className="text-white/62">
              Role akun: Admin. Ubah email atau password login dari sini.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="account-email">Email Login</Label>
              <Input
                id="account-email"
                type="email"
                value={accountEmail}
                disabled={accountLoading || accountSaving}
                onChange={(event) => setAccountEmail(event.target.value)}
                className="border-white/12 bg-white/8 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="account-password">Password Baru Akun</Label>
              <Input
                id="account-password"
                type="password"
                value={accountPassword}
                disabled={accountLoading || accountSaving}
                onChange={(event) => setAccountPassword(event.target.value)}
                placeholder="Kosongkan jika tidak diganti"
                className="border-white/12 bg-white/8 text-white placeholder:text-white/38"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="account-confirm">Konfirmasi Password Akun</Label>
              <Input
                id="account-confirm"
                type="password"
                value={accountConfirm}
                disabled={accountLoading || accountSaving || !accountPassword}
                onChange={(event) => setAccountConfirm(event.target.value)}
                placeholder="Ulangi password baru"
                className="border-white/12 bg-white/8 text-white placeholder:text-white/38"
              />
            </div>
            {accountError ? <p role="alert" className="rounded-xl border border-rose-300/20 bg-rose-400/12 p-3 text-sm text-rose-100">{accountError}</p> : null}
            {accountNotice ? <p role="status" className="rounded-xl border border-emerald-300/20 bg-emerald-300/12 p-3 text-sm text-emerald-100">{accountNotice}</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAccountOpen(false)}>
              <X className="size-4" />
              Batal
            </Button>
            <Button type="button" disabled={accountLoading || accountSaving} onClick={() => void handleAccountSave()} className="bg-emerald-300 text-slate-950 hover:bg-emerald-200">
              <Save className="size-4" />
              {accountSaving ? 'Menyimpan...' : 'Simpan Akun'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
