import { AudioWaveform, CircleCheck, CircleX, Mic, Package, RefreshCw, Sparkles, TriangleAlert } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useInventory } from '@/hooks/use-inventory'
import { formatCurrency } from '@/lib/format'
import type { CartItem, Product, TransactionCategory } from '@/lib/types'
import { parseVoiceCommand, resolveProducts, type ProductCandidate } from '@/lib/voice'

type SpeechRecognitionResultLike = { 0: { transcript: string } }
type SpeechRecognitionEventLike = { results: { 0: SpeechRecognitionResultLike } }
type SpeechRecognitionErrorLike = { error: string }
type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: SpeechRecognitionErrorLike) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike

type PendingTransaction = {
  product: Product
  category: TransactionCategory
  quantity: number
}

type CandidateContext = {
  category?: TransactionCategory
  quantity?: number
}

type CreateDraft = {
  name: string
  brand: string
  stock: string
  price: string
}

type VoiceDialogProps = {
  products: Product[]
  onClose: () => void
  onConfirm: (cart: CartItem[], kind: TransactionCategory) => Promise<void>
}

function speechCtor() {
  if (typeof window === 'undefined') return undefined
  const browser = window as typeof window & {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return browser.SpeechRecognition ?? browser.webkitSpeechRecognition
}

export function VoiceDialog({ products, onClose, onConfirm }: VoiceDialogProps) {
  const { activeStore, addProduct } = useInventory()
  const recognition = useRef<SpeechRecognitionLike | null>(null)
  const [status, setStatus] = useState<'idle' | 'listening' | 'processing' | 'success' | 'error'>('idle')
  const [input, setInput] = useState('')
  const [message, setMessage] = useState('Ucapkan atau ketik perintah inventory.')
  const [pending, setPending] = useState<PendingTransaction | null>(null)
  const [candidates, setCandidates] = useState<ProductCandidate[]>([])
  const [candidateQuery, setCandidateQuery] = useState('')
  const [candidateContext, setCandidateContext] = useState<CandidateContext>({})
  const [createDraft, setCreateDraft] = useState<CreateDraft | null>(null)
  const supported = Boolean(speechCtor())

  const stockAfter = pending
    ? pending.category === 'keluar'
      ? pending.product.stok - pending.quantity
      : pending.product.stok + pending.quantity
    : 0

  const resetDraft = () => {
    setPending(null)
    setCandidates([])
    setCandidateQuery('')
    setCandidateContext({})
    setCreateDraft(null)
    setStatus('idle')
    setMessage('Aksi dibatalkan. Tidak ada perubahan database.')
  }

  const resolveForTransaction = (query: string, category: TransactionCategory, quantity: number) => {
    const ranked = resolveProducts(products, query)
    if (!ranked.length) {
      setCandidateQuery(query)
      setCandidates([])
      setCandidateContext({ category, quantity })
      setMessage(`Barang “${query}” tidak ditemukan. Coba nama lain atau tambah barang baru.`)
      return
    }
    if (ranked[0].exact) {
      setPending({ product: ranked[0].product, category, quantity })
      setCandidates([])
      setMessage('Periksa detail lalu konfirmasi transaksi.')
      return
    }
    setCandidateQuery(query)
    setCandidates(ranked)
    setCandidateContext({ category, quantity })
    setMessage('Nama barang tidak exact. Pilih kandidat yang benar sebelum transaksi.')
  }

  const handleText = (raw: string) => {
    const command = parseVoiceCommand(raw)
    setInput(raw)
    setStatus('processing')

    if (command.intent === 'CANCEL') {
      resetDraft()
      return
    }
    if (command.intent === 'RETRY') {
      setStatus('idle')
      setMessage('Silakan ucapkan atau ketik ulang perintah.')
      return
    }
    if (command.intent === 'PRODUCT_CORRECTION') {
      if (!pending) {
        setStatus('error')
        setMessage('Belum ada transaksi pending yang dapat dikoreksi.')
        return
      }
      let next = pending
      if (command.quantity && command.quantity > 0) next = { ...next, quantity: command.quantity }
      if (command.productQuery) {
        const ranked = resolveProducts(products, command.productQuery)
        if (ranked[0]?.exact) next = { ...next, product: ranked[0].product }
        else {
          setCandidateQuery(command.productQuery)
          setCandidates(ranked)
          setCandidateContext({ category: next.category, quantity: next.quantity })
          setMessage('Pilih barang pengganti yang benar.')
          setStatus('idle')
          return
        }
      }
      setPending(next)
      setMessage('Draft transaksi diperbarui. Belum ada perubahan database.')
      setStatus('idle')
      return
    }
    if (command.intent === 'CREATE_PRODUCT') {
      setCreateDraft({
        name: command.productQuery ?? '',
        brand: '',
        stock: command.stock != null ? String(command.stock) : '',
        price: command.price != null ? String(command.price) : '',
      })
      setPending(null)
      setCandidates([])
      setMessage('Lengkapi dan periksa data barang sebelum disimpan.')
      setStatus('idle')
      return
    }
    if (command.intent === 'TRANSACTION_IN' || command.intent === 'TRANSACTION_OUT') {
      const quantity = command.quantity ?? 0
      if (!command.productQuery || !Number.isSafeInteger(quantity) || quantity <= 0) {
        setStatus('error')
        setMessage('Perintah belum lengkap. Sebutkan nama barang dan qty, misalnya “jual dua lampu”.')
        return
      }
      resolveForTransaction(command.productQuery, command.intent === 'TRANSACTION_IN' ? 'masuk' : 'keluar', quantity)
      setStatus('idle')
      return
    }

    if (command.productQuery) {
      setCandidateQuery(command.productQuery)
      setCandidates(resolveProducts(products, command.productQuery))
      setCandidateContext({})
      setMessage('Saya menemukan nama barang, tetapi belum ada jenis transaksi. Pilih kandidat lalu berikan perintah masuk/keluar.')
      setStatus('idle')
      return
    }

    setStatus('error')
    setMessage('Perintah belum dapat dipahami. Coba “barang masuk 10 kabel” atau “jual 2 charger”.')
  }

  const startListening = () => {
    const Ctor = speechCtor()
    if (!Ctor) {
      setStatus('error')
      setMessage('SpeechRecognition tidak didukung browser ini. Gunakan input teks.')
      return
    }
    recognition.current?.stop()
    const instance = new Ctor()
    instance.lang = 'id-ID'
    instance.continuous = false
    instance.interimResults = false
    instance.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim() ?? ''
      if (!transcript) {
        setStatus('error')
        setMessage('Suara tidak terbaca. Coba lagi atau gunakan input teks.')
        return
      }
      handleText(transcript)
    }
    instance.onerror = (event) => {
      setStatus('error')
      setMessage(event.error === 'not-allowed' ? 'Microphone tidak mendapat izin. Gunakan input teks atau izinkan microphone.' : `Microphone error: ${event.error}`)
    }
    instance.onend = () => setStatus((current) => current === 'listening' ? 'idle' : current)
    recognition.current = instance
    setStatus('listening')
    setMessage('Mendengarkan...')
    try {
      instance.start()
    } catch {
      setStatus('error')
      setMessage('Microphone belum dapat dimulai. Gunakan input teks.')
    }
  }

  useEffect(() => () => recognition.current?.stop(), [])

  const chooseCandidate = (candidate: ProductCandidate) => {
    if (candidateContext.category && candidateContext.quantity) {
      setPending({ product: candidate.product, category: candidateContext.category, quantity: candidateContext.quantity })
      setCandidates([])
      setMessage('Kandidat dipilih. Periksa detail sebelum konfirmasi.')
      return
    }
    setInput(candidate.product.namaBarang)
    setCandidates([])
    setMessage(`${candidate.product.namaBarang} dipilih. Tambahkan perintah transaksi, misalnya “jual 2 ${candidate.product.namaBarang}”.`)
  }

  const confirmTransaction = async () => {
    if (!pending) return
    if (pending.category === 'keluar' && pending.quantity > pending.product.stok) {
      setStatus('error')
      setMessage(`Stok tidak cukup. Stok tersedia ${pending.product.stok}.`)
      return
    }
    setStatus('processing')
    try {
      await onConfirm([{ product: pending.product, quantity: pending.quantity }], pending.category)
      setStatus('success')
      setMessage('Transaksi berhasil dan database telah diperbarui.')
      setPending(null)
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : 'Transaksi gagal')
    }
  }

  const saveProduct = async () => {
    if (!createDraft || !activeStore) return
    const stock = Number(createDraft.stock)
    const price = Number(createDraft.price)
    if (!createDraft.name.trim() || !createDraft.brand.trim() || !Number.isSafeInteger(stock) || stock < 0 || !Number.isFinite(price) || price < 0) {
      setStatus('error')
      setMessage('Nama, brand, stok, dan harga harus valid sebelum barang disimpan.')
      return
    }
    setStatus('processing')
    try {
      await addProduct({
        namaBarang: createDraft.name.trim(),
        brand: createDraft.brand.trim(),
        stok: stock,
        harga: price,
        barcode: '',
        storeId: activeStore.id,
      })
      setCreateDraft(null)
      setStatus('success')
      setMessage('Barang baru berhasil disimpan. Barcode dapat ditambahkan dari halaman produk.')
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : 'Barang gagal disimpan')
    }
  }

  const stateIcon = useMemo(() => {
    if (status === 'success') return <CircleCheck className="size-5 text-emerald-300" aria-hidden="true" />
    if (status === 'error') return <TriangleAlert className="size-5 text-amber-300" aria-hidden="true" />
    if (status === 'listening') return <AudioWaveform className="size-5 animate-pulse text-cyan-200" aria-hidden="true" />
    return <Sparkles className="size-5 text-teal-200" aria-hidden="true" />
  }, [status])

  return (
    <Dialog open onOpenChange={(open) => { if (!open && status !== 'processing') onClose() }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto border-white/12 bg-[#101827]/98 p-0 text-white shadow-2xl sm:max-w-2xl max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none max-sm:rounded-t-3xl">
        <DialogHeader className="border-b border-white/10 p-5 text-left">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-teal-300/12 text-teal-100"><Mic className="size-5" aria-hidden="true" /></div>
            <div>
              <DialogTitle className="text-white">Voice Inventory Assistant</DialogTitle>
              <DialogDescription className="text-white/55">Bahasa Indonesia · selalu konfirmasi sebelum mutasi stok</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5 p-5">
          <div role="status" aria-live="polite" className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.05] p-4 text-sm text-white/70">
            {stateIcon}<span>{message}</span>
          </div>

          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <Label htmlFor="voice-command" className="sr-only">Perintah suara atau teks</Label>
            <Input id="voice-command" data-testid="voice-command" value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && input.trim()) handleText(input) }} placeholder="Contoh: jual dua charger USB-C" className="h-12 border-white/12 bg-white/7 text-white" />
            <div className="flex gap-2">
              <Button type="button" aria-label="Mulai microphone" onClick={startListening} disabled={status === 'processing'} className="h-12 bg-teal-500 px-4 text-slate-950 hover:bg-teal-400"><Mic className="size-4" />{supported ? 'Bicara' : 'Mic unsupported'}</Button>
              <Button type="button" data-testid="voice-submit" variant="outline" className="h-12" disabled={!input.trim() || status === 'processing'} onClick={() => handleText(input)}><Sparkles className="size-4" />Proses</Button>
            </div>
          </div>

          {pending ? (
            <section data-testid="voice-confirmation" className="rounded-2xl border border-amber-300/20 bg-amber-300/8 p-4">
              <div className="flex items-center justify-between gap-3"><div><p className="text-xs uppercase tracking-wide text-amber-100/60">Konfirmasi {pending.category === 'keluar' ? 'Barang Keluar' : 'Barang Masuk'}</p><h3 className="mt-1 text-lg font-semibold">{pending.product.namaBarang}</h3><p className="text-sm text-white/55">{pending.product.brand}</p></div><Package className="size-7 text-amber-200" aria-hidden="true" /></div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div className="rounded-xl bg-black/15 p-3"><span className="block text-white/45">Qty</span><strong>{pending.quantity}</strong></div>
                <div className="rounded-xl bg-black/15 p-3"><span className="block text-white/45">Stok</span><strong>{pending.product.stok} → {stockAfter}</strong></div>
                <div className="rounded-xl bg-black/15 p-3"><span className="block text-white/45">Harga</span><strong>{formatCurrency(pending.product.harga)}</strong></div>
                <div className="rounded-xl bg-black/15 p-3"><span className="block text-white/45">Total</span><strong>{formatCurrency(pending.product.harga * pending.quantity)}</strong></div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2"><Button type="button" data-testid="voice-confirm" disabled={status === 'processing' || stockAfter < 0} onClick={confirmTransaction} className="bg-emerald-400 text-slate-950 hover:bg-emerald-300"><CircleCheck className="size-4" />Konfirmasi Transaksi</Button><Button type="button" variant="outline" onClick={() => setMessage('Ketik koreksi seperti “qty tiga” atau “bukan Provi maksud saya Panasonic”.')}><RefreshCw className="size-4" />Ubah</Button><Button type="button" variant="ghost" onClick={resetDraft}><CircleX className="size-4" />Batal</Button></div>
            </section>
          ) : null}

          {(candidates.length > 0 || candidateQuery) ? (
            <section data-testid="voice-suggestions" className="space-y-3 rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.05] p-4">
              <div><p className="font-semibold">Barang tidak ditemukan secara persis</p><p className="text-sm text-white/55">Anda mengatakan: <strong className="text-white">{candidateQuery}</strong></p></div>
              {candidates.length ? candidates.map((candidate) => (
                <button key={candidate.product.id} type="button" onClick={() => chooseCandidate(candidate)} className="flex min-h-20 w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.05] p-3 text-left transition hover:border-teal-300/30 hover:bg-teal-300/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-teal-300/10 text-teal-100"><Package className="size-5" /></span>
                  <span className="min-w-0 flex-1"><strong className="block truncate">{candidate.product.namaBarang}</strong><span className="text-xs text-white/50">{candidate.product.brand} · Stok {candidate.product.stok}</span></span>
                  <Badge className="bg-cyan-300/12 text-cyan-100">{candidate.confidence}%</Badge>
                </button>
              )) : <p className="rounded-xl border border-dashed border-white/12 p-4 text-sm text-white/55">Tidak ada kandidat yang cukup mirip.</p>}
              <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={startListening}><Mic className="size-4" />Coba Ucapkan Lagi</Button><Button type="button" variant="outline" onClick={() => document.getElementById('voice-command')?.focus()}>Ketik Nama</Button><Button type="button" variant="ghost" onClick={resetDraft}>Batal</Button></div>
            </section>
          ) : null}

          {createDraft ? (
            <section className="space-y-4 rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.05] p-4">
              <div><p className="font-semibold">Draft Barang Baru</p><p className="text-sm text-white/55">Speech hanya mengisi field yang dikenali. Periksa semua field sebelum simpan.</p></div>
              <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5 sm:col-span-2"><Label>Nama barang</Label><Input value={createDraft.name} onChange={(event) => setCreateDraft({ ...createDraft, name: event.target.value })} /></div><div className="space-y-1.5"><Label>Brand</Label><Input value={createDraft.brand} onChange={(event) => setCreateDraft({ ...createDraft, brand: event.target.value })} /></div><div className="space-y-1.5"><Label>Stok awal</Label><Input type="number" min="0" value={createDraft.stock} onChange={(event) => setCreateDraft({ ...createDraft, stock: event.target.value })} /></div><div className="space-y-1.5"><Label>Harga</Label><Input type="number" min="0" value={createDraft.price} onChange={(event) => setCreateDraft({ ...createDraft, price: event.target.value })} /></div></div>
              <div className="flex gap-2"><Button type="button" onClick={saveProduct} disabled={status === 'processing'} className="bg-emerald-400 text-slate-950 hover:bg-emerald-300">Simpan Barang</Button><Button type="button" variant="ghost" onClick={resetDraft}>Batal</Button></div>
            </section>
          ) : null}
        </div>

        <DialogFooter className="border-t border-white/10 bg-white/[0.03] p-4"><Button type="button" variant="outline" onClick={onClose} disabled={status === 'processing'}>Tutup</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
