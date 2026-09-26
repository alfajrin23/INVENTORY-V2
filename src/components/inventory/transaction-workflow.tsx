import {
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  FileText,
  LayoutDashboard,
  Minus,
  Plus,
  Printer,
  Receipt,
  ScanLine,
  ShoppingCart,
  Trash2,
} from 'lucide-react'
import { lazy, Suspense, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { ScannerDialog } from '@/components/inventory/scanner-dialog'
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
import { Separator } from '@/components/ui/separator'
import { useInventory } from '@/hooks/use-inventory'
import { useToast } from '@/hooks/use-toast'
import { dateTimeLabel, formatCurrency } from '@/lib/format'
import { routes } from '@/lib/navigation'
import { downloadReceiptPdf, printReceiptWindow } from '@/lib/pdf'
import type { CartItem, HistoryItem, Product, ProductInput, TransactionCategory } from '@/lib/types'

const VoiceDialog = lazy(() => import('./voice-dialog').then(m => ({ default: m.VoiceDialog })))

type TransactionWorkflowProps = {
  voiceOpen: boolean
  onVoiceOpenChange: (open: boolean) => void
  scannerOpen: boolean
  onScannerOpenChange: (open: boolean) => void
}

function clampQuantity(value: number, max: number, category: TransactionCategory) {
  if (!Number.isFinite(value) || value < 1) {
    return 1
  }

  if (category === 'keluar') {
    return Math.min(Math.floor(value), Math.max(max, 1))
  }

  return Math.floor(value)
}

export function TransactionWorkflow({ scannerOpen, onScannerOpenChange, voiceOpen, onVoiceOpenChange }: TransactionWorkflowProps) {
  const navigate = useNavigate()
  const { products, activeStore, processTransaction, addProduct: createInventoryProduct } = useInventory()
  const { showToast } = useToast()
  const [cartOpen, setCartOpen] = useState(false)
  const [resultOpen, setResultOpen] = useState(false)
  const [receiptOpen, setReceiptOpen] = useState(false)
  const [category, setCategory] = useState<TransactionCategory>('keluar')
  const [items, setItems] = useState<CartItem[]>([])
  const [lastItems, setLastItems] = useState<CartItem[]>([])
  const [lastCategory, setLastCategory] = useState<TransactionCategory>('keluar')
  const [createdHistory, setCreatedHistory] = useState<HistoryItem[]>([])
  const [processing, setProcessing] = useState(false)
  const submitLock = useRef(false)

	  const commitTransaction = async (cart: CartItem[], kind: TransactionCategory) => {
	    if (submitLock.current) throw new Error('Transaksi sedang diproses')
	    submitLock.current = true
	    try {
	      const created = await processTransaction({ category: kind, items: cart, operator: 'Kasir' })
	      setCreatedHistory(created); setLastItems(cart); setLastCategory(kind)
	    } finally { submitLock.current = false }
	  }

  const prepareVoiceCart = async (cart: CartItem[], kind: TransactionCategory) => {
    setCategory(kind)
    setItems(cart)
    setCartOpen(true)
    showToast('Hasil Voice AI masuk keranjang. Periksa lalu tekan Proses.', 'success')
  }

  const total = useMemo(
    () => items.reduce((sum, item) => sum + item.product.harga * item.quantity, 0),
    [items],
  )

  const addProduct = (product: Product) => {
    setItems((current) => {
      const existing = current.find((item) => item.product.id === product.id)
      if (existing) {
        return current.map((item) =>
          item.product.id === product.id
            ? {
                ...item,
                quantity: clampQuantity(item.quantity + 1, item.product.stok, category),
              }
            : item,
        )
      }

      return [...current, { product, quantity: 1 }]
    })
    showToast(`${product.namaBarang} masuk keranjang`, 'success')
    onScannerOpenChange(false)
    setCartOpen(true)
  }

  const updateQuantity = (productId: string, quantity: number) => {
    setItems((current) =>
      current.map((item) =>
        item.product.id === productId
          ? { ...item, quantity: clampQuantity(quantity, item.product.stok, category) }
          : item,
      ),
    )
  }

  const removeItem = (productId: string) => {
    setItems((current) => current.filter((item) => item.product.id !== productId))
  }

  const handleProcess = async () => {
    if (submitLock.current) return
    if (!items.length) {
      showToast('Keranjang masih kosong', 'error')
      return
    }

    setProcessing(true)
    try {
      await commitTransaction(items, category)
      setItems([])
      setCartOpen(false)
      setResultOpen(true)
      showToast('Transaksi berhasil diproses', 'success')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Transaksi gagal diproses'
      showToast(message, 'error')
    } finally {
      setProcessing(false)
    }
  }

  const handleMissingBarcode = (barcode: string) => {
    sessionStorage.setItem('pendingBarcode', barcode)
    onScannerOpenChange(false)
    navigate(routes.products)
  }

  const handleVoiceCreateProduct = async (product: ProductInput) => {
    await createInventoryProduct(product)
    showToast('Barang baru berhasil ditambahkan', 'success')
  }

  return (
    <>
      {voiceOpen && <Suspense fallback={<p role="status" className="fixed bottom-28 left-4 z-[60] rounded-xl bg-slate-900 p-4 text-white">Menyiapkan Voice AI?</p>}>
        <VoiceDialog
          key={activeStore?.id}
          products={products}
	          activeStoreId={activeStore?.id}
	          onClose={() => onVoiceOpenChange(false)}
	          onConfirm={prepareVoiceCart}
	          onCreateProduct={handleVoiceCreateProduct}
	        />
      </Suspense>}
      <ScannerDialog
        open={scannerOpen}
        onOpenChange={onScannerOpenChange}
        products={products}
        onDetected={addProduct}
        onMissingBarcode={handleMissingBarcode}
      />

      <Dialog open={cartOpen} onOpenChange={open => { if (!submitLock.current) setCartOpen(open) }}>
        <DialogContent className="max-h-[92vh] overflow-hidden border-white/12 bg-[#121827]/96 p-0 text-white shadow-2xl sm:max-w-3xl max-lg:top-auto max-lg:bottom-0 max-lg:left-0 max-lg:max-w-none max-lg:translate-x-0 max-lg:translate-y-0 max-lg:rounded-b-none max-lg:rounded-t-3xl">
          <DialogHeader className="px-5 pt-5">
            <DialogTitle className="flex items-center gap-2 text-xl text-white">
              <ShoppingCart className="size-5 text-cyan-200" />
              Keranjang Transaksi
            </DialogTitle>
            <DialogDescription className="text-white/58">
              {items.length} item aktif - {activeStore?.name ?? 'Pilih toko'}
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[58vh] space-y-3 overflow-y-auto px-5 py-4">
            {items.map((item) => (
              <div
                key={item.product.id}
                className="grid gap-3 rounded-xl border border-white/10 bg-white/[0.06] p-4 sm:grid-cols-[1fr_auto]"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate font-semibold text-white">{item.product.namaBarang}</h3>
                    <Badge className="bg-cyan-300/15 text-cyan-100">{item.product.brand}</Badge>
                  </div>
                  <p className="mt-1 font-mono text-sm text-white/54">{item.product.barcode}</p>
                  <p className="mt-2 text-sm text-white/64">
                    Stok {item.product.stok} - {formatCurrency(item.product.harga)}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-3 sm:justify-end">
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      className="border-white/12 bg-white/5"
                      onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                    >
                      <Minus className="size-4" />
                    </Button>
                    <Input
                      aria-label={`Jumlah ${item.product.namaBarang}`}
                      type="number"
                      min={1}
                      max={category === 'keluar' ? item.product.stok : undefined}
                      value={item.quantity}
                      onChange={(event) => updateQuantity(item.product.id, Number(event.target.value))}
                      className="h-9 w-20 border-white/12 bg-white/8 text-center font-mono text-white"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      className="border-white/12 bg-white/5"
                      onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                    >
                      <Plus className="size-4" />
                    </Button>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="text-rose-200 hover:bg-rose-400/12 hover:text-rose-100"
                    onClick={() => removeItem(item.product.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))}

            {!items.length ? (
              <div className="rounded-xl border border-dashed border-white/14 bg-white/[0.04] p-8 text-center text-white/60">
                Keranjang kosong
              </div>
            ) : null}
          </div>

          <div className="space-y-4 border-t border-white/10 bg-white/[0.045] p-5">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <div className="space-y-2">
                <Label className="text-white/70">Jenis transaksi</Label>
                <Select value={category} onValueChange={(value) => setCategory(value as TransactionCategory)}>
                  <SelectTrigger className="h-11 border-white/12 bg-white/8 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="keluar">Barang Keluar (Penjualan)</SelectItem>
                    <SelectItem value="masuk">Barang Masuk (Restock)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="rounded-xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-right">
                <p className="text-xs text-emerald-100/70">Total</p>
                <p className="font-mono text-2xl font-semibold text-emerald-100">{formatCurrency(total)}</p>
              </div>
            </div>
            <DialogFooter className="mx-0 mb-0 border-0 bg-transparent p-0">
              <Button type="button" variant="outline" onClick={() => navigate(routes.dashboard)}>
                <LayoutDashboard className="size-4" />
                Ke Dashboard
              </Button>
              <Button type="button" variant="outline" onClick={() => onScannerOpenChange(true)}>
                <ScanLine className="size-4" />
                Tambah Transaksi
              </Button>
              <Button
                type="button"
                onClick={handleProcess}
                disabled={processing || !items.length}
                className="bg-emerald-300 text-slate-950 hover:bg-emerald-200"
              >
                <CreditCard className="size-4" />
                {processing ? 'Memproses' : 'Proses'}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={resultOpen} onOpenChange={setResultOpen}>
        <DialogContent className="border-white/12 bg-[#121827]/96 text-white shadow-2xl sm:max-w-md">
          <DialogHeader>
            <div className="mb-2 flex size-12 items-center justify-center rounded-2xl bg-emerald-300/12 text-emerald-200">
              <CheckCircle2 className="size-7" />
            </div>
            <DialogTitle className="text-white">Transaksi selesai</DialogTitle>
            <DialogDescription className="text-white/58">
              {createdHistory.length} item tersimpan ke history dan stok sudah diperbarui.
            </DialogDescription>
          </DialogHeader>
	          <DialogFooter>
	            <Button type="button" variant="outline" className="receipt-action-pulse" onClick={() => setReceiptOpen(true)}>
	              <Receipt className="size-4" />
	              Lihat Resi
	            </Button>
            <Button type="button" variant="outline" onClick={() => printReceiptWindow(activeStore, lastItems, lastCategory)}>
              <Printer className="size-4" />
              Print
            </Button>
            <Button type="button" onClick={() => setResultOpen(false)}>
              <CheckCircle2 className="size-4" />
              Oke
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={receiptOpen} onOpenChange={setReceiptOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto border-white/12 bg-[#121827]/96 text-white shadow-2xl sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <FileText className="size-5 text-cyan-200" />
              Resi Digital
            </DialogTitle>
            <DialogDescription className="text-white/58">{dateTimeLabel(new Date())}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-5 lg:grid-cols-[1fr_14rem]">
            <ReceiptPreview items={lastItems} category={lastCategory} />
            <div className="flex flex-col gap-3">
              <Button type="button" onClick={() => downloadReceiptPdf(activeStore, lastItems, lastCategory)}>
                <FileText className="size-4" />
                Save PDF
              </Button>
              <Button type="button" variant="outline" onClick={() => printReceiptWindow(activeStore, lastItems, lastCategory)}>
                <Printer className="size-4" />
                Print Resi
              </Button>
              <Button type="button" variant="outline" onClick={() => setReceiptOpen(false)}>
                <ArrowLeft className="size-4" />
                Kembali
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

function ReceiptPreview({ items, category }: { items: CartItem[]; category: TransactionCategory }) {
  const { activeStore } = useInventory()
  const total = items.reduce((sum, item) => sum + item.product.harga * item.quantity, 0)

	  return (
	    <div className="receipt-preview-animated mx-auto w-full max-w-md rounded-xl bg-white p-6 text-slate-950 shadow-2xl">
      <div className="text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-slate-950 text-white">
          AB
        </div>
        <h3 className="mt-3 text-lg font-bold">{activeStore?.name ?? 'ABElektronik'}</h3>
        <p className="text-xs text-slate-500">{activeStore?.address ?? '-'}</p>
        <p className="mt-2 text-xs text-slate-500">{dateTimeLabel(new Date())}</p>
      </div>
      <Separator className="my-4 bg-slate-200" />
      <div className="space-y-3">
        {items.map((item) => {
          const brand = item.product.brand?.trim()

          return (
          <div key={item.product.id} className="grid grid-cols-[1fr_auto] gap-3 text-sm">
            <div>
              <p className="font-semibold">{item.product.namaBarang}</p>
              {brand ? <p className="text-xs text-slate-500">{brand}</p> : null}
              <p className="text-xs text-slate-500">
                {item.quantity} x {formatCurrency(item.product.harga)}
              </p>
            </div>
            <p className="font-mono font-semibold">{formatCurrency(item.product.harga * item.quantity)}</p>
          </div>
          )
        })}
      </div>
      <Separator className="my-4 bg-slate-200" />
      <div className="flex items-center justify-between font-bold">
        <span>Total</span>
        <span className="font-mono">{formatCurrency(total)}</span>
      </div>
      <div className="mt-5 rounded-lg border border-dashed border-slate-300 p-5 text-center text-xs text-slate-500">
        Cap Tanda Terima
      </div>
      <p className="mt-4 text-center text-xs text-slate-500">
        {category === 'keluar' ? 'Barang keluar / penjualan' : 'Barang masuk / restock'}
      </p>
      <p className="mt-2 text-center text-[11px] text-slate-400">
        Barang yang sudah dibeli mengikuti kebijakan retur toko.
      </p>
    </div>
  )
}
