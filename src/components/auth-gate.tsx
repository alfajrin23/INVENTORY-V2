import { ShieldCheck, TriangleAlert } from 'lucide-react'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { demoEnabled, supabase, supabaseReady } from '@/lib/supabase'

export function AuthGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(demoEnabled)
  const [authenticated, setAuthenticated] = useState(demoEnabled)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (demoEnabled || !supabase) return

    let active = true
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setAuthenticated(Boolean(data.session?.user))
      setReady(true)
    })

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return
      setAuthenticated(Boolean(session?.user))
      setReady(true)
    })

    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [])

  if (demoEnabled) return <>{children}</>

  if (!supabaseReady || !supabase) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-950 p-6 text-white">
        <section className="w-full max-w-lg rounded-3xl border border-amber-300/20 bg-amber-300/8 p-6 shadow-2xl">
          <TriangleAlert className="size-9 text-amber-200" aria-hidden="true" />
          <h1 className="mt-4 text-2xl font-bold">Supabase belum dikonfigurasi</h1>
          <p className="mt-2 text-sm leading-6 text-white/65">
            Isi VITE_SUPABASE_URL dan VITE_SUPABASE_PUBLISHABLE_KEY. Secret/service role tidak boleh dipasang pada frontend.
          </p>
        </section>
      </main>
    )
  }

  if (!ready) {
    return <div role="status" className="grid min-h-screen place-items-center bg-slate-950 text-sm text-white/60">Memeriksa sesi...</div>
  }

  if (authenticated) return <>{children}</>

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setMessage(null)
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (error) throw error
      } else {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password })
        if (error) throw error
        if (!data.session) setMessage('Akun dibuat. Periksa email untuk konfirmasi sebelum masuk.')
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Autentikasi gagal')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_top,rgba(13,148,136,0.24),transparent_32rem),#08111f] p-5 text-white">
      <section className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900/85 p-6 shadow-2xl backdrop-blur-xl">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-teal-300/12 text-teal-100">
          <ShieldCheck className="size-6" aria-hidden="true" />
        </div>
        <h1 className="mt-4 text-2xl font-bold">{mode === 'login' ? 'Masuk Inventory' : 'Buat akun Inventory'}</h1>
        <p className="mt-1 text-sm text-white/55">Data setiap akun dibatasi oleh RLS dan kepemilikan toko.</p>

        <form className="mt-6 space-y-4" onSubmit={submit}>
          <div className="space-y-2">
            <Label htmlFor="auth-email">Email</Label>
            <Input id="auth-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="h-11 border-white/12 bg-white/7 text-white" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="auth-password">Password</Label>
            <Input id="auth-password" type="password" minLength={6} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required value={password} onChange={(event) => setPassword(event.target.value)} className="h-11 border-white/12 bg-white/7 text-white" />
          </div>
          {message ? <p role="alert" className="rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-sm text-amber-100">{message}</p> : null}
          <Button type="submit" disabled={submitting} className="h-11 w-full bg-teal-400 text-slate-950 hover:bg-teal-300">
            {submitting ? 'Memproses...' : mode === 'login' ? 'Masuk' : 'Daftar'}
          </Button>
        </form>

        <Button type="button" variant="ghost" className="mt-3 w-full text-white/65" onClick={() => { setMode((current) => current === 'login' ? 'register' : 'login'); setMessage(null) }}>
          {mode === 'login' ? 'Belum punya akun? Daftar' : 'Sudah punya akun? Masuk'}
        </Button>
      </section>
    </main>
  )
}
