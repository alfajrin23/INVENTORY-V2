import type jsPDF from 'jspdf'

import { dateTimeLabel, formatCurrency } from '@/lib/format'
import { playReceiptPdfAnimation } from '@/lib/receipt-animation'
import { playReceiptPrintAnimation } from '@/lib/receipt-print-animation'
import { buildReceiptPdfMatchedPrintDocument } from '@/lib/receipt-print-template'
import { isNativeAndroid, requestThermalReceiptPrint } from '@/lib/thermal-printer'
import type { CartItem, HistoryItem, Product, RevenueRow, StoreRecord, TransactionCategory } from '@/lib/types'

function slug(value: string) {
  return value
    .toLocaleLowerCase('id-ID')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function receiptBrand(item: CartItem) {
  return item.product.brand?.trim() ?? ''
}

function addHeader(doc: jsPDF, title: string, subtitle?: string) {
  doc.setFillColor(18, 28, 48)
  doc.rect(0, 0, 210, 34, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text(title, 14, 12, { maxWidth: 182 })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(subtitle ?? `Dicetak ${dateTimeLabel(new Date())}`, 14, 24)
  doc.setTextColor(28, 34, 48)
}

function drawTable(doc: jsPDF, columns: string[], rows: string[][], startY = 44) {
  let y = startY
  const pageHeight = doc.internal.pageSize.getHeight()
  const colWidth = 182 / columns.length
  const header = () => {
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setFillColor(235, 244, 255)
    doc.rect(14, y - 5, 182, 8, 'F')
    columns.forEach((column, index) => doc.text(column, 16 + index * colWidth, y))
    y += 8; doc.setFont('helvetica', 'normal')
  }
  header()
  rows.forEach(row => {
    const cells = row.map(cell => doc.splitTextToSize(String(cell), colWidth - 4) as string[])
    const height = Math.max(...cells.map(cell => cell.length)) * 4 + 4
    if (y + height > pageHeight - 18) { doc.addPage(); y = 18; header() }
    cells.forEach((cell, index) => doc.text(cell, 16 + index * colWidth, y))
    y += height
  })
  if (y > pageHeight - 30) { doc.addPage(); y = 18 }
  return y
}

export async function downloadRevenuePdf(title: string, rows: RevenueRow[], total: number) {
  const { default: jsPDF } = await import('jspdf')
  const doc = new jsPDF()
  addHeader(doc, title)
  const y = drawTable(
    doc,
    ['Tanggal', 'Barang', 'Qty', 'Harga', 'Total'],
    rows.map((row) => [
      dateTimeLabel(row.tanggal),
      row.namaBarang,
      String(row.qty),
      formatCurrency(row.harga),
      formatCurrency(row.total),
    ]),
  )

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text(`Total: ${formatCurrency(total)}`, 14, y + 8)
  doc.save(`${slug(title)}.pdf`)
}

export async function downloadStockPdf(title: string, products: Product[]) {
  const { default: jsPDF } = await import('jspdf')
  const doc = new jsPDF()
  addHeader(doc, title)
  drawTable(
    doc,
    ['No', 'Nama', 'Brand', 'Stok', 'Harga'],
    products.map((product, index) => [
      String(index + 1),
      product.namaBarang,
      product.brand,
      String(product.stok),
      formatCurrency(product.harga),
    ]),
  )
  doc.save(`${slug(title)}.pdf`)
}

export async function downloadMovementPdf(title: string, history: HistoryItem[]) {
  const { default: jsPDF } = await import('jspdf')
  const doc = new jsPDF()
  addHeader(doc, title)
  drawTable(
    doc,
    ['No', 'Nama Barang', 'Tanggal', 'Jumlah'],
    history.map((item, index) => [
      String(index + 1),
      item.namaBarang,
      dateTimeLabel(item.tanggal),
      String(item.jumlah),
    ]),
  )
  doc.save(`${slug(title)}.pdf`)
}

export async function downloadReceiptPdf(
  store: StoreRecord | null,
  items: CartItem[],
  category: TransactionCategory,
) {
  await playReceiptPdfAnimation(store, items, category)

  const { default: jsPDF } = await import('jspdf')
  const doc = new jsPDF({
    unit: 'mm',
    format: [
      80,
      Math.max(
        180,
        110 + items.reduce(
          (height, item) => height + 15 + Math.ceil(item.product.namaBarang.length / 24) * 4 + (receiptBrand(item) ? 4 : 0),
          0,
        ),
      ),
    ],
  })
  const storeName = store?.name ?? 'ABElektronik'
  const total = items.reduce((sum, item) => sum + item.product.harga * item.quantity, 0)

  doc.setFillColor(3, 21, 46)
  doc.roundedRect(8, 5, 64, 12, 1.5, 1.5, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('courier', 'bold')
  doc.setFontSize(10)
  doc.text('ABELEKTRONIK', 40, 10.2, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(4.4)
  doc.text('listrik, sparepart tv, audio, mesin cuci, kulkas dll', 40, 14.1, { align: 'center' })
  doc.setTextColor(28, 34, 48)
  doc.setFontSize(7.5)
  doc.text(store?.address ?? '-', 40, 21, { align: 'center', maxWidth: 64 })
  doc.text(dateTimeLabel(new Date()), 40, 27, { align: 'center' })
  doc.line(8, 32, 72, 32)

  let y = 39
  items.forEach((item) => {
    const brand = receiptBrand(item)
    doc.setFont('helvetica', 'bold')
    const lines = doc.splitTextToSize(item.product.namaBarang, 64) as string[]
    doc.text(lines, 8, y)
    y += (lines.length - 1) * 4
    doc.setFont('helvetica', 'normal')
    if (brand) {
      doc.text(brand, 8, y + 5)
      y += 4
    }
    doc.text(`${item.quantity} x ${formatCurrency(item.product.harga)}`, 8, y + 5)
    doc.text(formatCurrency(item.product.harga * item.quantity), 72, y + 5, { align: 'right' })
    y += 13
  })

  doc.line(8, y, 72, y)
  doc.setFont('helvetica', 'bold')
  doc.text('Total', 8, y + 8)
  doc.text(formatCurrency(total), 72, y + 8, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.text(category === 'keluar' ? 'Barang keluar / penjualan' : 'Barang masuk / restock', 8, y + 18)
  doc.text('Barang yang sudah dibeli mengikuti kebijakan retur toko.', 8, y + 28, { maxWidth: 64 })
  doc.save(`resi-${slug(storeName)}.pdf`)
}

export function printReceiptWindow(
  store: StoreRecord | null,
  items: CartItem[],
  category: TransactionCategory,
) {
  if (isNativeAndroid()) {
    requestThermalReceiptPrint({ store, items, category })
    return
  }

  // Open the popup synchronously so browsers do not block it after the animation await.
  const popup = window.open('', '_blank', 'width=460,height=780')
  if (!popup) return

  popup.document.open()
  popup.document.write(`<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Menyiapkan Resi</title></head><body style="font-family:Arial,sans-serif;padding:24px;color:#0f172a">Menyiapkan template resi…</body></html>`)
  popup.document.close()

  void (async () => {
    await playReceiptPrintAnimation(store, items, category)
    if (popup.closed) return
    popup.document.open()
    popup.document.write(buildReceiptPdfMatchedPrintDocument(store, items, category))
    popup.document.close()
    popup.focus()
  })()
}
