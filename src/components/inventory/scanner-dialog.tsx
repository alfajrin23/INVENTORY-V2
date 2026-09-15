import { Capacitor } from '@capacitor/core'
import { SpeechRecognition } from '@capgo/capacitor-speech-recognition'
import { Barcode, Camera, LoaderCircle, Mic, PackageSearch, Plus, Search, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { Html5Qrcode as Html5QrcodeInstance } from 'html5-qrcode'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { extractBarcodeValue, normalizeBarcodeValue } from '@/lib/barcode-product-reference'
import { matchProduct } from '@/lib/format'
import type { Product } from '@/lib/types'
import { cn } from '@/lib/utils'

type ScannerDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  products: Product[]
  onDetected: (product: Product) => void
  onRawBarcode?: (barcode: string) => void
  onMissingBarcode?: (barcode: string) => void
  title?: string
  description?: string
}

type ScannerFrameSize = {
  width: number
  height: number
}

type WebRecognition = {
  lang: string
  interimResults: boolean
  continuous: boolean
  onstart: (() => void) | null
  onend: (() => void) | null
  onerror: ((event: { error: string }) => void) | null
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  start(): void
  stop(): void
  abort(): void
}

type ScannerVoiceWindow = Window & {
  SpeechRecognition?: new () => WebRecognition
  webkitSpeechRecognition?: new () => WebRecognition
}

const INITIAL_RESULT_LIMIT = 60

function barcodeFrameSize(width: number, height: number): ScannerFrameSize {
  const safeWidth = Math.max(1, width - 48)
  const safeHeight = Math.max(1, height - 72)
  const frameWidth = Math.min(Math.max(230, Math.floor(width * 0.84)), safeWidth)
  const frameHeight = Math.min(
    Math.max(112, Math.floor(frameWidth * 0.46)),
    Math.floor(height * 0.38),
    safeHeight,
    230,
  )

  return { width: frameWidth, height: frameHeight }
}

