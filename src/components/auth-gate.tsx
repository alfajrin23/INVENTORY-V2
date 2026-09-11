import { useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { demoEnabled, supabase, requireSupabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(!demoEnabled && !!supabase)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!supabase || demoEnabled) return
    let alive = true
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!alive) return
      setSession(data.session); setLoading(false)
      if (error) setError('Sesi tidak dapat dimuat. Silakan masuk kembali.')
    }).catch(() => { if (alive) { setLoading(false); setError('Koneksi gagal. Silakan coba lagi.') } })
    const { data } = supabase.auth.onAuthStateChange((_event, next) => { setSession(next); setLoading(false) })
    return () => { alive = false; data.subscription.unsubscribe() }
  }, [])
  if (demoEnabled) return children
  if (loading) return <p className="p-6 text-white" role="status">Memuat sesi…</p>
  if (session) return <div key={session.user.id}>{children}</div>
  return <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-5 p-6 text-white">
    <h1 className="text-2xl font-bold">Masuk ke Inventory</h1>
    {!supabase ? <p role="alert">Supabase belum dikonfigurasi. Ikuti SUPABASE_SETUP.md dan isi VITE_SUPABASE_URL serta VITE_SUPABASE_PUBLISHABLE_KEY.</p> :
      <form className="grid gap-4" onSubmit={async event => {
        event.preventDefault(); if (busy) return; setBusy(true); setError('')
        try {
          const { error } = await requireSupabase().auth.signInWithPassword({ email, password })
          if (error) setError('Gagal masuk. Periksa email, password, dan koneksi Anda.')
        } catch { setError('Koneksi gagal. Silakan coba lagi.') } finally { setBusy(false) }
      }}>
        <Label htmlFor="login-email">Email</Label><Input id="login-email" type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} />
        <Label htmlFor="login-password">Password</Label><Input id="login-password" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} />
        {error && <p role="alert">{error}</p>}
        <Button disabled={busy}>{busy ? 'Memeriksa…' : 'Masuk'}</Button>
        <p className="text-sm text-white/65">Gunakan akun yang dibuat administrator toko.</p>
      </form>}
  </main>
}
