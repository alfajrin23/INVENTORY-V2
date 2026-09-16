import { dateTimeLabel, formatCurrency } from '@/lib/format'
import type { CartItem, StoreRecord, TransactionCategory } from '@/lib/types'

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export function buildReceiptPdfMatchedPrintDocument(
  store: StoreRecord | null,
  items: CartItem[],
  category: TransactionCategory,
) {
  const total = items.reduce((sum, item) => sum + item.product.harga * item.quantity, 0)
  const rows = items.map(item => `
    <section class="item">
      <strong class="item-name">${escapeHtml(item.product.namaBarang)}</strong>
      <div class="item-row">
        <span>${item.quantity} x ${escapeHtml(formatCurrency(item.product.harga))}</span>
        <strong>${escapeHtml(formatCurrency(item.product.harga * item.quantity))}</strong>
      </div>
    </section>
  `).join('')

  return `<!doctype html>
<html lang="id">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Resi ABELEKTRONIK</title>
    <style>
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; background: #fff; color: #1c2230; }
      body {
        width: 80mm;
        font-family: Arial, Helvetica, sans-serif;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .receipt { width: 80mm; min-height: 150mm; padding: 5mm 8mm 10mm; background: #fff; }
      .brand {
        width: 64mm;
        min-height: 12mm;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        border-radius: 1.5mm;
        background: #03152e;
        color: #fff;
        text-align: center;
      }
      .brand strong { font-family: "Courier New", monospace; font-size: 10pt; letter-spacing: .02em; }
      .brand small { margin-top: 1mm; font-size: 4.4pt; line-height: 1.2; }
      .meta { margin-top: 3mm; text-align: center; font-size: 7.5pt; line-height: 1.4; }
      .divider { margin: 3mm 0 2.5mm; border: 0; border-top: .25mm solid #1c2230; }
      .items { display: grid; gap: 3mm; }
      .item-name { display: block; font-size: 7.5pt; line-height: 1.35; overflow-wrap: anywhere; }
      .item-row { display: flex; justify-content: space-between; gap: 3mm; margin-top: 1.3mm; font-size: 7.5pt; }
      .item-row strong { text-align: right; white-space: nowrap; }
      .total { display: flex; justify-content: space-between; gap: 3mm; margin-top: 2mm; font-size: 8pt; font-weight: 700; }
      .footer { margin-top: 4mm; font-size: 7.5pt; line-height: 1.45; }
      .policy { margin-top: 2.5mm; max-width: 64mm; }
      @page { size: 80mm auto; margin: 0; }
      @media print {
        html, body, .receipt { width: 80mm !important; margin: 0 !important; }
        .receipt { min-height: 0; }
      }
    </style>
  </head>
  <body>
    <main class="receipt" data-testid="receipt-pdf-matched-print">
      <header class="brand">
        <strong>ABELEKTRONIK</strong>
        <small>listrik, sparepart tv, audio, mesin cuci, kulkas dll</small>
      </header>
      <div class="meta">
        <div>${escapeHtml(store?.address ?? '-')}</div>
        <div>${escapeHtml(dateTimeLabel(new Date()))}</div>
      </div>
      <hr class="divider">
      <div class="items">${rows}</div>
      <hr class="divider">
      <div class="total"><span>Total</span><span>${escapeHtml(formatCurrency(total))}</span></div>
      <div class="footer">
        <div>${category === 'keluar' ? 'Barang keluar / penjualan' : 'Barang masuk / restock'}</div>
        <div class="policy">Barang yang sudah dibeli mengikuti kebijakan retur toko.</div>
      </div>
    </main>
    <script>
      window.addEventListener('load', function () {
        window.setTimeout(function () {
          window.print();
          window.setTimeout(function () { window.close(); }, 650);
        }, 120);
      });
    </script>
  </body>
</html>`
}
