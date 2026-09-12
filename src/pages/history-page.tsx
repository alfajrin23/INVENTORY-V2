import { ArrowDownCircle, ArrowUpCircle, CalendarDays, ChevronLeft, ChevronRight, Filter, Plus, Save, ScanLine, Search, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { ScannerDialog } from '@/components/inventory/scanner-dialog'
import { TransactionActions, TransactionRevisionDialog, type RevisionAction } from '@/components/inventory/transaction-revision-dialog'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/shared/data-state'
import { GlassPanel } from '@/components/shared/glass-panel'
import { Badge } from '@/components/ui/badge'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useInventory } from '@/hooks/use-inventory'
import { useMediaQuery } from '@/hooks/use-media-query'
import { useToast } from '@/hooks/use-toast'
import { dateTimeLabel, formatCurrency, matchProduct, toInputDate } from '@/lib/format'
import type { HistoryItem, Product, TransactionCategory } from '@/lib/types'

type CategoryFilter = 'semua' | TransactionCategory

const HISTORY_PER_PAGE = 40

export function HistoryPage() {
  const { products, history, loading, error, refresh, processTransaction } = useInventory()
  const { showToast } = useToast()
  const desktop = useMediaQuery('(min-width: 1024px)')
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('semua')
  const [page, setPage] = useState(0)
  const [formOpen, setFormOpen] = useState(false)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [formCategory, setFormCategory] = useState<TransactionCategory>('masuk')
  const [barcode, setBarcode] = useState('')
  const [productQuery, setProductQuery] = useState('')
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [quantity, setQuantity] = useState('1')
  const [date, setDate] = useState(toInputDate(new Date()))
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [revision, setRevision] = useState<{ item: HistoryItem; action: RevisionAction } | null>(null)

  const filteredHistory = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase('id-ID')
    return history.filter((item) => {
      const matchesCategory = categoryFilter === 'semua' || item.kategori === categoryFilter
      const matchesSearch =
        !normalized ||
        item.namaBarang.toLocaleLowerCase('id-ID').includes(normalized) ||
        item.brand.toLocaleLowerCase('id-ID').includes(normalized)

      return matchesCategory && matchesSearch
    })
  }, [categoryFilter, history, search])

  const lastPage = Math.max(0, Math.ceil(filteredHistory.length / HISTORY_PER_PAGE) - 1)
  const visiblePage = Math.min(page, lastPage)
  const visibleHistory = useMemo(
    () => filteredHistory.slice(visiblePage * HISTORY_PER_PAGE, (visiblePage + 1) * HISTORY_PER_PAGE),
    [filteredHistory, visiblePage],
  )

  useEffect(() => { setPage(0) }, [search, categoryFilter])

  const productSuggestions = useMemo(() => {
    if (!productQuery.trim()) {
      return products.slice(0, 6)
    }

    return products.filter((product) => matchProduct(product, productQuery)).slice(0, 6)
  }, [productQuery, products])

  const openTransactionForm = (category: TransactionCategory) => {
    setFormCategory(category)
    setBarcode('')
    setProductQuery('')
    setSelectedProduct(null)
    setQuantity('1')
    setDate(toInputDate(new Date()))
    setNote(category === 'keluar' ? 'Penjualan' : 'Restock')
    setFormOpen(true)
  }

  const chooseProduct = (product: Product) => {
    setSelectedProduct(product)
    setProductQuery(product.namaBarang)
    setBarcode(product.barcode)
  }

  const handleBarcodeChange = (value: string) => {
    setBarcode(value)
    const product = products.find((item) => item.barcode === value.trim())
    if (product) {
      chooseProduct(product)
    } else { setSelectedProduct(null) }
  }

  const handleSubmit = async () => {
    if (saving) return
    const product = selectedProduct ?? products.find((item) => item.barcode === barcode.trim())
    const amount = Number(quantity)

    if (!product) {
      showToast('Produk belum dipilih', 'error')
      return
    }

    if (!Number.isSafeInteger(amount) || amount < 1) {
      showToast('Jumlah harus minimal 1', 'error')
      return
    }

    if (formCategory === 'keluar' && amount > product.stok) {
      showToast('Stok tidak cukup', 'error')
      return
    }

    setSaving(true)
    try {
      await processTransaction({
        category: formCategory,
        items: [{ product, quantity: amount }],
        note,
        operator: 'Admin',
        date: new Date(`${date}T12:00:00`).toISOString(),
      })
      setFormOpen(false)
      showToast('History tersimpan dan stok diperbarui', 'success')
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : 'History gagal disimpan'
      showToast(message, 'error')
    } finally {
      setSaving(false)
    }
  }

  if (error) {
    return <ErrorState message={error} onRetry={() => void refresh()} />
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm text-cyan-100/70">Mutasi Stok</p>
          <h1 className="mt-1 text-3xl font-bold text-white lg:text-4xl">History Barang</h1>
        </div>
        <div className="hidden gap-2 lg:flex">
          <Button type="button" onClick={() => openTransactionForm('masuk')} className="bg-emerald-300 text-slate-950 hover:bg-emerald-200">
            <ArrowDownCircle className="size-4" />
            Barang Masuk
          </Button>
          <Button type="button" onClick={() => openTransactionForm('keluar')} className="bg-rose-300 text-slate-950 hover:bg-rose-200">
            <ArrowUpCircle className="size-4" />
            Barang Keluar
          </Button>
        </div>
      </div>

      <GlassPanel className="p-4" glow="cyan">
        <div className="grid gap-3 lg:grid-cols-[1fr_16rem]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/42" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari nama barang atau brand"
              className="h-11 border-white/12 bg-white/[0.07] pl-10 text-white placeholder:text-white/38"
            />
          </div>
          <Select value={categoryFilter} onValueChange={(value) => setCategoryFilter(value as CategoryFilter)}>
            <SelectTrigger className="h-11 border-white/12 bg-white/[0.07] text-white">
              <Filter className="size-4" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="semua">Semua kategori</SelectItem>
              <SelectItem value="masuk">Barang Masuk</SelectItem>
              <SelectItem value="keluar">Barang Keluar</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </GlassPanel>

      <GlassPanel className="overflow-hidden p-0" glow="emerald">
        {loading && !history.length ? (
          <div className="p-5">
            <TableSkeleton rows={8} />
          </div>
        ) : filteredHistory.length ? (
          <>
            {desktop ? (
              <div className="max-h-[650px] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-[#17213a]/95">
                    <TableRow className="border-white/10 hover:bg-transparent">
                      <TableHead className="text-white/62">ID</TableHead>
                      <TableHead className="text-white/62">Nama Barang</TableHead>
                      <TableHead className="text-white/62">Brand</TableHead>
                      <TableHead className="text-white/62">Qty</TableHead>
                      <TableHead className="text-white/62">Tanggal</TableHead>
                      <TableHead className="text-white/62">Keterangan</TableHead>
                      <TableHead className="text-right text-white/62">Nilai</TableHead>
                      <TableHead className="text-right text-white/62">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleHistory.map((item, index) => (
                      <TableRow key={item.id} className="border-white/10 hover:bg-white/[0.05]">
                        <TableCell className="font-mono text-white/52">{visiblePage * HISTORY_PER_PAGE + index + 1}</TableCell>
                        <TableCell>
                          <p className="font-semibold text-white">{item.namaBarang}</p>
                          <p className="font-mono text-xs text-white/42">{item.barcode}</p>
                        </TableCell>
                        <TableCell className="text-white/70">{item.brand}</TableCell>
                        <TableCell className="font-mono text-white">{item.jumlah}</TableCell>
                        <TableCell className="text-white/62">{dateTimeLabel(item.tanggal)}</TableCell>
                        <TableCell>
                          <Badge className={item.kategori === 'keluar' ? 'bg-rose-300/14 text-rose-100' : 'bg-emerald-300/14 text-emerald-100'}>
                            {item.kategori === 'keluar' ? 'Barang Keluar' : 'Barang Masuk'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono text-white">{formatCurrency(item.harga * item.jumlah)}</TableCell>
                        <TableCell><TransactionActions item={item} onAction={(selected, action) => setRevision({ item: selected, action })} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="space-y-3 p-4">
                {visibleHistory.map((item) => (
                  <div key={item.id} className="rounded-xl border border-white/10 bg-white/[0.055] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-white">{item.namaBarang}</p>
                        <p className="text-sm text-white/52">{item.brand} · Qty {item.jumlah}</p>
                      </div>
                      <Badge className={item.kategori === 'keluar' ? 'bg-rose-300/14 text-rose-100' : 'bg-emerald-300/14 text-emerald-100'}>
                        {item.kategori}
                      </Badge>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-white/42">Tanggal</p>
                        <p className="text-white/78">{dateTimeLabel(item.tanggal)}</p>
                      </div>
                      <div>
                        <p className="text-white/42">Nilai</p>
                        <p className="font-mono text-white">{formatCurrency(item.harga * item.jumlah)}</p>
                      </div>
                    </div>
                    <TransactionActions item={item} onAction={(selected, action) => setRevision({ item: selected, action })} />
                  </div>
                ))}
              </div>
            )}

            {filteredHistory.length > HISTORY_PER_PAGE ? (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-4 py-3 text-sm text-white/60">
                <span>
                  {visiblePage * HISTORY_PER_PAGE + 1}-{Math.min((visiblePage + 1) * HISTORY_PER_PAGE, filteredHistory.length)} dari {filteredHistory.length} transaksi
                </span>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="icon" aria-label="Halaman history sebelumnya" disabled={visiblePage === 0} onClick={() => setPage(visiblePage - 1)}>
                    <ChevronLeft className="size-4" />
                  </Button>
                  <span className="min-w-14 text-center">{visiblePage + 1}/{lastPage + 1}</span>
                  <Button type="button" variant="outline" size="icon" aria-label="Halaman history berikutnya" disabled={visiblePage === lastPage} onClick={() => setPage(visiblePage + 1)}>
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <div className="p-5">
            <EmptyState
              title="History kosong"
              description="Transaksi masuk dan keluar akan muncul di halaman ini."
              action={
                <Button type="button" onClick={() => openTransactionForm('masuk')}>
                  <Plus className="size-4" />
                  Tambah History
                </Button>
              }
            />
          </div>
        )}
      </GlassPanel>

      <div className="flex gap-2 lg:hidden">
        <Button type="button" onClick={() => openTransactionForm('masuk')} className="bg-emerald-300 text-slate-950 shadow-xl hover:bg-emerald-200 lg:hidden">
          <ArrowDownCircle className="size-4" />
          Masuk
        </Button>
        <Button type="button" onClick={() => openTransactionForm('keluar')} className="bg-rose-300 text-slate-950 shadow-xl hover:bg-rose-200 lg:hidden">
          <ArrowUpCircle className="size-4" />
          Keluar
        </Button>
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto border-white/12 bg-[#121827]/96 text-white shadow-2xl sm:max-w-2xl max-lg:top-auto max-lg:bottom-0 max-lg:left-0 max-lg:max-w-none max-lg:translate-x-0 max-lg:translate-y-0 max-lg:rounded-b-none max-lg:rounded-t-3xl">
          <DialogHeader>
            <DialogTitle className="text-white">
              {formCategory === 'keluar' ? 'Tambah Barang Keluar' : 'Tambah Barang Masuk'}
            </DialogTitle>
            <DialogDescription className="text-white/58">
              Stok berubah otomatis setelah transaksi disimpan.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="historyBarcode">Barcode</Label>
              <div className="flex gap-2">
                <Input
                  id="historyBarcode"
                  value={barcode}
                  onChange={(event) => handleBarcodeChange(event.target.value)}
                  className="border-white/12 bg-white/8 font-mono text-white"
                />
                <Button type="button" variant="outline" onClick={() => setScannerOpen(true)} className="border-white/12 bg-white/8">
                  <ScanLine className="size-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="historyProduct">Nama Barang</Label>
              <Input
                id="historyProduct"
                value={productQuery}
                onChange={(event) => {
                  setProductQuery(event.target.value)
                  setSelectedProduct(null)
                  setBarcode('')
                }}
                className="border-white/12 bg-white/8 text-white"
              />
              {productSuggestions.length ? (
                <div className="grid gap-2">
                  {productSuggestions.map((product) => (
                    <button
                      type="button"
                      key={product.id}
                      onClick={() => chooseProduct(product)}
                      className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2 text-left text-sm transition hover:bg-cyan-300/10"
                    >
                      <span>
                        <span className="block text-white">{product.namaBarang}</span>
                        <span className="text-white/48">{product.brand}</span>
                      </span>
                      <span className="font-mono text-cyan-100">{product.stok}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="historyQuantity">Jumlah</Label>
              <Input
                id="historyQuantity"
                type="number"
                min={1}
                max={formCategory === 'keluar' ? selectedProduct?.stok : undefined}
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                className="border-white/12 bg-white/8 font-mono text-white"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="historyDate">Tanggal</Label>
              <div className="relative">
                <CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/42" />
                <Input
                  id="historyDate"
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  className="border-white/12 bg-white/8 pl-10 text-white"
                />
              </div>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="historyNote">Keterangan</Label>
              <Textarea
                id="historyNote"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                className="min-h-24 border-white/12 bg-white/8 text-white"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
              <X className="size-4" />
              Batal
            </Button>
            <Button type="button" onClick={() => void handleSubmit()} disabled={saving} className="bg-cyan-300 text-slate-950 hover:bg-cyan-200">
              <Save className="size-4" />
              {saving ? 'Menyimpan' : 'Simpan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {revision && <TransactionRevisionDialog key={`${revision.item.id}-${revision.action}`} item={revision.item} action={revision.action} onClose={() => setRevision(null)} />}

      <ScannerDialog
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        products={products}
        title="Scan Barcode History"
        onRawBarcode={handleBarcodeChange}
        onDetected={(product) => {
          chooseProduct(product)
          setScannerOpen(false)
          showToast('Produk ditemukan', 'success')
        }}
      />
    </div>
  )
}
