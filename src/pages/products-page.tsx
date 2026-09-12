import JsBarcode from 'jsbarcode'
import {
  Barcode,
  ChevronLeft,
  ChevronRight,
  Download,
  Edit3,
  Eye,
  FileText,
  Plus,
  ScanLine,
  Search,
  Trash2,
} from 'lucide-react'
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'

import { ScannerDialog } from '@/components/inventory/scanner-dialog'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/shared/data-state'
import { GlassPanel } from '@/components/shared/glass-panel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import { Separator } from '@/components/ui/separator'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useInventory } from '@/hooks/use-inventory'
import { useToast } from '@/hooks/use-toast'
import {
  lookupScannedProduct,
  productReferenceBrands,
  productReferenceNames,
  type ProductScanSuggestion,
} from '@/lib/barcode-product-reference'
import { formatCurrency, formatNumber, matchProduct } from '@/lib/format'
import type { Product, ProductInput } from '@/lib/types'

type ProductFormState = {
  namaBarang: string
  brand: string
  harga: string
  stok: string
  barcode: string
}

const emptyForm: ProductFormState = {
  namaBarang: '',
  brand: '',
  harga: '',
  stok: '1',
  barcode: '',
}

const PRODUCTS_PER_PAGE = 24
const productBrandCollator = new Intl.Collator('id-ID', { sensitivity: 'base' })

const scanSourceLabels: Record<ProductScanSuggestion['source'], string> = {
  store: 'Data toko',
  'barcode-reference': 'Referensi barcode',
  'scan-text': 'Teks scan',
  'brand-reference': 'Referensi brand',
  'barcode-only': 'Barcode baru',
}

const scanConfidenceLabels: Record<ProductScanSuggestion['confidence'], string> = {
  high: 'Akurat',
  medium: 'Perlu cek',
  low: 'Lengkapi manual',
}

function cleanNumber(value: string) {
  return value.replace(/\D/g, '')
}

function productToForm(product: Product): ProductFormState {
  return {
    namaBarang: product.namaBarang,
    brand: product.brand,
    harga: String(product.harga),
    stok: String(product.stok),
    barcode: product.barcode,
  }
}

function productToScanSuggestion(product: Product): ProductScanSuggestion {
  return {
    barcode: product.barcode,
    namaBarang: product.namaBarang,
    brand: product.brand,
    harga: product.harga,
    stok: product.stok,
    source: 'store',
    confidence: 'high',
    reason: 'Barcode sama dengan produk di toko aktif.',
  }
}

function drawBarcodeCanvas(product: Product) {
  const canvas = document.createElement('canvas')
  canvas.width = 700
  canvas.height = 280
  const context = canvas.getContext('2d')
  if (!context) {
    return canvas
  }

  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = '#0f172a'
  context.font = 'bold 28px Arial'
  context.fillText(`${product.brand} - ${product.namaBarang}`, 28, 42)
  context.font = '24px Arial'
  context.fillText(formatCurrency(product.harga), 28, 76)
  JsBarcode(canvas, product.barcode, {
    format: 'CODE128',
    width: 2,
    height: 120,
    marginTop: 96,
    marginLeft: 24,
    marginRight: 24,
    displayValue: true,
    fontSize: 24,
  })
  return canvas
}

function downloadBarcodePng(product: Product) {
  const canvas = drawBarcodeCanvas(product)
  const link = document.createElement('a')
  link.download = `${product.brand}-${product.namaBarang}-${product.barcode}.png`.replace(/\s+/g, '-')
  link.href = canvas.toDataURL('image/png')
  link.click()
}

async function downloadBarcodePdf(products: Product[]) {
  const { default: jsPDF } = await import('jspdf')
  const doc = new jsPDF('p', 'mm', 'a4')
  const columns = 4
  const rows = 8
  const labelWidth = 48
  const labelHeight = 31
  const startX = 9
  const startY = 10

  products.forEach((product, index) => {
    if (index > 0 && index % (columns * rows) === 0) {
      doc.addPage()
    }

    const pageIndex = index % (columns * rows)
    const column = pageIndex % columns
    const row = Math.floor(pageIndex / columns)
    const x = startX + column * labelWidth
    const y = startY + row * labelHeight
    const canvas = drawBarcodeCanvas(product)

    doc.setDrawColor(226, 232, 240)
    doc.roundedRect(x, y, labelWidth - 2, labelHeight - 2, 2, 2)
    doc.setFontSize(6)
    doc.text(product.namaBarang.slice(0, 28), x + 2, y + 5)
    doc.text(formatCurrency(product.harga), x + 2, y + 9)
    doc.addImage(canvas.toDataURL('image/png'), 'PNG', x + 2, y + 11, labelWidth - 6, 15)
  })

  doc.save('barcode-abelektronik.pdf')
}

