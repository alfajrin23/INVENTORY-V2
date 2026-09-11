import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, Mic, PackagePlus, ScanLine, Square, TriangleAlert } from 'lucide-react'
import { ScannerDialog } from '@/components/inventory/scanner-dialog'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { lookupScannedProduct } from '@/lib/barcode-product-reference'
import {
  matchVoiceProducts,
  normalizeVoice,
  parseVoiceCommand,
  parseVoiceDraftEdit,
  type VoiceCommand,
  type VoiceDraftEdit,
  type VoiceProductDraft,
  type VoiceTransactionCommand,
} from '@/lib/voice-command'
import type { CartItem, Product, ProductInput, TransactionCategory } from '@/lib/types'

type Recognition = {
  lang: string; interimResults: boolean; continuous: boolean
  onstart: (() => void) | null; onend: (() => void) | null
  onerror: ((event: { error: string }) => void) | null
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  start(): void; stop(): void; abort(): void
}
type VoiceWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }
type State = 'idle' | 'permission' | 'listening' | 'processing' | 'review' | 'saving' | 'success' | 'error'

const labels: Record<State, string> = {
  idle: 'Siap mendengarkan',
  permission: 'Meminta izin microphone...',
  listening: 'Mendengarkan...',
  processing: 'Memahami perintah...',
  review: 'Periksa dan konfirmasi',
  saving: 'Menyimpan...',
  success: 'Berhasil',
  error: 'Perintah belum dapat diproses',
}

function isTransactionCommand(command: VoiceCommand | null): command is VoiceTransactionCommand {
  return command?.intent === 'stock_in' || command?.intent === 'stock_out'
}

function numericValue(value: string) {
  const clean = value.replace(/\D/g, '')
  if (!clean) return null
  const number = Number(clean)
  return Number.isSafeInteger(number) ? number : null
}

function canAutoSelect(matches: ReturnType<typeof matchVoiceProducts>) {
  return matches[0]?.score >= 0.9 && (!matches[1] || matches[0].score - matches[1].score >= 0.15)
}

function insecureSpeechOriginMessage() {
  return `Microphone dan SpeechRecognition browser butuh HTTPS atau localhost. Anda sedang membuka ${window.location.host}; gunakan http://localhost di komputer ini, deploy HTTPS, atau ketik perintah di bawah.`
}

function isSpeechSecureContext() {
  return window.isSecureContext || ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)
}

