import { useEffect, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { SpeechRecognition } from '@capgo/capacitor-speech-recognition'
import { BookOpen, Brain, CheckCircle2, Lightbulb, Mic, PackagePlus, Save, ScanLine, Square, TriangleAlert, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { ScannerDialog } from '@/components/inventory/scanner-dialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { lookupScannedProduct } from '@/lib/barcode-product-reference'
import { routes } from '@/lib/navigation'
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
import { cn } from '@/lib/utils'

type Recognition = {
  lang: string
  interimResults: boolean
  continuous: boolean
  onstart: (() => void) | null
  onend: (() => void) | null
  onerror: ((event: { error: string }) => void) | null
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  start(): void
  stop(): void
  abort(): void
}

type VoiceWindow = Window & {
  SpeechRecognition?: new () => Recognition
  webkitSpeechRecognition?: new () => Recognition
}

type State = 'idle' | 'permission' | 'listening' | 'processing' | 'review' | 'saving' | 'success' | 'error'

type VoiceMatch = ReturnType<typeof matchVoiceProducts>[number]

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

function voiceProductLabel(product: Product | undefined, fallback: string) {
  if (!product) return fallback
  return [product.namaBarang, product.brand].filter(Boolean).join(' ')
}

function autoMatch(matches: ReturnType<typeof matchVoiceProducts>): VoiceMatch | undefined {
  if (!matches.length) return undefined

  const exactMatches = matches.filter(match => match.score >= 0.999)
  if (exactMatches.length === 1) return exactMatches[0]

  const [first, second] = matches
  if (first.score >= 0.92 && (!second || first.score - second.score >= 0.18)) return first
  return undefined
}

function matchLabel(score: number) {
  if (score >= 0.999) return '100% cocok'
  return `${Math.round(score * 100)}% mirip`
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
  const navigate = useNavigate()
  const [state, setState] = useState<State>('idle')
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState('')
  const [command, setCommand] = useState<VoiceCommand | null>(null)
  const [choices, setChoices] = useState<Record<number, string>>({})
  const [showAlternatives, setShowAlternatives] = useState<Record<number, boolean>>({})
  const [createDraft, setCreateDraft] = useState<VoiceProductDraft | null>(null)
  const [barcodeScannerOpen, setBarcodeScannerOpen] = useState(false)
  const [successMessage, setSuccessMessage] = useState('Stok dan history berhasil diperbarui.')
  const recognition = useRef<Recognition | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const busy = useRef(false)
  const alive = useRef(true)
  const latestTranscript = useRef('')
  const failed = useRef(false)
  const nativeSession = useRef(false)
  const nativeGeneration = useRef(0)

  const cancelAudio = () => {
    nativeGeneration.current += 1
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    const current = recognition.current
    recognition.current = null
    if (current) {
      current.onend = null
      current.onresult = null
      current.onerror = null
      current.onstart = null
      current.abort()
    }
    if (nativeSession.current) {
      nativeSession.current = false
      void SpeechRecognition.stop().catch(() => undefined)
    }
  }

  const focusTextFallback = () => {
    window.setTimeout(() => document.getElementById('voice-transcript')?.focus(), 0)
  }

  const failToTextFallback = (message: string) => {
    setError(message)
    setState('error')
    cancelAudio()
    focusTextFallback()
  }

  const resetDraft = () => {
    setCommand(null)
    setChoices({})
    setShowAlternatives({})
    setCreateDraft(null)
    setBarcodeScannerOpen(false)
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
    const alternatives: Record<number, boolean> = {}

    parsed.items.forEach((item, index) => {
      const matches = matchVoiceProducts(item.query, products)
      const best = autoMatch(matches)
      if (best) selected[index] = best.product.id
      alternatives[index] = !best && matches.length > 0
    })

    setCommand(parsed)
    setCreateDraft(null)
    setChoices(selected)
    setShowAlternatives(alternatives)
    setState('review')
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
    if (edit.action === 'cancel') {
      resetDraft()
      onClose()
      return true
    }
    if (edit.action === 'retry') {
      resetDraft()
      start()
      return true
    }
    if (!isTransactionCommand(command)) {
      setError('Belum ada draft transaksi untuk diperbaiki.')
      setState('error')
      return true
    }

    if (edit.action === 'quantity') {
      const index = findCommandItem(command, edit.query)
      if (index < 0) {
        setError('Sebutkan barang yang jumlahnya ingin diubah.')
        setState('review')
        return true
      }
      setCommand({ ...command, items: command.items.map((item, itemIndex) => itemIndex === index ? { ...item, quantity: edit.quantity } : item) })
      setError('')
      setState('review')
      return true
    }

    if (edit.action !== 'product') return true
    const index = findCommandItem(command, edit.from)
    if (index < 0) {
      setError('Barang yang ingin diganti belum jelas.')
      setState('review')
      return true
    }

    const matches = matchVoiceProducts(edit.query, products)
    if (!matches.length) {
      setError('Produk pengganti tidak ditemukan. Ketik nama yang lebih lengkap.')
      setState('review')
      return true
    }

    const best = autoMatch(matches) ?? matches[0]
    setCommand({ ...command, items: command.items.map((item, itemIndex) => itemIndex === index ? { ...item, query: edit.query } : item) })
    setChoices(current => ({ ...current, [index]: best.product.id }))
    setShowAlternatives(current => ({ ...current, [index]: false }))
    setError('')
    setState('review')
    return true
  }

  const interpret = (text: string) => {
    cancelAudio()
    setState('processing')
    setError('')
    try {
      const edit = parseVoiceDraftEdit(text)
      if (edit && applyDraftEdit(edit)) return
      resetDraft()
      const parsed = parseVoiceCommand(text)
      if (parsed.intent === 'create_product') {
        setCommand(parsed)
        setCreateDraft(parsed.draft)
        setChoices({})
        setShowAlternatives({})
        setState('review')
        return
      }
      applyTransactionCommand(parsed)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Saya belum memahami perintah tersebut.')
      setState('error')
    }
  }

  const startNative = async (generation: number) => {
    try {
      let permission = await SpeechRecognition.checkPermissions()
      if (generation !== nativeGeneration.current) return
      if (permission.speechRecognition !== 'granted') {
        permission = await SpeechRecognition.requestPermissions()
        if (generation !== nativeGeneration.current) return
      }
      if (permission.speechRecognition !== 'granted') {
        failToTextFallback('Izin mikrofon aplikasi belum diberikan. Aktifkan izin Mikrofon untuk ABElektronik di Pengaturan Android, lalu coba lagi.')
        return
      }

      const { available } = await SpeechRecognition.available()
      if (generation !== nativeGeneration.current) return
      if (!available) {
        failToTextFallback('Layanan pengenal suara Android tidak tersedia. Aktifkan aplikasi pengenal suara di perangkat, lalu coba lagi.')
        return
      }

      nativeSession.current = true
      setState('listening')
      const result = await SpeechRecognition.start({
        language: 'id-ID',
        maxResults: 1,
        popup: true,
        partialResults: false,
        prompt: 'Ucapkan perintah inventory',
      })
      if (generation !== nativeGeneration.current) return
      nativeSession.current = false
      const spoken = result.matches?.[0]?.trim()
      if (spoken) {
        setTranscript(spoken)
        interpret(spoken)
      } else {
        failToTextFallback('Suara belum terdengar jelas. Coba lagi atau ketik perintah.')
      }
    } catch (cause) {
      if (generation !== nativeGeneration.current) return
      nativeSession.current = false
      const detail = cause instanceof Error ? cause.message : String(cause)
      const permission = await SpeechRecognition.checkPermissions().catch(() => null)
      if (generation !== nativeGeneration.current) return
      failToTextFallback(permission?.speechRecognition === 'denied'
        ? 'Izin mikrofon aplikasi ditolak. Aktifkan izin Mikrofon untuk ABElektronik di Pengaturan Android.'
        : `Pengenalan suara Android gagal: ${detail}. Coba lagi atau ketik perintah.`)
    }
  }

  const start = () => {
    cancelAudio()
    setError('')
    resetDraft()
    setTranscript('')
    latestTranscript.current = ''
    failed.current = false

    if (Capacitor.isNativePlatform()) {
      setState('permission')
      void startNative(nativeGeneration.current)
      return
    }

    const Constructor = (window as VoiceWindow).SpeechRecognition ?? (window as VoiceWindow).webkitSpeechRecognition
    if (!isSpeechSecureContext()) {
      failToTextFallback(insecureSpeechOriginMessage())
      return
    }
    if (!Constructor) {
      failToTextFallback('SpeechRecognition tidak tersedia di browser ini. Ketik perintah di bawah atau gunakan dikte keyboard Bahasa Indonesia.')
      return
    }
    if (!navigator.onLine) {
      failToTextFallback('Browser sedang offline. Sambungkan internet atau ketik perintah di bawah.')
      return
    }

    setState('permission')
    try {
      const current = new Constructor()
      recognition.current = current
      current.lang = 'id-ID'
      current.interimResults = true
      current.continuous = false
      current.onstart = () => setState('listening')
      current.onresult = event => {
        const text = Array.from(event.results).map(result => result[0].transcript).join(' ')
        latestTranscript.current = text
        setTranscript(text)
      }
      current.onerror = event => {
        failed.current = true
        const messages: Record<string, string> = {
          'not-allowed': 'Izin microphone ditolak. Izinkan microphone di pengaturan browser atau ketik perintah.',
          'audio-capture': 'Microphone tidak tersedia. Periksa perangkat atau ketik perintah.',
          'no-speech': 'Suara belum terdengar. Coba lagi dan bicara lebih jelas.',
          network: 'Layanan speech browser gagal tersambung. Ketik perintah di bawah lalu klik Pahami perintah.',
          'service-not-allowed': 'Layanan suara browser tidak tersedia. Gunakan input teks.',
        }
        failToTextFallback(messages[event.error] ?? 'Pengenalan suara gagal. Coba lagi atau ketik perintah.')
      }
      current.onend = () => {
        if (failed.current) return
        if (latestTranscript.current.trim()) interpret(latestTranscript.current)
        else {
          setError('Suara belum jelas. Coba lagi atau ketik perintah.')
          setState('error')
          cancelAudio()
        }
      }
      current.start()
      timer.current = setTimeout(() => {
        if (latestTranscript.current.trim()) interpret(latestTranscript.current)
        else {
          cancelAudio()
          setError('Waktu mendengarkan habis. Coba lagi.')
          setState('error')
        }
      }, 20000)
    } catch {
      failToTextFallback('Microphone tidak dapat dimulai. Gunakan HTTPS/localhost dan izinkan microphone, atau ketik perintah.')
    }
  }

  const finishAudio = () => {
    if (Capacitor.isNativePlatform()) {
      cancelAudio()
      setState('idle')
      return
    }
    recognition.current?.stop()
  }

  useEffect(() => {
    alive.current = true
    start()
    return () => {
      alive.current = false
      cancelAudio()
    }
    // Start one recognition session per dialog, not on inventory updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const transactionCommand = isTransactionCommand(command) ? command : null
  const resolved = transactionCommand?.items.map((item, index) => ({
    product: products.find(product => product.id === choices[index]),
    quantity: item.quantity,
  })) ?? []
  const totals = new Map<string, number>()
  for (const item of resolved) {
    if (item.product) totals.set(item.product.id, (totals.get(item.product.id) ?? 0) + item.quantity)
  }
  const insufficient = transactionCommand?.category === 'keluar' && resolved.some(item => item.product && (totals.get(item.product.id) ?? 0) > item.product.stok)
  const canConfirm = resolved.length > 0 && resolved.every(item => item.product) && !insufficient
  const exampleTranscript = `transaksi ${voiceProductLabel(products[0], 'Charger Samsung 25W')} dua`
  const hasTranscript = transcript.trim().length > 0
  const draftBarcode = createDraft?.barcode.trim() ?? ''
  const validCreate = Boolean(createDraft?.name.trim() && draftBarcode && activeStoreId && onCreateProduct
    && Number.isSafeInteger(createDraft.stock) && (createDraft.stock ?? -1) >= 0
    && (createDraft.price === null || (Number.isFinite(createDraft.price) && createDraft.price >= 0)))
  const duplicateBarcode = Boolean(draftBarcode && products.some(product => product.storeId === activeStoreId && product.barcode === draftBarcode))
  const locked = state === 'saving' || state === 'success'

  const openVoiceGuide = () => {
    cancelAudio()
    onClose()
    navigate(`${routes.settings}?guide=voice`)
  }

  return (
    <Dialog open onOpenChange={open => { if (!open && !busy.current) onClose() }}>
      <DialogContent
        className="voice-sheet box-border max-h-[90dvh] overflow-y-auto border-white/12 bg-[#121827] text-white shadow-2xl sm:max-w-lg max-lg:inset-x-0 max-lg:bottom-0 max-lg:top-auto max-lg:w-dvw max-lg:max-w-none max-lg:translate-x-0 max-lg:translate-y-0 max-lg:rounded-b-none max-lg:rounded-t-3xl"
        showCloseButton={state !== 'saving'}
      >
        <DialogHeader>
          <div className="flex items-start justify-between gap-3 pr-7">
            <div>
              <DialogTitle className="flex items-center gap-2 text-xl">
                <Mic className={state === 'listening' ? 'voice-pulse text-emerald-300' : 'text-emerald-300'} />
                Voice AI
              </DialogTitle>
              <DialogDescription className="mt-1">Ucapkan perintah, lalu periksa hasilnya sebelum konfirmasi.</DialogDescription>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={openVoiceGuide} className="shrink-0 border-white/15 bg-white/[0.06]">
              <BookOpen className="size-4" />
              Panduan Voice
            </Button>
          </div>
        </DialogHeader>

        <div className={`voice-visual voice-visual-${state}`}>
          <button
            type="button"
            aria-label={state === 'listening' ? 'Selesai bicara' : 'Mulai dengarkan'}
            disabled={locked || state === 'permission' || state === 'processing'}
            onClick={state === 'listening' ? finishAudio : start}
          >
            <Mic size={27} />
          </button>
          <strong>{state === 'listening' ? 'Saya mendengarkan' : state === 'review' ? 'Periksa hasil voice' : state === 'success' ? 'Selesai' : 'Siap mendengarkan'}</strong>
          <span>{state === 'listening' ? 'Ucapkan perintah dengan jelas.' : labels[state]}</span>
          {state === 'listening' && <div className="voice-wave" aria-hidden="true">{Array.from({ length: 15 }, (_, index) => <i key={index} style={{ animationDelay: `${index * 70}ms` }} />)}</div>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="voice-transcript">Hasil voice / perintah</Label>
          <Textarea
            id="voice-transcript"
            value={transcript}
            disabled={locked || state === 'listening' || state === 'permission'}
            placeholder={exampleTranscript}
            onChange={event => {
              setTranscript(event.target.value)
              setError('')
              if (state === 'error') setState('idle')
            }}
          />
        </div>

        {error && <p role="alert" className="rounded-xl bg-rose-400/10 p-3 text-rose-100">{error}</p>}
        {state === 'error' && !hasTranscript && products.length > 0 && (
          <p className="rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-sm text-amber-100">
            Kolom perintah masih kosong. Ketik perintah sendiri atau pakai contoh.
          </p>
        )}

        {state !== 'success' && (
          <div className="flex flex-wrap gap-2">
            {state === 'listening' || state === 'permission'
              ? <Button onClick={finishAudio}><Square />Selesai bicara</Button>
              : <Button variant="outline" disabled={locked} onClick={start}><Mic />{state === 'idle' ? 'Mulai Dengarkan' : 'Coba Lagi'}</Button>}
            {state === 'error' && !hasTranscript && products.length > 0 && (
              <Button variant="outline" disabled={locked} onClick={() => { setTranscript(exampleTranscript); setError(''); setState('idle'); focusTextFallback() }}>
                <Lightbulb className="size-4" />Pakai Contoh
              </Button>
            )}
            <Button variant="outline" disabled={locked || !hasTranscript || state === 'listening' || state === 'permission'} onClick={() => interpret(transcript)}>
              <Brain className="size-4" />Pahami perintah
            </Button>
          </div>
        )}

        {transactionCommand && state !== 'success' && (
          <section className="space-y-3" aria-label="Konfirmasi transaksi suara">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-white/45">Hasil Voice</p>
                <h2 className="text-lg font-semibold">{transactionCommand.category === 'masuk' ? 'Barang Masuk' : 'Barang Keluar'}</h2>
              </div>
              <span className="rounded-full bg-white/[0.07] px-3 py-1 text-xs text-white/60">{transactionCommand.items.length} item</span>
            </div>

            {transactionCommand.items.map((item, index) => {
              const matches = matchVoiceProducts(item.query, products)
              const selected = resolved[index]?.product
              const selectedMatch = selected ? matches.find(match => match.product.id === selected.id) : undefined
              const alternativesVisible = showAlternatives[index] || !selected

              return (
                <div key={`${item.query}-${index}`} className="rounded-2xl border border-white/15 bg-white/[0.05] p-4">
                  {selected ? (
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs text-white/45">Produk terdeteksi</p>
                          <p className="truncate text-base font-semibold text-white">{selected.namaBarang}</p>
                          <p className="truncate text-sm text-white/55">{selected.brand} · stok {selected.stok}</p>
                        </div>
                        {selectedMatch && (
                          <span className={cn(
                            'shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold',
                            selectedMatch.score >= 0.999 ? 'bg-emerald-300/15 text-emerald-100' : 'bg-cyan-300/12 text-cyan-100',
                          )}>
                            {matchLabel(selectedMatch.score)}
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2 rounded-xl bg-black/15 p-3 text-sm">
                        <div><span className="block text-xs text-white/45">Qty</span><strong>{item.quantity}</strong></div>
                        <div><span className="block text-xs text-white/45">Setelah transaksi</span><strong>{selected.stok + (transactionCommand.category === 'masuk' ? 1 : -1) * (totals.get(selected.id) ?? 0)} stok</strong></div>
                      </div>
                      {matches.length > 1 && (
                        <button
                          type="button"
                          className="text-sm font-medium text-cyan-200 underline-offset-4 hover:underline"
                          onClick={() => setShowAlternatives(current => ({ ...current, [index]: !current[index] }))}
                        >
                          {alternativesVisible ? 'Sembunyikan pilihan lain' : 'Bukan barang ini? Pilih data lain'}
                        </button>
                      )}
                    </div>
                  ) : (
                    <p className="flex gap-2 text-amber-200">
                      <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                      {matches.length ? 'Belum ada satu kecocokan yang pasti. Pilih barang yang dimaksud.' : 'Produk tidak ditemukan. Perbaiki perintah Anda.'}
                    </p>
                  )}

                  {alternativesVisible && matches.length > 0 && (
                    <div className="mt-3 grid gap-2" aria-label={`Kandidat untuk ${item.query}`}>
                      {matches.map(match => {
                        const active = choices[index] === match.product.id
                        return (
                          <button
                            key={match.product.id}
                            type="button"
                            disabled={locked}
                            aria-label={`${match.product.namaBarang} ${match.product.brand} ${matchLabel(match.score)}`}
                            onClick={() => {
                              setChoices(current => ({ ...current, [index]: match.product.id }))
                              setShowAlternatives(current => ({ ...current, [index]: false }))
                            }}
                            className={cn(
                              'flex min-h-16 w-full items-center justify-between gap-3 rounded-xl border p-3 text-left transition',
                              active ? 'border-emerald-200/70 bg-emerald-300/15 text-emerald-50' : 'border-white/10 bg-white/[0.06] text-white hover:border-cyan-200/40 hover:bg-cyan-300/10',
                            )}
                          >
                            <span className="min-w-0">
                              <span className="block truncate font-semibold">{match.product.namaBarang}</span>
                              <span className="block truncate text-sm opacity-70">{match.product.brand} · stok {match.product.stok}</span>
                            </span>
                            <span className="shrink-0 rounded-full bg-black/25 px-2 py-1 font-mono text-xs">{matchLabel(match.score)}</span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}

            {insufficient && <p role="alert" className="text-rose-200">Stok tidak cukup. Kurangi jumlah pada perintah Anda.</p>}

            <Button
              className="w-full bg-emerald-300 text-slate-950 hover:bg-emerald-200"
              disabled={!canConfirm || locked}
              onClick={async () => {
                if (busy.current || !canConfirm) return
                busy.current = true
                setState('saving')
                setError('')
                cancelAudio()
                try {
                  const items = [...totals].map(([id, quantity]) => ({ product: products.find(product => product.id === id)!, quantity }))
                  await onConfirm(items, transactionCommand.category)
                  if (alive.current) {
                    setSuccessMessage('Stok dan history berhasil diperbarui.')
                    setState('success')
                  }
                } catch (cause) {
                  if (alive.current) {
                    setState('review')
                    setError(cause instanceof Error ? cause.message : 'Transaksi gagal. Silakan coba lagi.')
                  }
                } finally {
                  busy.current = false
                }
              }}
            >
              <CheckCircle2 className="size-4" />
              {state === 'saving' ? 'Menyimpan...' : 'Konfirmasi'}
            </Button>
          </section>
        )}

        {createDraft && state !== 'success' && (
          <section className="space-y-3" aria-label="Draft barang baru">
            <div className="flex items-center gap-2">
              <PackagePlus className="size-5 text-cyan-200" />
              <h2 className="text-lg font-semibold">Tambah Barang Baru</h2>
            </div>
            <div className="grid gap-3 rounded-2xl border border-white/15 bg-white/[0.05] p-4 sm:grid-cols-2">
              <label className="space-y-1 text-sm sm:col-span-2">Nama Barang Baru
                <Input value={createDraft.name} disabled={locked} className="border-white/20 bg-slate-900 text-white" onChange={event => setCreateDraft(draft => draft ? { ...draft, name: event.target.value } : draft)} />
              </label>
              <label className="space-y-1 text-sm">Merek / Brand (opsional)
                <Input value={createDraft.brand} disabled={locked} className="border-white/20 bg-slate-900 text-white" onChange={event => setCreateDraft(draft => draft ? { ...draft, brand: event.target.value } : draft)} />
              </label>
              <label className="space-y-1 text-sm">Stok Awal
                <Input inputMode="numeric" value={createDraft.stock ?? ''} disabled={locked} className="border-white/20 bg-slate-900 text-white" onChange={event => setCreateDraft(draft => draft ? { ...draft, stock: numericValue(event.target.value) } : draft)} />
              </label>
              <label className="space-y-1 text-sm">Harga Jual (opsional)
                <Input inputMode="numeric" value={createDraft.price ?? ''} disabled={locked} className="border-white/20 bg-slate-900 text-white" onChange={event => setCreateDraft(draft => draft ? { ...draft, price: numericValue(event.target.value) } : draft)} />
              </label>
              <div className="space-y-1 text-sm sm:col-span-2">
                <Label htmlFor="voice-new-barcode" className="text-sm text-white">Barcode Baru</Label>
                <div className="flex gap-2">
                  <Input id="voice-new-barcode" value={createDraft.barcode} disabled={locked} className="border-white/20 bg-slate-900 text-white" onChange={event => setDraftBarcode(event.target.value)} />
                  <Button type="button" variant="outline" disabled={locked} onClick={() => setBarcodeScannerOpen(true)} aria-label="Scan Barcode">
                    <ScanLine className="size-4" />Scan Barcode
                  </Button>
                </div>
              </div>
            </div>

            {duplicateBarcode && <p role="alert" className="rounded-xl bg-rose-400/10 p-3 text-rose-100">Barcode sudah dipakai di toko ini.</p>}
            {!draftBarcode && <p className="rounded-xl border border-cyan-300/20 bg-cyan-300/10 p-3 text-sm text-cyan-50">Isi barcode manual atau scan barcode sebelum menyimpan.</p>}
            {!activeStoreId && <p role="alert" className="rounded-xl bg-amber-400/10 p-3 text-sm text-amber-100">Pilih toko aktif sebelum menyimpan barang baru.</p>}

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

            <Button
              className="w-full bg-cyan-300 text-slate-950 hover:bg-cyan-200"
              disabled={!validCreate || duplicateBarcode || locked}
              onClick={async () => {
                if (busy.current || !validCreate || !createDraft || !activeStoreId || !onCreateProduct) return
                busy.current = true
                setState('saving')
                setError('')
                cancelAudio()
                try {
                  await onCreateProduct({
                    storeId: activeStoreId,
                    namaBarang: createDraft.name.trim(),
                    brand: createDraft.brand.trim() || 'Tanpa Merek',
                    harga: createDraft.price ?? 0,
                    stok: createDraft.stock ?? 0,
                    barcode: draftBarcode,
                  })
                  if (alive.current) {
                    setSuccessMessage('Barang baru berhasil ditambahkan.')
                    setState('success')
                  }
                } catch (cause) {
                  if (alive.current) {
                    setState('review')
                    setError(cause instanceof Error ? cause.message : 'Barang baru gagal disimpan.')
                  }
                } finally {
                  busy.current = false
                }
              }}
            >
              <Save className="size-4" />
              {state === 'saving' ? 'Menyimpan...' : 'Simpan Barang Baru'}
            </Button>
          </section>
        )}

        {state === 'success' && <p className="flex gap-2 text-emerald-200"><CheckCircle2 />{successMessage}</p>}

        <Button variant="outline" disabled={state === 'saving'} onClick={onClose}>
          {state === 'success' ? <CheckCircle2 className="size-4" /> : <X className="size-4" />}
          {state === 'success' ? 'Selesai' : 'Batalkan'}
        </Button>
      </DialogContent>
    </Dialog>
  )
}
