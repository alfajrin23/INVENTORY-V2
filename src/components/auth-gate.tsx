import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ArrowLeft, DoorOpen, Eye, EyeOff, KeyRound, LockKeyhole, Mail, UserPlus } from 'lucide-react'

import { demoEnabled, supabase, requireSupabase } from '@/lib/supabase'
import './auth-gate.css'

type AuthMode = 'login' | 'signup' | 'request-reset' | 'reset-password'

export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(!demoEnabled && !!supabase)
  const [mode, setMode] = useState<AuthMode>(() => window.location.hash.includes('type=recovery') ? 'reset-password' : 'login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [coverEyes, setCoverEyes] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!supabase || demoEnabled) return
    let alive = true
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!alive) return
      setSession(data.session); setLoading(false)
      if (error) setError('Sesi tidak dapat dimuat. Silakan masuk kembali.')
    }).catch(() => { if (alive) { setLoading(false); setError('Koneksi gagal. Silakan coba lagi.') } })
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === 'PASSWORD_RECOVERY') setMode('reset-password')
      setSession(next); setLoading(false)
    })
    return () => { alive = false; data.subscription.unsubscribe() }
  }, [])

  if (demoEnabled) return children
  if (session && mode !== 'reset-password') return <div key={session.user.id}>{children}</div>

  const switchMode = (next: AuthMode) => {
    setMode(next); setError(''); setNotice(''); setPassword(''); setConfirmPassword(''); setShowPassword(false); setCoverEyes(false)
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy || loading) return
    setBusy(true); setError(''); setNotice('')
    try {
      const client = requireSupabase()
      if (mode === 'request-reset') {
        const { error: requestError } = await client.auth.resetPasswordForEmail(email.trim())
        if (requestError) throw requestError
        setNotice('Jika email terdaftar, tautan pemulihan telah dikirim. Periksa kotak masuk Anda.')
      } else if (mode === 'signup') {
        if (password.length < 8) { setError('Password minimal 8 karakter.'); return }
        if (password !== confirmPassword) { setError('Konfirmasi password belum sama.'); return }
        const { data, error: signUpError } = await client.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { role: 'admin' } },
        })
        if (signUpError) throw signUpError
        if (data.session) {
          setSession(data.session)
          setNotice('Akun admin berhasil dibuat.')
        } else {
          switchMode('login')
          setNotice('Akun admin dibuat. Periksa email untuk verifikasi, lalu masuk.')
        }
      } else if (mode === 'reset-password') {
        if (password !== confirmPassword) { setError('Konfirmasi password belum sama.'); return }
        const { error: updateError } = await client.auth.updateUser({ password })
        if (updateError) throw updateError
        const { error: signOutError } = await client.auth.signOut()
        if (signOutError) throw signOutError
        switchMode('login')
        setNotice('Password berhasil diubah. Silakan masuk kembali.')
      } else {
        const { error: signInError } = await client.auth.signInWithPassword({ email: email.trim(), password })
        if (signInError) setError('Gagal masuk. Periksa email, password, dan koneksi Anda.')
      }
    } catch {
      setError(mode === 'login' ? 'Koneksi gagal. Silakan coba lagi.' : mode === 'signup' ? 'Pendaftaran gagal. Periksa email, password, atau koneksi Anda.' : 'Permintaan gagal. Periksa koneksi atau coba lagi nanti.')
    } finally { setBusy(false) }
  }

  const title = mode === 'reset-password' ? 'Buat password baru' : mode === 'request-reset' ? 'Pulihkan akun' : mode === 'signup' ? 'Buat akun admin' : 'Masuk ke Inventory'

  return <main className="auth-page">
    <div className="auth-shell">
      <div className={`auth-mascot${coverEyes ? ' auth-mascot--covered' : ''}`} aria-hidden="true">
        <span className="auth-mascot-open" />
        <span className="auth-mascot-covered" />
      </div>
      <section className="auth-panel" aria-label={title}>
        <h1>{title}</h1>
        <p className="auth-intro">{mode === 'login' ? 'Selamat datang kembali. Kucing putih menjaga toko Anda.' : mode === 'signup' ? 'Daftarkan akun baru untuk mengelola toko sebagai admin.' : mode === 'request-reset' ? 'Masukkan email akun untuk menerima tautan pemulihan.' : 'Masukkan password baru untuk akun Anda.'}</p>
        {!supabase ? <p className="auth-alert" role="alert">Supabase belum dikonfigurasi. Isi VITE_SUPABASE_URL dan VITE_SUPABASE_PUBLISHABLE_KEY.</p> :
          <form onSubmit={submit} className="auth-form">
            {mode !== 'reset-password' && <div className="auth-field">
              <label htmlFor="login-email">Email</label>
              <div className="auth-input-row"><Mail aria-hidden="true" size={19} /><input id="login-email" type="email" placeholder="email@toko.com" autoComplete="username" required value={email} onFocus={() => setCoverEyes(false)} onChange={event => setEmail(event.target.value)} /></div>
            </div>}
            {mode !== 'request-reset' && <div className="auth-field" onFocusCapture={() => setCoverEyes(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setCoverEyes(false) }}>
              <label htmlFor="login-password">{mode === 'login' ? 'Password' : 'Password baru'}</label>
              <div className="auth-input-row"><LockKeyhole aria-hidden="true" size={19} /><input id="login-password" type={showPassword ? 'text' : 'password'} placeholder={mode === 'login' ? 'Password' : 'Password baru'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'signup' || mode === 'reset-password' ? 8 : undefined} required value={password} onChange={event => setPassword(event.target.value)} /><button type="button" className="auth-eye" aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'} title={showPassword ? 'Sembunyikan password' : 'Tampilkan password'} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={20} /> : <Eye size={20} />}</button></div>
            </div>}
            {(mode === 'signup' || mode === 'reset-password') && <div className="auth-field" onFocusCapture={() => setCoverEyes(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setCoverEyes(false) }}>
              <label htmlFor="login-confirm-password">Konfirmasi password</label>
              <div className="auth-input-row"><LockKeyhole aria-hidden="true" size={19} /><input id="login-confirm-password" type={showPassword ? 'text' : 'password'} placeholder="Ulangi password baru" autoComplete="new-password" minLength={8} required value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} /></div>
            </div>}
            {mode === 'login' && <div className="auth-options auth-options--split">
              <button type="button" onClick={() => switchMode('signup')}><UserPlus size={14} aria-hidden="true" />Create account</button>
              <button type="button" onClick={() => switchMode('request-reset')}><KeyRound size={14} aria-hidden="true" />Lupa password?</button>
            </div>}
            {error && <p role="alert" className="auth-alert">{error}</p>}
            {notice && <p role="status" className="auth-notice">{notice}</p>}
            <button className="auth-submit" type="submit" disabled={busy || loading}>
              <span>{loading ? 'Memuat sesi...' : busy ? 'Memproses...' : mode === 'login' ? 'Masuk' : mode === 'signup' ? 'Buat akun' : mode === 'request-reset' ? 'Kirim tautan' : 'Simpan password'}</span>
              <span className="auth-door"><DoorOpen size={23} aria-hidden="true" /></span>
            </button>
            {mode !== 'login' && <button type="button" className="auth-back" onClick={() => switchMode('login')}><ArrowLeft size={14} aria-hidden="true" />Kembali ke masuk</button>}
          </form>}
        <p className="auth-footer">{mode === 'signup' ? 'Akun baru otomatis memakai role admin toko.' : 'Akun dikelola administrator toko.'}</p>
      </section>
    </div>
  </main>
}
