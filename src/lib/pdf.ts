import jsPDF from 'jspdf'

import { dateTimeLabel, formatCurrency } from '@/lib/format'
import type { CartItem, HistoryItem, Product, RevenueRow, StoreRecord, TransactionCategory } from '@/lib/types'

function slug(value: string) {
  return value
    .toLocaleLowerCase('id-ID')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function addHeader(doc: jsPDF, title: string, subtitle?: string) {
  doc.setFillColor(18, 28, 48)
  doc.rect(0, 0, 210, 34, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text(title, 14, 16)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(subtitle ?? `Dicetak ${dateTimeLabel(new Date())}`, 14, 24)
  doc.setTextColor(28, 34, 48)
}

function drawTable(doc: jsPDF, columns: string[], rows: string[][], startY = 44) {
  let y = startY
  const pageHeight = doc.internal.pageSize.getHeight()
  const colWidth = 182 / columns.length

  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setFillColor(235, 244, 255)
  doc.rect(14, y - 5, 182, 8, 'F')
  columns.forEach((column, index) => doc.text(column, 16 + index * colWidth, y))
  y += 8
  doc.setFont('helvetica', 'normal')

  rows.forEach((row) => {
    if (y > pageHeight - 18) {
      doc.addPage()
      y = 18
    }

    row.forEach((cell, index) => {
      doc.text(String(cell), 16 + index * colWidth, y, { maxWidth: colWidth - 4 })
    })
    y += 7
  })

  return y
}

export function downloadRevenuePdf(title: string, rows: RevenueRow[], total: number) {
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

export function downloadStockPdf(title: string, products: Product[]) {
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

export function downloadMovementPdf(title: string, history: HistoryItem[]) {
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

export function downloadReceiptPdf(
  store: StoreRecord | null,
  items: CartItem[],
  category: TransactionCategory,
) {
  const doc = new jsPDF({ unit: 'mm', format: [80, 180] })
  const storeName = store?.name ?? 'ABElektronik'
  const total = items.reduce((sum, item) => sum + item.product.harga * item.quantity, 0)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text(storeName, 40, 12, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.text(store?.address ?? '-', 40, 18, { align: 'center', maxWidth: 64 })
  doc.text(dateTimeLabel(new Date()), 40, 27, { align: 'center' })
  doc.line(8, 32, 72, 32)

  let y = 39
  items.forEach((item) => {
    doc.setFont('helvetica', 'bold')
    doc.text(item.product.namaBarang, 8, y, { maxWidth: 42 })
    doc.setFont('helvetica', 'normal')
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

export function printReceiptWindow(store: StoreRecord | null, items: CartItem[], category: TransactionCategory) {
  const total = items.reduce((sum, item) => sum + item.product.harga * item.quantity, 0)
  const storeName = escapeHtml(store?.name ?? 'ABElektronik')
  const storeAddress = escapeHtml(store?.address ?? '-')
  const html = `
    <html>
      <head>
        <title>Resi ${storeName}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 24px; color: #111827; }
          .receipt { width: 320px; margin: 0 auto; }
          h1 { font-size: 20px; text-align: center; margin: 0; }
          .muted { color: #6b7280; font-size: 12px; text-align: center; }
          table { width: 100%; border-collapse: collapse; margin-top: 18px; font-size: 12px; }
          th, td { border-bottom: 1px solid #e5e7eb; padding: 7px 0; text-align: left; }
          .right { text-align: right; }
          .total { font-weight: 700; font-size: 15px; }
          .sign { margin-top: 28px; border: 1px dashed #9ca3af; padding: 18px; text-align: center; }
        </style>
      </head>
      <body>
        <section class="receipt">
          <h1>${storeName}</h1>
          <p class="muted">${storeAddress}</p>
          <p class="muted">${dateTimeLabel(new Date())}</p>
          <table>
            <thead>
              <tr><th>Barang</th><th>Qty</th><th class="right">Total</th></tr>
            </thead>
            <tbody>
              ${items
                .map(
                  (item) =>
                    `<tr><td>${escapeHtml(item.product.namaBarang)}</td><td>${item.quantity}</td><td class="right">${formatCurrency(
                      item.product.harga * item.quantity,
                    )}</td></tr>`,
                )
                .join('')}
            </tbody>
          </table>
          <p class="total right">Total ${formatCurrency(total)}</p>
          <p>${category === 'keluar' ? 'Barang keluar / penjualan' : 'Barang masuk / restock'}</p>
          <div class="sign">Cap Tanda Terima</div>
          <p class="muted">Barang yang sudah dibeli mengikuti kebijakan retur toko.</p>
        </section>
        <script>window.print(); window.setTimeout(() => window.close(), 400);</script>
      </body>
    </html>
  `

  const popup = window.open('', '_blank', 'width=420,height=680')
  if (popup) {
    popup.document.write(html)
    popup.document.close()
  }
}