export function ProductsPage() {
  const {
    activeStore,
    products,
    loading,
    productsReady,
    error,
    refresh,
    addProduct,
    updateProduct,
    deleteProduct,
  } = useInventory()
  const { showToast } = useToast()
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [page, setPage] = useState(0)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [formOpen, setFormOpen] = useState(false)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [barcodeOpen, setBarcodeOpen] = useState(false)
  const [fullscreenOpen, setFullscreenOpen] = useState(false)
  const [fullscreenIndex, setFullscreenIndex] = useState(0)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [form, setForm] = useState<ProductFormState>(emptyForm)
  const [scanSuggestion, setScanSuggestion] = useState<ProductScanSuggestion | null>(null)

  const filteredProducts = useMemo(() => {
    const result = deferredSearch.trim() ? products.filter((product) => matchProduct(product, deferredSearch)) : products
    return [...result].sort((a, b) => productBrandCollator.compare(a.brand, b.brand))
  }, [products, deferredSearch])

  const lastPage = Math.max(0, Math.ceil(filteredProducts.length / PRODUCTS_PER_PAGE) - 1)
  const visiblePage = Math.min(page, lastPage)
  const visibleProducts = useMemo(
    () => filteredProducts.slice(visiblePage * PRODUCTS_PER_PAGE, (visiblePage + 1) * PRODUCTS_PER_PAGE),
    [filteredProducts, visiblePage],
  )
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds])

  const selectedProducts = useMemo(
    () => products.filter((product) => selectedIdSet.has(product.id)),
    [products, selectedIdSet],
  )

  const names = useMemo(
    () => Array.from(new Set([...products.map((product) => product.namaBarang), ...productReferenceNames])).slice(0, 30),
    [products],
  )
  const brands = useMemo(
    () => Array.from(new Set([...products.map((product) => product.brand), ...productReferenceBrands])).slice(0, 30),
    [products],
  )

  useEffect(() => {
    setPage(0)
    setSelectedIds([])
  }, [activeStore?.id])

  useEffect(() => {
    const pendingBarcode = sessionStorage.getItem('pendingBarcode')
    if (pendingBarcode) {
      sessionStorage.removeItem('pendingBarcode')
      setForm({ ...emptyForm, barcode: pendingBarcode })
      setEditingProduct(null)
      setFormOpen(true)
    }
  }, [])

  const openCreateForm = () => {
    setEditingProduct(null)
    setScanSuggestion(null)
    setForm(emptyForm)
    setFormOpen(true)
  }

  const openEditForm = (product: Product) => {
    setEditingProduct(product)
    setScanSuggestion(null)
    setForm(productToForm(product))
    setFormOpen(true)
  }

  const applyScanSuggestion = (value: string) => {
    const suggestion = lookupScannedProduct(value, products)
    setScanSuggestion(suggestion)
    setForm((current) => {
      const replaceKnownFields = suggestion.confidence === 'high' || suggestion.source === 'scan-text'
      const next: ProductFormState = {
        ...current,
        barcode: suggestion.barcode || current.barcode,
      }

      if (suggestion.namaBarang && (replaceKnownFields || !current.namaBarang.trim())) {
        next.namaBarang = suggestion.namaBarang
      }

      if (suggestion.brand && (replaceKnownFields || !current.brand.trim())) {
        next.brand = suggestion.brand
      }

      if (suggestion.harga !== null && (replaceKnownFields || !current.harga.trim())) {
        next.harga = String(suggestion.harga)
      }

      if (suggestion.stok !== null && (replaceKnownFields || !current.stok.trim() || current.stok === emptyForm.stok)) {
        next.stok = String(suggestion.stok)
      }

      return next
    })

    return suggestion
  }

  const closeScannerWithDraft = () => {
    setScannerOpen(false)
    showToast(
      scanSuggestion?.namaBarang || scanSuggestion?.brand
        ? 'Referensi scan masuk ke form'
        : 'Barcode masuk ke form',
      'info',
    )
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))
  }

  const handleSelectAll = (checked: boolean) => {
    setSelectedIds(current => {
      const next = new Set(current)
      for (const product of filteredProducts) {
        if (checked) next.add(product.id)
        else next.delete(product.id)
      }
      return [...next]
    })
  }

  const handleDelete = async (product: Product) => {
    const confirmed = window.confirm(`Hapus ${product.namaBarang}?`)
    if (!confirmed) {
      return
    }

    try {
      await deleteProduct(product.id)
      setSelectedIds((current) => current.filter((id) => id !== product.id))
      showToast('Produk dihapus', 'success')
    } catch (e) { showToast(e instanceof Error ? e.message : 'Produk gagal dihapus', 'error') }
  }

  const validateForm = () => {
    if (!activeStore) {
      return 'Pilih toko terlebih dahulu'
    }

    if (!form.namaBarang.trim()) {
      return 'Nama barang wajib diisi'
    }

    if (!form.brand.trim()) {
      return 'Brand wajib diisi'
    }

    if (Number(cleanNumber(form.harga)) <= 0) {
      return 'Harga harus lebih dari 0'
    }

    if (!Number.isSafeInteger(Number(form.stok)) || Number(form.stok) < 0) return 'Stok harus bilangan bulat minimal 0'

    if (!form.barcode.trim()) {
      return 'Barcode wajib diisi'
    }

    const duplicate = products.some(
      (product) => product.barcode === form.barcode.trim() && product.id !== editingProduct?.id,
    )
    if (duplicate) {
      return 'Barcode sudah terdaftar'
    }

    return ''
  }

  const handleSave = async () => {
    if (saving) return
    const validation = validateForm()
    if (validation) {
      showToast(validation, 'error')
      return
    }

    setSaving(true)
    try {
    const payload: ProductInput = {
      namaBarang: form.namaBarang.trim(),
      brand: form.brand.trim(),
      harga: Number(cleanNumber(form.harga)),
      stok: Math.max(Number(cleanNumber(form.stok)), 0),
      barcode: form.barcode.trim(),
      storeId: activeStore?.id ?? '',
    }

    if (editingProduct) {
      await updateProduct(editingProduct.id, payload, editingProduct.stok)
      showToast('Produk diperbarui', 'success')
    } else {
      await addProduct(payload)
      showToast('Produk baru disimpan', 'success')
    }

    setFormOpen(false)
    } catch (e) { showToast(e instanceof Error ? e.message : 'Produk gagal disimpan', 'error') } finally { setSaving(false) }
  }

  const openBarcodePreview = () => {
    if (!selectedProducts.length) {
      showToast('Pilih minimal satu produk', 'error')
      return
    }

    setBarcodeOpen(true)
  }

  if (error) {
    return <ErrorState message={error} onRetry={() => void refresh()} />
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm text-cyan-100/70">Inventory CRUD</p>
          <h1 className="mt-1 text-3xl font-bold text-white lg:text-4xl">Stok Data Barang</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={openBarcodePreview} className="border-white/12 bg-white/[0.07] text-white">
            <Barcode className="size-4" />
            Generate Barcode
          </Button>
          <Button type="button" onClick={openCreateForm} className="bg-cyan-300 text-slate-950 hover:bg-cyan-200">
            <Plus className="size-4" />
            Tambah Barang
          </Button>
        </div>
      </div>

      <GlassPanel className="p-4" glow="cyan">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/42" />
            <Input
              value={search}
              onChange={(event) => { setSearch(event.target.value); setPage(0) }}
              placeholder="Cari nama barang, brand, barcode"
              className="h-11 border-white/12 bg-white/[0.07] pl-10 text-white placeholder:text-white/38"
            />
          </div>
          <div className="flex items-center gap-2 text-sm text-white/56">
            <Badge className="bg-emerald-300/15 text-emerald-100">{formatNumber(products.length)} produk</Badge>
            <Badge className="bg-cyan-300/15 text-cyan-100">{formatNumber(selectedIds.length)} dipilih</Badge>
          </div>
        </div>
      </GlassPanel>

      <GlassPanel className="overflow-hidden p-0" glow="emerald">
        {loading && !productsReady ? (
          <div className="p-5">
            <TableSkeleton />
          </div>
        ) : filteredProducts.length ? (
          <>
            <div className="hidden max-h-[620px] overflow-auto lg:block">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-[#17213a]/95 backdrop-blur">
                  <TableRow className="border-white/10 hover:bg-transparent">
                    <TableHead className="w-12">
                      <Checkbox
                        checked={filteredProducts.length > 0 && filteredProducts.every(product => selectedIdSet.has(product.id))}
                        onCheckedChange={(checked) => handleSelectAll(Boolean(checked))}
                        aria-label="Pilih semua produk"
                      />
                    </TableHead>
                    <TableHead className="text-white/62">ID</TableHead>
                    <TableHead className="text-white/62">Nama Barang</TableHead>
                    <TableHead className="text-white/62">Brand</TableHead>
                    <TableHead className="text-white/62">Harga</TableHead>
                    <TableHead className="text-white/62">Stok</TableHead>
                    <TableHead className="text-right text-white/62">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleProducts.map((product, index) => (
                    <TableRow
                      key={product.id}
                      className="border-white/10 transition hover:bg-cyan-300/[0.06]"
                    >
                      <TableCell>
                        <Checkbox
                          checked={selectedIdSet.has(product.id)}
                          onCheckedChange={() => toggleSelect(product.id)}
                          aria-label={`Pilih ${product.namaBarang}`}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-white/58">{visiblePage * PRODUCTS_PER_PAGE + index + 1}</TableCell>
                      <TableCell>
                        <p className="font-semibold text-white">{product.namaBarang}</p>
                        <p className="font-mono text-xs text-white/42">{product.barcode}</p>
                      </TableCell>
                      <TableCell className="text-white/72">{product.brand}</TableCell>
                      <TableCell>
                        <p className="text-xs text-white/42">Rp</p>
                        <p className="font-mono text-white">{formatCurrency(product.harga).replace('Rp', '')}</p>
                      </TableCell>
                      <TableCell>
                        <Badge className={product.stok <= 5 ? 'bg-amber-300/16 text-amber-100' : 'bg-emerald-300/14 text-emerald-100'}>
                          {product.stok}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex gap-2">
                          <Button type="button" variant="outline" size="icon-sm" aria-label={`Edit ${product.namaBarang}`} onClick={() => openEditForm(product)}>
                            <Edit3 className="size-4" />
                          </Button>
                          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Hapus ${product.namaBarang}`} onClick={() => void handleDelete(product)} className="text-rose-200">
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="space-y-3 p-4 lg:hidden">
              {visibleProducts.map((product) => (
                <div
                  key={product.id}
                  className="rounded-xl border border-white/10 bg-white/[0.055] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-white">{product.namaBarang}</p>
                      <p className="text-sm text-white/52">{product.brand}</p>
                    </div>
                    <Checkbox aria-label={`Pilih ${product.namaBarang}`} checked={selectedIdSet.has(product.id)} onCheckedChange={() => toggleSelect(product.id)} />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-white/42">Harga</p>
                      <p className="font-mono text-white">{formatCurrency(product.harga)}</p>
                    </div>
                    <div>
                      <p className="text-white/42">Stok</p>
                      <p className="font-mono text-white">{product.stok}</p>
                    </div>
                  </div>
                  <p className="mt-3 font-mono text-xs text-cyan-100/72">{product.barcode}</p>
                  <div className="mt-4 flex gap-2">
                    <Button type="button" variant="outline" className="flex-1" aria-label={`Edit ${product.namaBarang}`} onClick={() => openEditForm(product)}>
                      <Edit3 className="size-4" />
                      Edit
                    </Button>
                    <Button type="button" variant="ghost" className="text-rose-200" aria-label={`Hapus ${product.namaBarang}`} onClick={() => void handleDelete(product)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            {filteredProducts.length > PRODUCTS_PER_PAGE && (
              <div className="flex flex-wrap items-center justify-start gap-6 border-t border-white/10 px-4 py-3 text-sm text-white/60">
                <span>{visiblePage * PRODUCTS_PER_PAGE + 1}-{Math.min((visiblePage + 1) * PRODUCTS_PER_PAGE, filteredProducts.length)} dari {formatNumber(filteredProducts.length)} produk</span>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="icon" aria-label="Halaman sebelumnya" title="Halaman sebelumnya" disabled={visiblePage === 0} onClick={() => setPage(visiblePage - 1)}><ChevronLeft className="size-4" /></Button>
                  <span className="min-w-14 text-center">{visiblePage + 1}/{lastPage + 1}</span>
                  <Button type="button" variant="outline" size="icon" aria-label="Halaman berikutnya" title="Halaman berikutnya" disabled={visiblePage === lastPage} onClick={() => setPage(visiblePage + 1)}><ChevronRight className="size-4" /></Button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="p-5">
            <EmptyState
              title="Produk tidak ditemukan"
              description="Tambahkan produk baru atau ubah kata kunci pencarian."
              action={
                <Button type="button" onClick={openCreateForm}>
                  <Plus className="size-4" />
                  Tambah Barang
                </Button>
              }
            />
          </div>
        )}
      </GlassPanel>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto border-white/12 bg-[#121827]/96 text-white shadow-2xl sm:max-w-2xl max-lg:top-auto max-lg:bottom-0 max-lg:left-0 max-lg:max-w-none max-lg:translate-x-0 max-lg:translate-y-0 max-lg:rounded-b-none max-lg:rounded-t-3xl">
          <DialogHeader>
            <DialogTitle className="text-white">{editingProduct ? 'Edit Barang' : 'Tambah Barang'}</DialogTitle>
            <DialogDescription className="text-white/58">
              Data disimpan untuk toko aktif.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="namaBarang">Nama Barang</Label>
              <Input
                id="namaBarang"
                value={form.namaBarang}
                onChange={(event) => setForm((current) => ({ ...current, namaBarang: event.target.value }))}
                list="product-name-options"
                className="border-white/12 bg-white/8 text-white"
              />
              <datalist id="product-name-options">
                {names.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </div>
            <div className="space-y-2">
              <Label htmlFor="brand">Brand</Label>
              <Input
                id="brand"
                value={form.brand}
                onChange={(event) => setForm((current) => ({ ...current, brand: event.target.value }))}
                list="brand-options"
                className="border-white/12 bg-white/8 text-white"
              />
              <datalist id="brand-options">
                {brands.map((brand) => (
                  <option key={brand} value={brand} />
                ))}
              </datalist>
            </div>
            <div className="space-y-2">
              <Label htmlFor="harga">Harga</Label>
              <Input
                id="harga"
                inputMode="numeric"
                value={form.harga ? formatNumber(Number(cleanNumber(form.harga))) : ''}
                onChange={(event) => setForm((current) => ({ ...current, harga: cleanNumber(event.target.value) }))}
                className="border-white/12 bg-white/8 font-mono text-white"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="stok">Stok</Label>
              <Input
                id="stok"
                type="number"
                min={0}
                value={form.stok}
                onChange={(event) => setForm((current) => ({ ...current, stok: event.target.value }))}
                className="border-white/12 bg-white/8 font-mono text-white"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="barcode">Barcode</Label>
              <div className="flex gap-2">
                <Input
                  id="barcode"
                  value={form.barcode}
                  onChange={(event) => {
                    setScanSuggestion(null)
                    setForm((current) => ({ ...current, barcode: event.target.value }))
                  }}
                  className="border-white/12 bg-white/8 font-mono text-white"
                />
                <Button type="button" variant="outline" aria-label="Scan Barcode" onClick={() => setScannerOpen(true)} className="border-white/12 bg-white/8">
                  <ScanLine className="size-4" />
                </Button>
              </div>
            </div>
            {scanSuggestion ? (
              <div className="space-y-3 rounded-xl border border-cyan-200/20 bg-cyan-300/10 p-4 text-sm sm:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-semibold text-cyan-50">
                    <Barcode className="size-4 text-cyan-200" />
                    Referensi scan
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge className="bg-cyan-300/15 text-cyan-50">{scanSourceLabels[scanSuggestion.source]}</Badge>
                    <Badge className="bg-emerald-300/15 text-emerald-50">{scanConfidenceLabels[scanSuggestion.confidence]}</Badge>
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <p><span className="text-white/52">Nama</span><br /><span className="font-medium text-white">{scanSuggestion.namaBarang || '-'}</span></p>
                  <p><span className="text-white/52">Brand</span><br /><span className="font-medium text-white">{scanSuggestion.brand || '-'}</span></p>
                  <p><span className="text-white/52">Barcode</span><br /><span className="font-mono text-cyan-50">{scanSuggestion.barcode || '-'}</span></p>
                  <p><span className="text-white/52">Harga</span><br /><span className="font-mono text-white">{scanSuggestion.harga !== null ? formatCurrency(scanSuggestion.harga) : '-'}</span></p>
                </div>
                <p className="text-white/58">{scanSuggestion.reason}</p>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
              Batal
            </Button>
            <Button type="button" disabled={saving} onClick={() => void handleSave()} className="bg-cyan-300 text-slate-950 hover:bg-cyan-200">
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ScannerDialog
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        products={products}
        title="Scan Barcode Produk"
        description="Scan barcode atau QR produk. Jika barcode belum terdaftar, hasil scan dipakai sebagai draft barang baru."
        onRawBarcode={applyScanSuggestion}
        onDetected={(product) => {
          setScanSuggestion(productToScanSuggestion(product))
          setForm(productToForm(product))
          setScannerOpen(false)
          showToast('Barcode dikenali', 'success')
        }}
        onMissingBarcode={closeScannerWithDraft}
      />

      <Dialog open={barcodeOpen} onOpenChange={setBarcodeOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto border-white/12 bg-[#121827]/96 text-white shadow-2xl sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Barcode className="size-5 text-cyan-200" />
              Preview Barcode
            </DialogTitle>
            <DialogDescription className="text-white/58">
              {selectedProducts.length} barcode siap dicetak.
            </DialogDescription>
          </DialogHeader>
          <div className="grid max-h-[56vh] gap-4 overflow-y-auto sm:grid-cols-2 xl:grid-cols-3">
            {selectedProducts.map((product) => (
              <BarcodePreview key={product.id} product={product} />
            ))}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => selectedProducts.forEach((product, index) => window.setTimeout(() => downloadBarcodePng(product), index * 500))}
            >
              <Download className="size-4" />
              Save PNG
            </Button>
            <Button type="button" variant="outline" onClick={() => downloadBarcodePdf(selectedProducts)}>
              <FileText className="size-4" />
              Save PDF
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setFullscreenIndex(0)
                setFullscreenOpen(true)
              }}
            >
              <Eye className="size-4" />
              Lihat
            </Button>
            <Button type="button" onClick={() => setBarcodeOpen(false)}>
              Tutup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={fullscreenOpen} onOpenChange={setFullscreenOpen}>
        <DialogContent className="border-white/12 bg-black/95 text-white shadow-2xl sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle className="text-white">Barcode {fullscreenIndex + 1}/{selectedProducts.length}</DialogTitle>
          </DialogHeader>
          {selectedProducts[fullscreenIndex] ? (
            <div className="flex flex-col items-center gap-4">
              <BarcodePreview product={selectedProducts[fullscreenIndex]} large />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={fullscreenIndex === 0}
                  onClick={() => setFullscreenIndex((current) => Math.max(current - 1, 0))}
                >
                  Prev
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={fullscreenIndex === selectedProducts.length - 1}
                  onClick={() => setFullscreenIndex((current) => Math.min(current + 1, selectedProducts.length - 1))}
                >
                  Next
                </Button>
                <Button type="button" onClick={() => setFullscreenOpen(false)}>
                  Close
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function BarcodePreview({ product, large = false }: { product: Product; large?: boolean }) {
  const svgRef = useRef<SVGSVGElement | null>(null)

  useEffect(() => {
    if (svgRef.current) {
      JsBarcode(svgRef.current, product.barcode, {
        format: 'CODE128',
        width: large ? 2.5 : 1.6,
        height: large ? 120 : 78,
        displayValue: true,
        fontSize: large ? 22 : 14,
        margin: 12,
      })
    }
  }, [large, product.barcode])

  return (
    <div className="rounded-xl bg-white p-4 text-slate-950 shadow-xl">
      <div className="mb-2">
        <p className="truncate text-sm font-bold">{product.brand} - {product.namaBarang}</p>
        <p className="font-mono text-sm text-slate-500">{formatCurrency(product.harga)}</p>
      </div>
      <Separator className="mb-3 bg-slate-200" />
      <svg ref={svgRef} className={large ? 'h-auto w-full max-w-3xl' : 'h-auto w-full'} />
    </div>
  )
}
