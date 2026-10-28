import { Image, QrCode, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { GlassPanel } from '@/components/shared/glass-panel'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { fetchQrisImage, uploadQrisImage } from '@/lib/media-storage'
import { decodeStaticQrisImage } from '@/lib/qris-image'
import { demoEnabled, supabase } from '@/lib/supabase'

export function QrisSettingsPanel() {
  const [qrisImage, setQrisImage] = useState('/qris-base.jpg')
  const [qrisUploading, setQrisUploading] = useState(false)
  const qrisFileInput = useRef<HTMLInputElement>(null)
  const { showToast } = useToast()

  useEffect(() => {
    if (!supabase || demoEnabled) return
    let alive = true
    void fetchQrisImage().then(url => { if (alive && url) setQrisImage(url) }).catch(() => {})
    return () => { alive = false }
  }, [])

  const handleQrisImageChange = async (file: File | undefined) => {
    if (!file) return
    if (!supabase || demoEnabled) {
      showToast('Simpan gambar QRIS memerlukan koneksi Supabase aktif.', 'error')
      return
    }
    setQrisUploading(true)
    try {
      const decoded = await decodeStaticQrisImage(file)
      const url = await uploadQrisImage(file, decoded.payload)
      setQrisImage(url)
      showToast(`QRIS ${decoded.merchantName} siap membuat nominal dinamis.`, 'success')
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Gambar QRIS gagal disimpan.', 'error')
    } finally {
      setQrisUploading(false)
      if (qrisFileInput.current) qrisFileInput.current.value = ''
    }
  }

  return (
    <GlassPanel className="grid gap-4 p-4 sm:grid-cols-[9rem_1fr] sm:items-center" glow="cyan">
      <div className="flex min-h-32 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white p-2">
        <img src={qrisImage} alt="Gambar referensi QRIS ABElektronik" className="max-h-44 w-full object-contain" />
      </div>
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-cyan-100"><QrCode className="size-5" /><h2 className="font-semibold">Pengaturan QRIS</h2></div>
        <p className="text-sm text-white/62">Unggah QRIS statis ABElektronik yang sesuai dengan akun GoBiz. Aplikasi mengisi nominal dan referensi di QR untuk tiap transaksi; kasir tetap harus mengecek pembayaran di GoBiz.</p>
        <input ref={qrisFileInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={event => void handleQrisImageChange(event.target.files?.[0])} />
        <Button type="button" variant="outline" disabled={qrisUploading || demoEnabled || !supabase} onClick={() => qrisFileInput.current?.click()}>
          {qrisUploading ? <Image className="size-4 animate-pulse" /> : <Upload className="size-4" />}
          {qrisUploading ? 'Menyimpan gambar…' : 'Ganti gambar QRIS'}
        </Button>
        {demoEnabled ? <p className="text-xs text-amber-100/70">Mode demo: penyimpanan gambar perlu koneksi Supabase.</p> : null}
      </div>
    </GlassPanel>
  )
}
