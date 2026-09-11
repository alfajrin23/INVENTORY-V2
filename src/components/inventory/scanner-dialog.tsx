import { Barcode, Camera, PackageSearch, Plus, Search, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
}

export function ScannerDialog({
  open,
  onOpenChange,
  products,
  onDetected,
  onRawBarcode,
  onMissingBarcode,
  title = 'Scanner Barcode',
}: ScannerDialogProps) {
  const [scannerId] = useState(() => {
    const token =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID().slice(0, 8)
        : Date.now().toString(36)
    return `barcode-scanner-${token}`
  })
  const scannerRef = useRef<Html5QrcodeInstance | null>(null)
  const resolverRef = useRef<(barcode: string) => void>(() => {})
  const handledBarcodeRef = useRef('')
  const [cameraStatus, setCameraStatus] = useState<'idle' | 'active' | 'error'>('idle')
  const [manualBarcode, setManualBarcode] = useState('')
  const [search, setSearch] = useState('')
  const [missingBarcode, setMissingBarcode] = useState('')
  const debouncedSearch = useDebouncedValue(search, 220)

  const suggestions = useMemo(() => {
    if (!debouncedSearch.trim()) {
      return products.slice(0, 5)
    }

    return products.filter((product) => matchProduct(product, debouncedSearch)).slice(0, 6)
  }, [debouncedSearch, products])

  const resolveBarcode = useCallback((barcode: string) => {
    const normalized = barcode.trim()
    if (!normalized || handledBarcodeRef.current === normalized) {
      return
    }

    onRawBarcode?.(normalized)
    const product = products.find((item) => item.barcode === normalized)
    if (product) {
      handledBarcodeRef.current = normalized
      setMissingBarcode('')
      navigator.vibrate?.(160)
      onDetected(product)
      return
    }

    setMissingBarcode(normalized)
  }, [onDetected, onRawBarcode, products])

  useEffect(() => { resolverRef.current = resolveBarcode }, [resolveBarcode])

  useEffect(() => {
    if (!open) {
      return
    }

    handledBarcodeRef.current = ''
    setCameraStatus('idle')
    let cancelled = false

    const timer = window.setTimeout(async () => {
      try {
      if (cancelled) {
        return
      }

      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode')
      if (cancelled) {
        return
      }

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
          {
            fps: 10,
            qrbox: (width, height) => {
              const maxWidth = Math.max(1, width - 24)
              const maxHeight = Math.max(1, height - 24)
              return {
                width: Math.min(Math.max(220, Math.floor(width * 0.86)), maxWidth),
                height: Math.min(Math.max(120, Math.floor(height * 0.32)), maxHeight, 240),
              }
            },
          },
          (decodedText) => {
            if (handledBarcodeRef.current === decodedText) {
              return
            }

            resolverRef.current(decodedText)
          },
          undefined,
        )
        .then(async () => {
          if (cancelled) { await scanner.stop(); scanner.clear(); return }
          setCameraStatus('active')
        })
        .catch(() => { if (!cancelled) setCameraStatus('error') })
      } catch { if (!cancelled) setCameraStatus('error') }
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

  const submitManualBarcode = () => {
    resolveBarcode(manualBarcode)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="scanner-sheet max-h-[92dvh] overflow-y-auto border-white/12 bg-[#111827]/95 p-0 text-white shadow-2xl sm:max-w-5xl lg:grid lg:grid-cols-[minmax(0,1.2fr)_24rem] max-lg:inset-0 max-lg:h-dvh max-lg:max-h-dvh max-lg:w-dvw max-lg:max-w-none max-lg:translate-x-0 max-lg:translate-y-0 max-lg:rounded-none max-lg:overflow-hidden max-lg:grid max-lg:grid-rows-[minmax(0,1fr)_auto]">
        <div data-scanner-camera className="scanner-camera relative h-[58dvh] min-h-[360px] overflow-hidden bg-black lg:h-auto lg:min-h-[560px]">
          <div id={scannerId} className="absolute inset-0 [&_video]:h-full [&_video]:w-full [&_video]:object-contain [&_video]:bg-black" />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.65),transparent_18%,transparent_82%,rgba(0,0,0,0.65))]" />
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-40 max-h-[38%] w-[86%] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-cyan-300/70 shadow-[0_0_42px_rgba(0,210,255,0.22)]">
            <div className="absolute inset-x-4 top-0 h-1 rounded-full bg-rose-400 shadow-[0_0_18px_rgba(251,113,133,0.9)] animate-[scanline_2s_linear_infinite]" />
          </div>
          <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full border border-white/15 bg-black/40 px-3 py-1.5 text-xs text-white backdrop-blur-xl">
            <Camera className="size-3.5" />
            {cameraStatus === 'active' ? 'Kamera aktif' : cameraStatus === 'error' ? 'Kamera manual' : 'Menyiapkan'}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            aria-label="Tutup scanner" onClick={() => onOpenChange(false)}
            className="absolute right-4 top-4 rounded-full bg-black/35 text-white hover:bg-white/15"
          >
            <X className="size-5" />
          </Button>
        </div>

        <div className="scanner-controls flex flex-col gap-5 overflow-y-auto p-5 lg:max-h-[92vh] lg:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl text-white">
              <Barcode className="size-5 text-cyan-200" />
              {title}
            </DialogTitle>
            <DialogDescription className="text-white/58">
              Pilih barang dari barcode atau pencarian. Transaksi tetap perlu dikonfirmasi.
            </DialogDescription>
          </DialogHeader>

          {cameraStatus === 'error' && <p role="status" className="text-amber-100">Kamera tidak tersedia atau izin ditolak. Gunakan barcode manual atau pencarian produk.</p>}
          <div className="space-y-2">
            <Label htmlFor="manualBarcode" className="text-white/72">
              Input barcode manual
            </Label>
            <div className="flex gap-2">
              <Input
                id="manualBarcode"
                value={manualBarcode}
                onChange={(event) => setManualBarcode(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    submitManualBarcode()
                  }
                }}
                className={cn(
                  'h-11 border-white/12 bg-white/8 text-white placeholder:text-white/36',
                  missingBarcode && manualBarcode.trim() === missingBarcode && 'border-rose-300/70',
                )}
                placeholder="8991001000011"
              />
              <Button type="button" aria-label="Cari barcode" onClick={submitManualBarcode} className="h-11 bg-cyan-300 text-slate-950">
                <Search className="size-4" />
              </Button>
            </div>
          </div>

          {missingBarcode ? (
            <div className="rounded-xl border border-rose-300/25 bg-rose-500/10 p-4">
              <div className="flex items-start gap-3">
                <PackageSearch className="mt-0.5 size-5 text-rose-200" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-rose-50">Barcode tidak ditemukan</p>
                  <p className="mt-1 font-mono text-sm text-rose-100/75">{missingBarcode}</p>
                </div>
              </div>
              {onMissingBarcode ? (
                <Button
                  type="button"
                  variant="outline"
                  className="mt-3 border-rose-200/30 bg-transparent text-rose-50 hover:bg-rose-400/10"
                  onClick={() => onMissingBarcode(missingBarcode)}
                >
                  <Plus className="size-4" />
                  Tambah produk baru
                </Button>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="productSearch" className="text-white/72">
              Pencarian produk
            </Label>
            <Input
              id="productSearch"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-11 border-white/12 bg-white/8 text-white placeholder:text-white/36"
              placeholder="Nama barang, brand, barcode"
            />
          </div>

          <div className="space-y-2">
            {suggestions.map((product) => (
              <button
                type="button"
                key={product.id}
                onClick={() => onDetected(product)}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.06] p-3 text-left transition hover:border-cyan-200/40 hover:bg-cyan-300/10"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-white">{product.namaBarang}</span>
                  <span className="block truncate text-sm text-white/52">
                    {product.brand} - stok {product.stok}
                  </span>
                </span>
                <span className="font-mono text-xs text-cyan-100">{product.barcode}</span>
              </button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
