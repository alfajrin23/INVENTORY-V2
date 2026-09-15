import JsBarcode from 'jsbarcode'
import { Barcode, CheckSquare, LoaderCircle, Printer, Search, Settings2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { PrinterSetupDialog } from '@/components/printer/printer-setup-dialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useInventory } from '@/hooks/use-inventory'
import { useToast } from '@/hooks/use-toast'
import { isSafeCustomBarcodeValue, normalizeBarcodeValue } from '@/lib/barcode-product-reference'
import { matchProduct } from '@/lib/format'
import {
  detectBarcodeSymbology,
  inferBarcodeMode,
  isNativeAndroid,
  printProductBarcodes,
  ThermalPrinterError,
  type ThermalPrinterDevice,
} from '@/lib/thermal-printer'
import type { Product } from '@/lib/types'
import { cn } from '@/lib/utils'

type BarcodeMode = 'factory' | 'custom'

export function ProductBarcodeTools() {
  const { products, updateProduct } = useInventory()
  const { showToast } = useToast()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [copies, setCopies] = useState(1)
  const [printing, setPrinting] = useState(false)
  const [setupOpen, setSetupOpen] = useState(false)
  const [pendingProducts, setPendingProducts] = useState<Product[]>([])
  const [editProduct, setEditProduct] = useState<Product | null>(null)
  const [mode, setMode] = useState<BarcodeMode>('factory')
  const [barcode, setBarcode] = useState('')
  const [saving, setSaving] = useState(false)

  const filtered = useMemo(
    () => products.filter(product => !query.trim() || matchProduct(product, query)),
    [products, query],
  )
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const selectedProducts = useMemo(
    () => products.filter(product => selectedSet.has(product.id)),
    [products, selectedSet],
  )

  const toggle = (id: string) => {
    setSelectedIds(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id])
  }

  const selectAllResults = () => {
    setSelectedIds(current => {
      const next = new Set(current)
      const allSelected = filtered.length > 0 && filtered.every(product => next.has(product.id))
      for (const product of filtered) {
        if (allSelected) next.delete(product.id)
        else next.add(product.id)
      }
      return [...next]
    })
  }

  const runPrint = async (items: Product[]) => {
    if (!items.length || printing) return
    if (!isNativeAndroid()) {
      showToast('Direct print barcode tersedia di APK Android. Pada web gunakan Generate Barcode PNG/PDF existing.', 'info')
      return
    }
    setPrinting(true)
    try {
      await printProductBarcodes(items, copies)
      showToast(`${items.length} barcode dikirim ke printer`, 'success')
      if (navigator.vibrate) navigator.vibrate([30, 20, 30])
    } catch (cause) {
      if (cause instanceof ThermalPrinterError && ['NOT_CONFIGURED', 'DISCONNECTED', 'CONNECTION_FAILED', 'BLUETOOTH_OFF'].includes(cause.code)) {
        setPendingProducts(items)
        setSetupOpen(true)
      }
      showToast(cause instanceof Error ? cause.message : 'Barcode gagal dicetak', 'error')
    } finally {
      setPrinting(false)
    }
  }

  const onPrinterConnected = async (_device: ThermalPrinterDevice) => {
    const items = pendingProducts
    if (!items.length) return
    setPendingProducts([])
    await runPrint(items)
    setSetupOpen(false)
  }

  const openBarcodeEditor = (product: Product) => {
    setEditProduct(product)
    setBarcode(product.barcode)
    setMode(inferBarcodeMode(product.barcode))
  }

  const saveBarcode = async () => {
    if (!editProduct || saving) return
    const value = normalizeBarcodeValue(barcode)
    if (!value) {
      showToast('Kode barcode wajib diisi', 'error')
      return
    }
    if (mode === 'custom' && !isSafeCustomBarcodeValue(value)) {
      showToast('Barcode buatan harus 1–32 karakter huruf/angka tanpa spasi', 'error')
      return
    }
    if (mode === 'factory' && detectBarcodeSymbology(value) === 'CODE128') {
      showToast('Barcode pabrik harus berupa EAN-13, EAN-8, atau UPC-A yang valid. Untuk kode lain pilih Barcode Buatan.', 'error')
      return
    }
    if (products.some(product => product.id !== editProduct.id && normalizeBarcodeValue(product.barcode) === value)) {
      showToast('Barcode sudah digunakan produk lain di toko ini', 'error')
      return
    }

    setSaving(true)
    try {
      await updateProduct(editProduct.id, {
        namaBarang: editProduct.namaBarang,
        brand: editProduct.brand,
        harga: editProduct.harga,
        stok: editProduct.stok,
        barcode: value,
        storeId: editProduct.storeId,
      }, editProduct.stok)
      showToast(`Barcode disimpan sebagai ${mode === 'custom' ? 'CODE128 custom' : detectBarcodeSymbology(value)}`, 'success')
      setEditProduct(null)
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : 'Barcode gagal disimpan', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <section className="mb-5 rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.055] p-3 sm:p-4" aria-labelledby="thermal-barcode-title">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-cyan-300/12 text-cyan-100"><Printer className="size-5" /></span>
            <div>
              <h2 id="thermal-barcode-title" className="font-bold text-white">Barcode Thermal 58 mm</h2>
              <p className="text-sm text-white/52">Cetak CODE128/EAN langsung ke printer atau kelola kode custom pendek.</p>
            </div>
          </div>
          <Button type="button" variant="outline" className="min-h-11 border-white/15" onClick={() => setOpen(true)}>
            <Barcode className="size-4" />
            Cetak Barcode
          </Button>
        </div>
      </section>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto border-white/12 bg-[#121827]/98 text-white sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white"><Printer className="size-5 text-cyan-200" /> Cetak Barcode</DialogTitle>
            <DialogDescription className="text-white/58">Pilih satu atau beberapa barang. APK Android mencetak langsung ke printer thermal 58 mm.</DialogDescription>
          </DialogHeader>

          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/38" />
              <Input value={query} onChange={event => setQuery(event.target.value)} placeholder="Cari nama, merek, barcode" className="h-11 border-white/12 bg-black/15 pl-10 text-white" />
            </div>
            <Button type="button" variant="outline" className="min-h-11 border-white/15" onClick={selectAllResults}>
              <CheckSquare className="size-4" />
              <span className="hidden sm:inline">Pilih Semua Hasil</span>
            </Button>
          </div>

          <p className="text-sm font-semibold text-white/66">{filtered.length} produk · {selectedProducts.length} dipilih</p>
          <div className="max-h-[42dvh] space-y-2 overflow-y-auto" role="list">
            {filtered.map(product => (
              <div key={product.id} role="listitem" className={cn('flex min-h-16 items-center gap-3 rounded-xl border p-3', selectedSet.has(product.id) ? 'border-cyan-300/35 bg-cyan-300/[0.08]' : 'border-white/10 bg-black/15')}>
                <button type="button" aria-label={`${selectedSet.has(product.id) ? 'Batalkan pilihan' : 'Pilih'} ${product.namaBarang}`} onClick={() => toggle(product.id)} className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/[0.04] outline-none focus-visible:ring-2 focus-visible:ring-cyan-200">
                  {selectedSet.has(product.id) ? <CheckSquare className="size-5 text-cyan-200" /> : <Barcode className="size-5 text-white/55" />}
                </button>
                <button type="button" onClick={() => toggle(product.id)} className="min-w-0 flex-1 text-left">
                  <strong className="block truncate text-white">{product.namaBarang}</strong>
                  <span className="mt-1 block truncate text-sm text-white/50">{product.brand} · <span className="font-mono">{product.barcode}</span></span>
                </button>
                <Button type="button" variant="ghost" size="icon" aria-label={`Atur barcode ${product.namaBarang}`} onClick={() => openBarcodeEditor(product)}>
                  <Settings2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-[1fr_auto] items-end gap-3 rounded-xl border border-white/10 bg-black/12 p-3">
            <div>
              <Label htmlFor="barcodeCopies">Jumlah copy tiap barang</Label>
              <Input id="barcodeCopies" type="number" min={1} max={99} value={copies} onChange={event => setCopies(Math.max(1, Math.min(99, Number(event.target.value) || 1)))} className="mt-2 h-11 border-white/15 bg-black/15 text-white" />
            </div>
            <span className="pb-3 text-sm text-white/50">58 mm continuous paper</span>
          </div>

          <DialogFooter className="gap-2 sm:grid sm:grid-cols-2">
            <Button type="button" variant="outline" className="min-h-11 border-white/15" onClick={() => setOpen(false)}><X className="size-4" /> Tutup</Button>
            <Button type="button" className="min-h-11" disabled={!selectedProducts.length || printing} onClick={() => void runPrint(selectedProducts)}>
              {printing ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" /> : <Printer className="size-4" />}
              {printing ? 'Mencetak…' : `Cetak ${selectedProducts.length || ''} Barcode`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BarcodeEditorDialog
        product={editProduct}
        mode={mode}
        barcode={barcode}
        saving={saving}
        onModeChange={setMode}
        onBarcodeChange={setBarcode}
        onClose={() => setEditProduct(null)}
        onSave={() => void saveBarcode()}
      />

      <PrinterSetupDialog open={setupOpen} onOpenChange={setSetupOpen} onConnected={onPrinterConnected} pendingPrint={pendingProducts.length > 0} />
    </>
  )
}

function BarcodeEditorDialog({
  product,
  mode,
  barcode,
  saving,
  onModeChange,
  onBarcodeChange,
  onClose,
  onSave,
}: {
  product: Product | null
  mode: BarcodeMode
  barcode: string
  saving: boolean
  onModeChange(mode: BarcodeMode): void
  onBarcodeChange(value: string): void
  onClose(): void
  onSave(): void
}) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const previewValue = normalizeBarcodeValue(barcode)

  useEffect(() => {
    if (!svgRef.current) return
    svgRef.current.innerHTML = ''
    if (!previewValue) return
    if (mode === 'custom' && !isSafeCustomBarcodeValue(previewValue)) return
    try {
      JsBarcode(svgRef.current, previewValue, {
        format: mode === 'custom' ? 'CODE128' : detectBarcodeSymbology(previewValue),
        displayValue: true,
        width: 1.5,
        height: 60,
        margin: 8,
      })
    } catch {
      svgRef.current.innerHTML = ''
    }
  }, [mode, previewValue])

  return (
    <Dialog open={Boolean(product)} onOpenChange={open => { if (!open && !saving) onClose() }}>
      <DialogContent className="border-white/12 bg-[#121827]/98 text-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Jenis Barcode</DialogTitle>
          <DialogDescription className="text-white/58">{product?.namaBarang ?? 'Produk'} · leading zero seperti 001 tetap dipertahankan.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Jenis Barcode">
          <button type="button" role="radio" aria-checked={mode === 'factory'} onClick={() => onModeChange('factory')} className={cn('min-h-14 rounded-xl border px-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-cyan-200', mode === 'factory' ? 'border-cyan-300/40 bg-cyan-300/[0.1]' : 'border-white/12 bg-black/10')}>
            <strong className="block text-white">Barcode Pabrik</strong><small className="text-white/48">EAN-13 / EAN-8 / UPC</small>
          </button>
          <button type="button" role="radio" aria-checked={mode === 'custom'} onClick={() => onModeChange('custom')} className={cn('min-h-14 rounded-xl border px-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-cyan-200', mode === 'custom' ? 'border-cyan-300/40 bg-cyan-300/[0.1]' : 'border-white/12 bg-black/10')}>
            <strong className="block text-white">Barcode Buatan</strong><small className="text-white/48">CODE128 · 1–32 karakter</small>
          </button>
        </div>

        <div>
          <Label htmlFor="customBarcode">Kode barcode</Label>
          <Input id="customBarcode" value={barcode} onChange={event => onBarcodeChange(event.target.value)} placeholder={mode === 'custom' ? 'contoh: 001 atau A1' : 'Scan/ketik EAN atau UPC'} className="mt-2 h-12 border-white/15 bg-black/15 font-mono text-lg text-white" />
          <p className="mt-2 text-xs leading-5 text-white/48">
            {mode === 'custom' ? 'Gunakan huruf/angka saja. Nilai disimpan sebagai teks, jadi 001 tidak berubah menjadi 1.' : 'Barcode pabrik divalidasi sebagai EAN-13, EAN-8, atau UPC-A.'}
          </p>
        </div>

        <div className="min-h-24 rounded-xl bg-white p-2 text-center text-slate-900">
          {previewValue ? <svg ref={svgRef} className="mx-auto max-h-28 w-full" aria-label={`Preview barcode ${previewValue}`} /> : <p className="py-8 text-sm text-slate-500">Preview barcode</p>}
        </div>

        <DialogFooter className="gap-2 sm:grid sm:grid-cols-2">
          <Button type="button" variant="outline" className="min-h-11 border-white/15" disabled={saving} onClick={onClose}>Batal</Button>
          <Button type="button" className="min-h-11" disabled={saving} onClick={onSave}>{saving ? 'Menyimpan…' : 'Simpan Barcode'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