export function ScannerDialog({
  open,
  onOpenChange,
  products,
  onDetected,
  onRawBarcode,
  onMissingBarcode,
  title = 'Scanner Barcode',
  description = 'Pilih barang dari barcode atau pencarian. Transaksi tetap perlu dikonfirmasi.',
}: ScannerDialogProps) {
  const [scannerId] = useState(() => {
    const token =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID().slice(0, 8)
        : Date.now().toString(36)
    return `barcode-scanner-${token}`
  })
  const scannerRef = useRef<Html5QrcodeInstance | null>(null)
  const cameraAreaRef = useRef<HTMLDivElement | null>(null)
  const resolverRef = useRef<(barcode: string) => void>(() => {})
  const handledBarcodeRef = useRef('')
  const webRecognitionRef = useRef<WebRecognition | null>(null)
  const [cameraStatus, setCameraStatus] = useState<'idle' | 'active' | 'error'>('idle')
  const [manualBarcode, setManualBarcode] = useState('')
  const [search, setSearch] = useState('')
  const [missingBarcode, setMissingBarcode] = useState('')
  const [frameSize, setFrameSize] = useState<ScannerFrameSize | null>(null)
  const [visibleCount, setVisibleCount] = useState(INITIAL_RESULT_LIMIT)
  const [listening, setListening] = useState(false)
  const [speechError, setSpeechError] = useState('')
  const debouncedSearch = useDebouncedValue(search, 220)

  const allSuggestions = useMemo(() => {
    if (!debouncedSearch.trim()) return products.slice(0, 5)
    return products.filter((product) => matchProduct(product, debouncedSearch))
  }, [debouncedSearch, products])

  const suggestions = useMemo(
    () => allSuggestions.slice(0, Math.max(INITIAL_RESULT_LIMIT, visibleCount)),
    [allSuggestions, visibleCount],
  )

  useEffect(() => setVisibleCount(INITIAL_RESULT_LIMIT), [debouncedSearch])

  const resolveBarcode = useCallback((barcode: string) => {
    const raw = barcode.trim()
    const normalized = extractBarcodeValue(raw) || (/^[A-Za-z0-9._-]{1,80}$/.test(raw) ? normalizeBarcodeValue(raw) : '')
    const handledKey = normalized || raw
    if (!raw || handledBarcodeRef.current === handledKey) return

    onRawBarcode?.(raw)
    const product = normalized ? products.find((item) => normalizeBarcodeValue(item.barcode) === normalized) : null
    if (product) {
      handledBarcodeRef.current = handledKey
      setMissingBarcode('')
      navigator.vibrate?.(160)
      onDetected(product)
      return
    }

    setManualBarcode(handledKey)
    setMissingBarcode(handledKey)
  }, [onDetected, onRawBarcode, products])

  useEffect(() => { resolverRef.current = resolveBarcode }, [resolveBarcode])

  useEffect(() => {
    if (!open) return
    const cameraArea = cameraAreaRef.current
    if (!cameraArea) return

    const updateFrameSize = () => {
      const rect = cameraArea.getBoundingClientRect()
      setFrameSize(barcodeFrameSize(rect.width, rect.height))
    }

    updateFrameSize()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateFrameSize)
      return () => window.removeEventListener('resize', updateFrameSize)
    }

    const observer = new ResizeObserver(updateFrameSize)
    observer.observe(cameraArea)
    return () => observer.disconnect()
  }, [open])

  useEffect(() => {
    if (!open) return

    handledBarcodeRef.current = ''
    setCameraStatus('idle')
    let cancelled = false

    const timer = window.setTimeout(async () => {
      try {
        if (cancelled) return
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode')
        if (cancelled) return

        const scanner = new Html5Qrcode(scannerId, {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
          ],
          verbose: false,
        })
        scannerRef.current = scanner

        scanner
          .start(
            { facingMode: 'environment' },
            { fps: 10, qrbox: (width, height) => barcodeFrameSize(width, height) },
            (decodedText) => {
              if (handledBarcodeRef.current === decodedText) return
              resolverRef.current(decodedText)
            },
            undefined,
          )
          .then(async () => {
            if (cancelled) { await scanner.stop(); scanner.clear(); return }
            setCameraStatus('active')
          })
          .catch(() => { if (!cancelled) setCameraStatus('error') })
      } catch {
        if (!cancelled) setCameraStatus('error')
      }
    }, 220)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
      const instance = scannerRef.current
      scannerRef.current = null
      if (instance) {
        void (async () => {
          try {
            if (instance.isScanning) await instance.stop()
            instance.clear()
          } catch { /* Camera startup may still be pending; its completion handler also stops it. */ }
        })()
      }
    }
  }, [open, scannerId])

  useEffect(() => () => {
    webRecognitionRef.current?.abort()
    webRecognitionRef.current = null
    if (Capacitor.isNativePlatform()) void SpeechRecognition.stop().catch(() => undefined)
  }, [])

  const submitManualBarcode = () => resolveBarcode(manualBarcode)

  const applyVoiceResult = (text: string) => {
    const value = text.trim()
    setListening(false)
    if (!value) {
      setSpeechError('Suara belum terdengar jelas. Coba lagi.')
      return
    }
    setSpeechError('')
    setSearch(value)
    setVisibleCount(INITIAL_RESULT_LIMIT)
  }

  const startVoiceSearch = async () => {
    setSpeechError('')
    if (listening) {
      if (Capacitor.isNativePlatform()) await SpeechRecognition.stop().catch(() => undefined)
      webRecognitionRef.current?.stop()
      setListening(false)
      return
    }

    navigator.vibrate?.(35)
    if (Capacitor.isNativePlatform()) {
      setListening(true)
      try {
        let permission = await SpeechRecognition.checkPermissions()
        if (permission.speechRecognition !== 'granted') permission = await SpeechRecognition.requestPermissions()
        if (permission.speechRecognition !== 'granted') {
          setListening(false)
          setSpeechError('Izin mikrofon ditolak. Izinkan Mikrofon di Pengaturan Android lalu coba lagi.')
          return
        }
        const availability = await SpeechRecognition.available()
        if (!availability.available) throw new Error('Pengenal suara Android tidak tersedia.')
        const result = await SpeechRecognition.start({
          language: 'id-ID',
          maxResults: 1,
          popup: true,
          partialResults: false,
          prompt: 'Ucapkan nama barang yang dicari',
        })
        applyVoiceResult(result.matches?.[0] ?? '')
      } catch (cause) {
        setListening(false)
        setSpeechError(cause instanceof Error ? cause.message : 'Pencarian suara gagal. Ketik nama barang pada kolom pencarian.')
      }
      return
    }

    const Constructor = (window as ScannerVoiceWindow).SpeechRecognition ?? (window as ScannerVoiceWindow).webkitSpeechRecognition
    if (!Constructor) {
      setSpeechError('Pencarian suara tidak tersedia di browser ini. Gunakan APK Android atau ketik nama barang.')
      return
    }
    try {
      const recognition = new Constructor()
      webRecognitionRef.current = recognition
      recognition.lang = 'id-ID'
      recognition.interimResults = false
      recognition.continuous = false
      recognition.onstart = () => setListening(true)
      recognition.onresult = event => applyVoiceResult(event.results[0]?.[0]?.transcript ?? '')
      recognition.onerror = event => {
        setListening(false)
        setSpeechError(event.error === 'not-allowed' ? 'Izin mikrofon ditolak. Izinkan mikrofon browser lalu coba lagi.' : 'Pencarian suara gagal. Coba lagi atau ketik nama barang.')
      }
      recognition.onend = () => setListening(false)
      recognition.start()
    } catch {
      setListening(false)
      setSpeechError('Mikrofon tidak dapat dimulai. Coba lagi atau ketik nama barang.')
    }
  }

  const frameStyle = {
    width: frameSize ? `${frameSize.width}px` : undefined,
    height: frameSize ? `${frameSize.height}px` : undefined,
    '--scanner-frame-height': frameSize ? `${frameSize.height}px` : '140px',
  } as CSSProperties

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="scanner-sheet max-h-[92dvh] overflow-y-auto border-slate-200 bg-white p-0 text-slate-950 shadow-2xl dark:border-white/12 dark:bg-[#111827]/98 dark:text-white sm:max-w-5xl lg:grid lg:grid-cols-[minmax(0,1.2fr)_24rem] max-lg:inset-0 max-lg:h-dvh max-lg:max-h-dvh max-lg:w-dvw max-lg:max-w-none max-lg:translate-x-0 max-lg:translate-y-0 max-lg:rounded-none max-lg:overflow-hidden max-lg:grid max-lg:grid-rows-[minmax(0,1fr)_auto]">
        <div ref={cameraAreaRef} data-scanner-camera className="scanner-camera relative h-[58dvh] min-h-[360px] overflow-hidden bg-black lg:h-auto lg:min-h-[560px]">
          <div id={scannerId} className="scanner-viewport absolute inset-0 [&_video]:h-full [&_video]:w-full [&_video]:object-contain [&_video]:bg-black" />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.65),transparent_18%,transparent_82%,rgba(0,0,0,0.65))]" />
          <div className="scanner-target-frame pointer-events-none absolute left-1/2 top-1/2 max-h-[38%] max-w-[calc(100%_-_3rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-cyan-300/70 shadow-[0_0_42px_rgba(0,210,255,0.22)]" style={frameStyle}>
            <div className="scanner-scanline absolute inset-x-4 top-0 h-1 rounded-full bg-rose-400 shadow-[0_0_18px_rgba(251,113,133,0.9)]" />
          </div>
          <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full border border-white/15 bg-black/50 px-3 py-1.5 text-xs text-white backdrop-blur-xl">
            <Camera className="size-3.5" />
            {cameraStatus === 'active' ? 'Kamera aktif' : cameraStatus === 'error' ? 'Kamera manual' : 'Menyiapkan'}
          </div>
          <Button type="button" variant="ghost" size="icon-lg" aria-label="Tutup scanner" onClick={() => onOpenChange(false)} className="scanner-close-button absolute rounded-full bg-black/50 text-white hover:bg-white/15">
            <X className="size-5" />
          </Button>
        </div>

        <div className="scanner-controls flex flex-col gap-5 overflow-y-auto p-5 lg:max-h-[92vh] lg:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl text-slate-950 dark:text-white">
              <Barcode className="size-5 text-cyan-600 dark:text-cyan-200" />
              {title}
            </DialogTitle>
            <DialogDescription className="text-slate-600 dark:text-white/58">{description}</DialogDescription>
          </DialogHeader>

          {cameraStatus === 'error' && <p role="status" className="text-amber-700 dark:text-amber-100">Kamera tidak tersedia atau izin ditolak. Gunakan barcode manual atau pencarian produk.</p>}
          <div className="space-y-2">
            <Label htmlFor="manualBarcode" className="text-slate-700 dark:text-white/72">Input barcode manual</Label>
            <div className="flex gap-2">
              <Input
                id="manualBarcode"
                value={manualBarcode}
                onChange={(event) => setManualBarcode(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') submitManualBarcode() }}
                className={cn(
                  'h-11 border-slate-300 bg-white font-mono text-slate-950 placeholder:text-slate-400 dark:border-white/12 dark:bg-white/8 dark:text-white dark:placeholder:text-white/36',
                  missingBarcode && manualBarcode.trim() === missingBarcode && 'border-rose-400 dark:border-rose-300/70',
                )}
                placeholder="001 atau 8991001000011"
              />
              <Button type="button" aria-label="Cari barcode" onClick={submitManualBarcode} className="h-11 min-w-11 bg-cyan-300 text-slate-950">
                <Search className="size-4" />
              </Button>
            </div>
          </div>

          {missingBarcode ? (
            <div className="rounded-xl border border-rose-300/40 bg-rose-50 p-4 dark:border-rose-300/25 dark:bg-rose-500/10">
              <div className="flex items-start gap-3">
                <PackageSearch className="mt-0.5 size-5 text-rose-600 dark:text-rose-200" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-rose-800 dark:text-rose-50">Barcode tidak ditemukan</p>
                  <p className="mt-1 font-mono text-sm text-rose-700 dark:text-rose-100/75">{missingBarcode}</p>
                </div>
              </div>
              {onMissingBarcode ? (
                <Button type="button" variant="outline" className="mt-3 min-h-11 border-rose-300 bg-transparent text-rose-800 dark:border-rose-200/30 dark:text-rose-50" onClick={() => onMissingBarcode(missingBarcode)}>
                  <Plus className="size-4" />
                  Tambah produk baru
                </Button>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="productSearch" className="text-slate-700 dark:text-white/72">Pencarian produk</Label>
            <div className="flex gap-2">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400 dark:text-white/40" />
                <Input
                  id="productSearch"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="h-12 border-slate-300 bg-white pl-10 text-base text-slate-950 placeholder:text-slate-400 dark:border-white/12 dark:bg-white/8 dark:text-white dark:placeholder:text-white/36"
                  placeholder="Cari nama, merek, atau barcode"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={listening ? 'Hentikan pencarian suara' : 'Cari produk dengan suara'}
                aria-pressed={listening}
                onClick={() => void startVoiceSearch()}
                className={cn('size-12 shrink-0 border-slate-300 bg-white text-slate-800 dark:border-white/12 dark:bg-white/8 dark:text-white', listening && 'border-rose-400 text-rose-600 dark:text-rose-200')}
              >
                {listening ? <LoaderCircle className="size-5 animate-spin motion-reduce:animate-none" /> : <Mic className={cn('size-5', listening && 'animate-pulse motion-reduce:animate-none')} />}
              </Button>
            </div>
            {listening ? <p role="status" className="text-sm font-semibold text-cyan-700 dark:text-cyan-100">Mendengarkan… ucapkan nama barang.</p> : null}
            {speechError ? <p role="alert" className="text-sm text-rose-700 dark:text-rose-200">{speechError}</p> : null}
          </div>

          <div className="space-y-2" aria-live="polite">
            {debouncedSearch.trim() ? (
              <p className="text-sm font-bold text-slate-700 dark:text-white/70">Tampil {allSuggestions.length} produk</p>
            ) : (
              <p className="text-sm text-slate-500 dark:text-white/50">Produk cepat</p>
            )}
            <div className="space-y-2" role="list" aria-label="Hasil pencarian produk">
              {suggestions.map((product) => (
                <button
                  type="button"
                  role="listitem"
                  key={product.id}
                  onClick={() => onDetected(product)}
                  className="flex min-h-16 w-full items-center justify-between gap-3 rounded-xl border border-slate-300 bg-white px-3 py-3 text-left text-slate-950 outline-none transition hover:border-cyan-500 active:bg-cyan-50 focus-visible:ring-2 focus-visible:ring-cyan-500 dark:border-slate-600 dark:bg-[#171b23] dark:text-white dark:hover:border-cyan-300/60 dark:active:bg-cyan-300/10 dark:focus-visible:ring-cyan-200"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-bold leading-5 text-slate-950 dark:text-white">{product.namaBarang}</span>
                    <span className="mt-1 block text-sm text-slate-600 dark:text-slate-300">{product.brand}</span>
                    <span className="mt-1 block truncate font-mono text-xs text-slate-500 dark:text-slate-400">{product.barcode}</span>
                  </span>
                  <span className={cn(
                    'shrink-0 rounded-full px-2.5 py-1 text-xs font-bold',
                    product.stok === 0 ? 'bg-rose-100 text-rose-800 dark:bg-rose-300/14 dark:text-rose-100' : product.stok <= 5 ? 'bg-amber-100 text-amber-800 dark:bg-amber-300/14 dark:text-amber-100' : 'bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200',
                  )}>
                    Stok {product.stok}
                  </span>
                </button>
              ))}
            </div>
            {allSuggestions.length > suggestions.length ? (
              <Button type="button" variant="outline" className="min-h-11 w-full" onClick={() => setVisibleCount(count => count + INITIAL_RESULT_LIMIT)}>
                Tampilkan lagi ({allSuggestions.length - suggestions.length})
              </Button>
            ) : null}
            {debouncedSearch.trim() && allSuggestions.length === 0 ? (
              <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/58">Tidak ada produk yang cocok.</p>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
