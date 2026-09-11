import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
export const demoEnabled = import.meta.env.DEV && import.meta.env.VITE_DEMO_MODE === 'true'
export const supabase = url && key ? createClient(url, key, {
  global: {
    fetch: (input, init) => fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(20000) }),
  },
}) : null

export function requireSupabase() {
  if (!supabase) throw new Error('Supabase belum dikonfigurasi. Isi VITE_SUPABASE_URL dan VITE_SUPABASE_PUBLISHABLE_KEY di .env.local.')
  return supabase
}

export function databaseError(error: { message: string; code?: string }): Error {
  if (error.code === '23505') return new Error('Barcode atau data tersebut sudah terdaftar.')
  if (error.code === '42501') return new Error('Akses ditolak. Masuk kembali dan pastikan toko milik akun Anda.')
  if (/fetch|network|timeout|abort/i.test(error.message)) return new Error('Koneksi terputus atau waktu habis. Coba lagi; transaksi yang sama tidak akan dicatat dua kali.')
  return new Error(error.message)
}
