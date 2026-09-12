import { Pencil, Save, Trash2, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useInventory } from '@/hooks/use-inventory'
import { useToast } from '@/hooks/use-toast'
import { formatCurrency } from '@/lib/format'
import type { HistoryItem, TransactionCategory } from '@/lib/types'

export type RevisionAction = 'edit' | 'delete'

export function TransactionActions({ item, onAction }: { item: HistoryItem; onAction: (item: HistoryItem, action: RevisionAction) => void }) {
  return <div className="flex items-center justify-end gap-1">
    <Button type="button" variant="ghost" size="icon" aria-label={`Edit transaksi ${item.namaBarang}`} title="Edit transaksi" onClick={() => onAction(item, 'edit')} className="text-cyan-100 hover:bg-cyan-300/12"><Pencil className="size-4" /></Button>
    <Button type="button" variant="ghost" size="icon" aria-label={`Hapus transaksi ${item.namaBarang}`} title="Hapus transaksi" onClick={() => onAction(item, 'delete')} className="text-rose-200 hover:bg-rose-300/12"><Trash2 className="size-4" /></Button>
  </div>
}

function localDateTime(value: string) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

export function TransactionRevisionDialog({ item, action, onClose }: { item: HistoryItem; action: RevisionAction; onClose: () => void }) {
  const { products, reviseTransaction } = useInventory()
  const { showToast } = useToast()
  const initialProduct = products.find(product => product.id === item.productId)
    ?? (!item.productId ? products.find(product => product.barcode === item.barcode && product.storeId === item.storeId) : undefined)
  const [productId, setProductId] = useState(initialProduct?.id ?? '')
  const [category, setCategory] = useState<TransactionCategory>(item.kategori)
  const [quantity, setQuantity] = useState(String(item.jumlah))
  const [price, setPrice] = useState(String(item.harga))
  const [date, setDate] = useState(localDateTime(item.tanggal))
  const [note, setNote] = useState(item.keterangan ?? '')
  const [operator, setOperator] = useState(item.oleh ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const deleting = action === 'delete'

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy) return
    if (!initialProduct) { setError('Produk asal sudah dihapus. Stok tidak dapat dikoreksi otomatis.'); return }
    const amount = Number(quantity)
    const unitPrice = Number(price)
    const parsedDate = new Date(date)
    if (!deleting && (!productId || !Number.isSafeInteger(amount) || amount < 1 || amount > 1000000 || price.trim() === '' || !Number.isFinite(unitPrice) || unitPrice < 0 || !Number.isFinite(parsedDate.getTime()))) {
      setError('Periksa produk, jumlah, harga, dan tanggal transaksi.')
      return
    }
    setBusy(true); setError('')
    try {
      await reviseTransaction(item, deleting ? null : {
        productId, category, quantity: amount, price: unitPrice,
        date: parsedDate.toISOString(), note: note.trim(), operator: operator.trim(),
      })
      showToast(deleting ? 'Transaksi dihapus dan stok dikoreksi.' : 'Transaksi dan stok berhasil diperbarui.', 'success')
      onClose()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Transaksi gagal diubah. Muat ulang dan coba lagi.')
    } finally { setBusy(false) }
  }

  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose() }}>
    <DialogContent className="max-h-[92dvh] overflow-y-auto border-white/12 bg-[#121827]/96 text-white shadow-2xl sm:max-w-lg max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none max-sm:rounded-t-lg">
      <DialogHeader>
        <DialogTitle className="text-white">{deleting ? 'Hapus transaksi?' : 'Edit transaksi'}</DialogTitle>
        <DialogDescription className="text-white/62">{deleting ? 'Transaksi akan dihapus dan pengaruhnya terhadap stok akan dibatalkan.' : 'Perubahan jumlah, barang, atau jenis transaksi langsung menyesuaikan stok.'}</DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="grid gap-4">
        {deleting ? <div className="border-l-2 border-rose-300 bg-rose-300/8 px-4 py-3 text-sm">
          <p className="font-semibold text-white">{item.namaBarang}</p>
          <p className="mt-1 text-white/65">{item.kategori === 'keluar' ? 'Barang keluar' : 'Barang masuk'}: {item.jumlah} unit | {formatCurrency(item.harga * item.jumlah)}</p>
        </div> : <>
          <div className="space-y-2">
            <Label htmlFor="revision-product">Barang</Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger id="revision-product" className="w-full border-white/12 bg-white/8 text-white"><SelectValue placeholder="Pilih barang" /></SelectTrigger>
              <SelectContent>{products.map(product => <SelectItem key={product.id} value={product.id}>{product.namaBarang} - {product.brand}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="revision-category">Jenis transaksi</Label>
            <Select value={category} onValueChange={value => setCategory(value as TransactionCategory)}>
              <SelectTrigger id="revision-category" className="w-full border-white/12 bg-white/8 text-white"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="masuk">Barang Masuk</SelectItem><SelectItem value="keluar">Barang Keluar</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label htmlFor="revision-quantity">Jumlah</Label><Input id="revision-quantity" type="number" min={1} max={1000000} step={1} value={quantity} onChange={event => setQuantity(event.target.value)} className="border-white/12 bg-white/8 text-white" /></div>
            <div className="space-y-2"><Label htmlFor="revision-price">Harga satuan</Label><Input id="revision-price" type="number" min={0} step="0.01" value={price} onChange={event => setPrice(event.target.value)} className="border-white/12 bg-white/8 text-white" /></div>
          </div>
          <div className="space-y-2"><Label htmlFor="revision-date">Tanggal dan waktu</Label><Input id="revision-date" type="datetime-local" value={date} onChange={event => setDate(event.target.value)} className="border-white/12 bg-white/8 text-white" /></div>
          <div className="space-y-2"><Label htmlFor="revision-operator">Oleh</Label><Input id="revision-operator" value={operator} onChange={event => setOperator(event.target.value)} className="border-white/12 bg-white/8 text-white" /></div>
          <div className="space-y-2"><Label htmlFor="revision-note">Keterangan</Label><Textarea id="revision-note" value={note} onChange={event => setNote(event.target.value)} className="min-h-20 border-white/12 bg-white/8 text-white" /></div>
        </>}
        {error && <p role="alert" className="text-sm text-rose-200">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}><X className="size-4" />Batal</Button>
          <Button type="submit" disabled={busy || !initialProduct} className={deleting ? 'bg-rose-300 text-slate-950 hover:bg-rose-200' : 'bg-cyan-300 text-slate-950 hover:bg-cyan-200'}>
            {deleting ? <Trash2 className="size-4" /> : <Save className="size-4" />}
            {busy ? 'Memproses...' : deleting ? 'Hapus transaksi' : 'Simpan perubahan'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
}