export function VoiceDialog({
  products,
  activeStoreId,
  onClose,
  onConfirm,
  onCreateProduct,
}: {
  products: Product[]
  activeStoreId?: string
  onClose(): void
  onConfirm(items: CartItem[], category: TransactionCategory): Promise<void>
  onCreateProduct?: (product: ProductInput) => Promise<void>
}) {
  const [state, setState] = useState<State>('idle')
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState('')
  const [command, setCommand] = useState<VoiceCommand | null>(null)
  const [choices, setChoices] = useState<Record<number, string>>({})
  const [createDraft, setCreateDraft] = useState<VoiceProductDraft | null>(null)
  const [barcodeScannerOpen, setBarcodeScannerOpen] = useState(false)
  const [successMessage, setSuccessMessage] = useState('Stok dan history berhasil diperbarui.')
  const recognition = useRef<Recognition | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const busy = useRef(false)
  const alive = useRef(true)
  const latestTranscript = useRef('')
  const failed = useRef(false)

  const cancelAudio = () => {
    if (timer.current) clearTimeout(timer.current)
    const current = recognition.current; recognition.current = null
    if (current) { current.onend = null; current.onresult = null; current.onerror = null; current.onstart = null; current.abort() }
  }

  const focusTextFallback = () => {
    window.setTimeout(() => document.getElementById('voice-transcript')?.focus(), 0)
  }

  const failToTextFallback = (message: string) => {
    setError(message); setState('error'); cancelAudio(); focusTextFallback()
  }

  const resetDraft = () => {
    setCommand(null); setChoices({}); setCreateDraft(null); setBarcodeScannerOpen(false)
  }

  const setDraftBarcode = (barcode: string) => {
    const clean = barcode.replace(/\s+/g, '')
    setCreateDraft(draft => draft ? { ...draft, barcode: clean } : draft)
  }

  const applyDraftScan = (value: string) => {
    const suggestion = lookupScannedProduct(value, products)
    const clean = suggestion.barcode || value.replace(/\s+/g, '')
    setCreateDraft(draft => draft ? {
      ...draft,
      barcode: clean,
      name: suggestion.namaBarang && !draft.name.trim() ? suggestion.namaBarang : draft.name,
      brand: suggestion.brand && !draft.brand.trim() ? suggestion.brand : draft.brand,
      price: suggestion.harga !== null && draft.price === null ? suggestion.harga : draft.price,
      stock: suggestion.stok !== null && draft.stock === null ? suggestion.stok : draft.stock,
    } : draft)
  }

  const applyTransactionCommand = (parsed: VoiceTransactionCommand) => {
    const selected: Record<number, string> = {}
    parsed.items.forEach((item, index) => {
      const matches = matchVoiceProducts(item.query, products)
      if (canAutoSelect(matches)) selected[index] = matches[0].product.id
    })
    setCommand(parsed); setCreateDraft(null); setChoices(selected); setState('review')
  }

  const findCommandItem = (draft: VoiceTransactionCommand, query?: string) => {
    if (!query) return draft.items.length === 1 ? 0 : -1
    const tokens = normalizeVoice(query).split(' ').filter(Boolean)
    return draft.items.findIndex((item, index) => {
      const selected = products.find(product => product.id === choices[index])
      const haystack = normalizeVoice(`${item.query} ${selected?.namaBarang ?? ''} ${selected?.brand ?? ''}`)
      return tokens.length > 0 && tokens.some(token => haystack.includes(token))
    })
  }

  const applyDraftEdit = (edit: VoiceDraftEdit) => {
    if (edit.action === 'cancel') { resetDraft(); onClose(); return true }
    if (edit.action === 'retry') { resetDraft(); start(); return true }
    if (!isTransactionCommand(command)) {
      setError('Belum ada draft transaksi untuk diperbaiki.'); setState('error'); return true
    }

    if (edit.action === 'quantity') {
      const index = findCommandItem(command, edit.query)
      if (index < 0) { setError('Sebutkan barang yang jumlahnya ingin diubah.'); setState('review'); return true }
      setCommand({ ...command, items: command.items.map((item, itemIndex) => (itemIndex === index ? { ...item, quantity: edit.quantity } : item)) })
      setError(''); setState('review'); return true
    }

    if (edit.action !== 'product') return true
    const index = findCommandItem(command, edit.from)
    if (index < 0) { setError('Barang yang ingin diganti belum jelas.'); setState('review'); return true }
    const matches = matchVoiceProducts(edit.query, products)
    if (!matches.length) { setError('Produk pengganti tidak ditemukan. Pilih kandidat atau ketik nama yang lebih lengkap.'); setState('review'); return true }
    setCommand({ ...command, items: command.items.map((item, itemIndex) => (itemIndex === index ? { ...item, query: edit.query } : item)) })
    setChoices(current => ({ ...current, [index]: matches[0].product.id }))
    setError(''); setState('review'); return true
  }

  const interpret = (text: string) => {
    cancelAudio(); setState('processing'); setError('')
    try {
      const edit = parseVoiceDraftEdit(text)
      if (edit && applyDraftEdit(edit)) return
      resetDraft()
      const parsed = parseVoiceCommand(text)
      if (parsed.intent === 'create_product') {
        setCommand(parsed); setCreateDraft(parsed.draft); setChoices({}); setState('review'); return
      }
      applyTransactionCommand(parsed)
    } catch (e) { setError(e instanceof Error ? e.message : 'Saya belum memahami perintah tersebut.'); setState('error') }
  }

  const start = () => {
    cancelAudio(); setError(''); resetDraft(); setTranscript(''); latestTranscript.current = ''; failed.current = false
    const Constructor = (window as VoiceWindow).SpeechRecognition ?? (window as VoiceWindow).webkitSpeechRecognition
    if (!isSpeechSecureContext()) { failToTextFallback(insecureSpeechOriginMessage()); return }
    if (!Constructor) { failToTextFallback('SpeechRecognition tidak tersedia di browser ini. Ketik perintah di bawah atau gunakan dikte keyboard Bahasa Indonesia.'); return }
    if (!navigator.onLine) { failToTextFallback('Browser sedang offline. Sambungkan internet atau ketik perintah di bawah.'); return }
    setState('permission')
    try {
      const current = new Constructor(); recognition.current = current
      current.lang = 'id-ID'; current.interimResults = true; current.continuous = false
      current.onstart = () => setState('listening')
      current.onresult = event => {
        const text = Array.from(event.results).map(result => result[0].transcript).join(' ')
        latestTranscript.current = text; setTranscript(text)
      }
      current.onerror = event => {
        failed.current = true
        const messages: Record<string, string> = {
          'not-allowed': 'Izin microphone ditolak. Izinkan microphone di pengaturan browser atau ketik perintah.',
          'audio-capture': 'Microphone tidak tersedia. Periksa perangkat atau ketik perintah.',
          'no-speech': 'Suara belum terdengar. Coba lagi dan bicara lebih jelas.',
          network: 'Layanan speech bawaan browser gagal tersambung. Ini bisa terjadi walaupun internet normal, misalnya karena akses speech Chrome/Edge diblokir, VPN/firewall, atau halaman dibuka dari IP LAN tanpa HTTPS. Ketik perintah di bawah lalu klik Pahami perintah.',
          'service-not-allowed': 'Layanan suara browser tidak tersedia. Gunakan input teks.',
        }
        failToTextFallback(messages[event.error] ?? 'Pengenalan suara gagal. Coba lagi atau ketik perintah.')
      }
      current.onend = () => {
        if (failed.current) return
        if (latestTranscript.current.trim()) interpret(latestTranscript.current)
        else { setError('Suara belum jelas. Coba lagi atau ketik perintah.'); setState('error'); cancelAudio() }
      }
      current.start()
      timer.current = setTimeout(() => {
        if (latestTranscript.current.trim()) interpret(latestTranscript.current)
        else { cancelAudio(); setError('Waktu mendengarkan habis. Coba lagi.'); setState('error') }
      }, 20000)
    } catch { failToTextFallback('Microphone tidak dapat dimulai. Gunakan HTTPS/localhost dan izinkan microphone, atau ketik perintah.') }
  }

  useEffect(() => {
    alive.current = true
    start()
    return () => { alive.current = false; cancelAudio() }
    // Start one recognition session per dialog, not on inventory updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const transactionCommand = isTransactionCommand(command) ? command : null
  const resolved = transactionCommand?.items.map((item, index) => ({ product: products.find(p => p.id === choices[index]), quantity: item.quantity })) ?? []
  const totals = new Map<string, number>()
  for (const item of resolved) if (item.product) totals.set(item.product.id, (totals.get(item.product.id) ?? 0) + item.quantity)
  const insufficient = transactionCommand?.category === 'keluar' && resolved.some(i => i.product && (totals.get(i.product.id) ?? 0) > i.product.stok)
  const canConfirm = resolved.length > 0 && resolved.every(i => i.product) && !insufficient
  const exampleTranscript = products[0] ? `transaksi ${products[0].namaBarang} ${products[0].brand} dua` : 'transaksi lampu Philips dua'
  const hasTranscript = transcript.trim().length > 0
  const draftBarcode = createDraft?.barcode.trim() ?? ''
  const validCreate = Boolean(createDraft?.name.trim() && draftBarcode && activeStoreId && onCreateProduct
    && Number.isSafeInteger(createDraft.stock) && (createDraft.stock ?? -1) >= 0
    && (createDraft.price === null || (Number.isFinite(createDraft.price) && createDraft.price >= 0)))
  const duplicateBarcode = Boolean(draftBarcode && products.some(product => product.storeId === activeStoreId && product.barcode === draftBarcode))
  const locked = state === 'saving' || state === 'success'

  return <Dialog open onOpenChange={open => { if (!open && !busy.current) onClose() }}>
    <DialogContent className="voice-sheet box-border max-h-[90dvh] overflow-y-auto border-white/12 bg-[#121827] text-white shadow-2xl sm:max-w-lg max-lg:inset-x-0 max-lg:bottom-0 max-lg:top-auto max-lg:w-dvw max-lg:max-w-none max-lg:translate-x-0 max-lg:translate-y-0 max-lg:rounded-b-none max-lg:rounded-t-3xl" showCloseButton={state !== 'saving'}>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-3 pr-6 text-xl"><Mic className={state === 'listening' ? 'voice-pulse text-emerald-300' : 'text-emerald-300'} />Voice AI</DialogTitle>
        <DialogDescription>Ucapkan transaksi, koreksi, atau tambah barang baru. Stok berubah setelah konfirmasi.</DialogDescription>
      </DialogHeader>
      <p role="status" aria-live="polite" className="font-semibold text-emerald-200">{labels[state]}</p>
      <Label htmlFor="voice-transcript">Perintah Anda</Label>
      <Textarea id="voice-transcript" value={transcript} disabled={locked || state === 'listening' || state === 'permission'} placeholder={exampleTranscript} onChange={e => { setTranscript(e.target.value); setError(''); if (state === 'error') setState('idle') }} />
      {error && <p role="alert" className="rounded-xl bg-rose-400/10 p-3 text-rose-100">{error}</p>}
      {state === 'error' && !hasTranscript && products.length > 0 && <p className="rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-sm text-amber-100">Kolom perintah masih kosong. Ketik perintah sendiri atau pakai contoh dari produk toko aktif.</p>}
      {state !== 'success' && <div className="flex flex-wrap gap-2">
        {state === 'listening' || state === 'permission' ? <Button onClick={() => recognition.current?.stop()}><Square />Selesai bicara</Button> : <Button variant="outline" disabled={locked} onClick={start}><Mic />{state === 'idle' ? 'Mulai Dengarkan' : 'Coba Lagi'}</Button>}
        {state === 'error' && !hasTranscript && products.length > 0 && <Button variant="outline" disabled={locked} onClick={() => { setTranscript(exampleTranscript); setError(''); setState('idle'); focusTextFallback() }}>Pakai Contoh</Button>}
        <Button variant="outline" disabled={locked || !hasTranscript || state === 'listening' || state === 'permission'} onClick={() => interpret(transcript)}>Pahami perintah</Button>
      </div>}

      {transactionCommand && state !== 'success' && <section className="space-y-3" aria-label="Konfirmasi transaksi suara">
        <h2 className="text-lg font-semibold">{transactionCommand.category === 'masuk' ? 'Barang Masuk' : 'Barang Keluar'}</h2>
        {transactionCommand.items.map((item, index) => {
          const matches = matchVoiceProducts(item.query, products)
          const selected = resolved[index]?.product
          return <div key={index} className="rounded-2xl border border-white/15 bg-white/5 p-4">
            <p className="font-semibold">{selected?.namaBarang ?? item.query}</p><p>Qty: {item.quantity}</p>
            {!selected && <p className="my-2 flex gap-2 text-amber-200"><TriangleAlert className="mt-0.5 size-4 shrink-0" />{matches.length ? 'Terdapat beberapa barang yang mirip atau kecocokan belum pasti. Pilih produk:' : 'Produk tidak ditemukan. Perbaiki perintah Anda.'}</p>}
            {matches.length > 0 && <label className="mt-2 block text-sm">Produk yang dimaksud
              <select aria-label={`Produk untuk ${item.query}`} disabled={locked} value={choices[index] ?? ''} className="mt-1 min-h-11 w-full rounded-lg border border-white/20 bg-slate-900 p-2" onChange={e => setChoices(c => ({ ...c, [index]: e.target.value }))}>
                <option value="">Pilih produk</option>{matches.map(m => <option key={m.product.id} value={m.product.id}>{m.product.namaBarang} - {m.product.brand} ({Math.round(m.score * 100)}%)</option>)}
              </select></label>}
            {selected && <p className="mt-2 text-sm text-white/70">Stok sekarang: {selected.stok}<br />Stok setelah transaksi: {selected.stok + (transactionCommand.category === 'masuk' ? 1 : -1) * (totals.get(selected.id) ?? 0)}</p>}
          </div>
        })}
        {insufficient && <p role="alert" className="text-rose-200">Stok tidak cukup. Kurangi jumlah pada perintah Anda.</p>}
        <Button className="w-full bg-emerald-300 text-slate-950" disabled={!canConfirm || locked} onClick={async () => {
          if (busy.current || !canConfirm) return
          busy.current = true; setState('saving'); setError(''); cancelAudio()
          try {
            const items = [...totals].map(([id, quantity]) => ({ product: products.find(p => p.id === id)!, quantity }))
            await onConfirm(items, transactionCommand.category)
            if (alive.current) { setSuccessMessage('Stok dan history berhasil diperbarui.'); setState('success') }
          } catch (e) { if (alive.current) { setState('review'); setError(e instanceof Error ? e.message : 'Transaksi gagal. Silakan coba lagi.') } }
          finally { busy.current = false }
        }}>{state === 'saving' ? 'Menyimpan...' : 'Konfirmasi'}</Button>
      </section>}

      {createDraft && state !== 'success' && <section className="space-y-3" aria-label="Draft barang baru">
        <div className="flex items-center gap-2">
          <PackagePlus className="size-5 text-cyan-200" />
          <h2 className="text-lg font-semibold">Tambah Barang Baru</h2>
        </div>
        <div className="grid gap-3 rounded-2xl border border-white/15 bg-white/5 p-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm sm:col-span-2">Nama Barang Baru
            <Input value={createDraft.name} disabled={locked} className="border-white/20 bg-slate-900 text-white" onChange={e => setCreateDraft(draft => draft ? { ...draft, name: e.target.value } : draft)} />
          </label>
          <label className="space-y-1 text-sm">Merek / Brand (opsional)
            <Input value={createDraft.brand} disabled={locked} className="border-white/20 bg-slate-900 text-white" onChange={e => setCreateDraft(draft => draft ? { ...draft, brand: e.target.value } : draft)} />
          </label>
          <label className="space-y-1 text-sm">Stok Awal
            <Input inputMode="numeric" value={createDraft.stock ?? ''} disabled={locked} className="border-white/20 bg-slate-900 text-white" onChange={e => setCreateDraft(draft => draft ? { ...draft, stock: numericValue(e.target.value) } : draft)} />
          </label>
          <label className="space-y-1 text-sm">Harga Jual (opsional)
            <Input inputMode="numeric" value={createDraft.price ?? ''} disabled={locked} className="border-white/20 bg-slate-900 text-white" onChange={e => setCreateDraft(draft => draft ? { ...draft, price: numericValue(e.target.value) } : draft)} />
          </label>
          <div className="space-y-1 text-sm sm:col-span-2">
            <Label htmlFor="voice-new-barcode" className="text-sm text-white">Barcode Baru</Label>
            <div className="flex gap-2">
              <Input id="voice-new-barcode" value={createDraft.barcode} disabled={locked} className="border-white/20 bg-slate-900 text-white" onChange={e => setDraftBarcode(e.target.value)} />
              <Button type="button" variant="outline" disabled={locked} onClick={() => setBarcodeScannerOpen(true)} aria-label="Scan Barcode">
                <ScanLine className="size-4" />Scan Barcode
              </Button>
            </div>
          </div>
        </div>
        {duplicateBarcode && <p role="alert" className="rounded-xl bg-rose-400/10 p-3 text-rose-100">Barcode sudah dipakai di toko ini.</p>}
        {!draftBarcode && <p className="rounded-xl border border-cyan-300/20 bg-cyan-300/10 p-3 text-sm text-cyan-50">Isi barcode manual atau scan barcode sebelum menyimpan.</p>}
        {!activeStoreId && <p role="alert" className="rounded-xl bg-amber-400/10 p-3 text-amber-100">Pilih toko aktif sebelum menyimpan barang baru.</p>}
        <ScannerDialog
          open={barcodeScannerOpen}
          onOpenChange={setBarcodeScannerOpen}
          products={products}
          title="Scan Barcode Barang Baru"
          description="Scan barcode atau QR produk. Jika ada nama atau brand di hasil scan, draft barang baru ikut diisi."
          onRawBarcode={applyDraftScan}
          onDetected={product => {
            setDraftBarcode(product.barcode)
            setError(`Barcode sudah dipakai oleh ${product.namaBarang}. Gunakan barcode lain.`)
            setBarcodeScannerOpen(false)
          }}
          onMissingBarcode={barcode => {
            applyDraftScan(barcode)
            setError('')
            setBarcodeScannerOpen(false)
          }}
        />
        <Button className="w-full bg-cyan-300 text-slate-950 hover:bg-cyan-200" disabled={!validCreate || duplicateBarcode || locked} onClick={async () => {
          if (busy.current || !validCreate || !createDraft || !activeStoreId || !onCreateProduct) return
          busy.current = true; setState('saving'); setError(''); cancelAudio()
          try {
            await onCreateProduct({
              storeId: activeStoreId,
              namaBarang: createDraft.name.trim(),
              brand: createDraft.brand.trim() || 'Tanpa Merek',
              harga: createDraft.price ?? 0,
              stok: createDraft.stock ?? 0,
              barcode: draftBarcode,
            })
            if (alive.current) { setSuccessMessage('Barang baru berhasil ditambahkan.'); setState('success') }
          } catch (e) { if (alive.current) { setState('review'); setError(e instanceof Error ? e.message : 'Barang baru gagal disimpan.') } }
          finally { busy.current = false }
        }}>{state === 'saving' ? 'Menyimpan...' : 'Simpan Barang Baru'}</Button>
      </section>}

      {state === 'success' && <p className="flex gap-2 text-emerald-200"><CheckCircle2 />{successMessage}</p>}
      <Button variant="outline" disabled={state === 'saving'} onClick={onClose}>{state === 'success' ? 'Selesai' : 'Batalkan'}</Button>
    </DialogContent>
  </Dialog>
}
