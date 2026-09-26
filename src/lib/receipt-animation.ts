import { dateTimeLabel, formatCurrency } from '@/lib/format'
import type { CartItem, StoreRecord, TransactionCategory } from '@/lib/types'

export const receiptBrandImagePath = '/images/abelektronik-brand.svg'

const animationDurationMs = 3450

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function transactionLabel(category: TransactionCategory) {
  return category === 'keluar' ? 'Barang keluar / penjualan' : 'Barang masuk / restock'
}

function receiptCode() {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `TRX-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
}

function receiptAnimationCss() {
  return `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .abe-anim-overlay {
      position: fixed;
      inset: 0;
      z-index: 2147483000;
      overflow: auto;
      padding: max(18px, env(safe-area-inset-top)) 12px max(24px, env(safe-area-inset-bottom));
      background: rgba(248, 250, 252, .96);
      backdrop-filter: blur(14px);
      color: #0f172a;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .abe-anim-stage {
      --paper-w: 244px;
      --paper-h: 440px;
      width: min(430px, 100%);
      margin: 0 auto;
      text-align: center;
    }
    .abe-anim-brand {
      width: min(410px, 94vw);
      margin: 0 auto 16px;
      overflow: hidden;
      border-radius: 16px;
      box-shadow: 0 14px 32px rgba(3, 34, 78, .14);
      background: #03152e;
    }
    .abe-anim-brand img,
    .abe-paper-brand img {
      display: block;
      width: 100%;
      height: auto;
    }
    .abe-machine {
      position: relative;
      width: 310px;
      max-width: 90vw;
      height: calc(var(--paper-h) + 58px);
      margin: 0 auto;
    }
    .abe-printer {
      position: absolute;
      z-index: 20;
      top: 0;
      left: 50%;
      width: 286px;
      height: 56px;
      transform: translateX(-50%);
      border-radius: 12px;
      background:
        linear-gradient(180deg, rgba(255,255,255,.15), transparent 24%),
        linear-gradient(180deg, #242c3d, #0d1320);
      box-shadow:
        0 14px 18px rgba(15,23,42,.24),
        0 4px 5px rgba(15,23,42,.18),
        inset 0 1px 0 rgba(255,255,255,.13);
      animation: abePrinterTick .10s .57s 22 alternate ease-in-out;
    }
    .abe-printer::before {
      content: "";
      position: absolute;
      left: 17px;
      right: 17px;
      bottom: 7px;
      height: 7px;
      border-radius: 999px;
      background: #030711;
    }
    .abe-printer::after {
      content: "";
      position: absolute;
      right: 17px;
      top: 14px;
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: #34d399;
      box-shadow: 0 0 8px rgba(52,211,153,.7);
    }
    .abe-feed-window {
      position: absolute;
      z-index: 6;
      left: 50%;
      top: 49px;
      width: var(--paper-w);
      height: var(--paper-h);
      transform: translateX(-50%);
      overflow: hidden;
      pointer-events: none;
    }
    .abe-paper {
      position: absolute;
      inset: 0;
      width: 100%;
      height: var(--paper-h);
      padding: 16px 16px 24px;
      background: #fff;
      text-align: left;
      transform: translateY(-100%);
      filter: drop-shadow(0 15px 15px rgba(15,23,42,.12));
      will-change: transform;
      animation: abeFeedReceipt 2.18s .56s cubic-bezier(.22,.70,.20,1) forwards;
    }
    .abe-paper::after {
      content: "";
      position: absolute;
      left: 0;
      right: 0;
      bottom: -1px;
      height: 10px;
      background:
        linear-gradient(135deg, transparent 5px, #fff 0) 0 0/10px 10px repeat-x,
        linear-gradient(225deg, transparent 5px, #fff 0) 5px 0/10px 10px repeat-x;
    }
    .abe-slot-shadow {
      position: absolute;
      z-index: 19;
      top: 48px;
      left: 50%;
      width: 236px;
      height: 12px;
      transform: translateX(-50%);
      background: linear-gradient(180deg, rgba(3,7,18,.40), rgba(15,23,42,.07), transparent);
    }
    .abe-paper-brand {
      margin: -4px -4px 10px;
      overflow: hidden;
      border: 1px solid #dbeafe;
      border-radius: 8px;
      background: #03152e;
    }
    .abe-client {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      margin-top: 8px;
      color: #64748b;
      font-size: 6px;
    }
    .abe-client b { color: #334155; }
    .abe-address {
      margin: 5px 0 0;
      color: #64748b;
      font-size: 6px;
      line-height: 1.35;
    }
    .abe-amount { margin: 9px 0; }
    .abe-amount strong {
      display: block;
      font-size: 23px;
      line-height: 1;
      letter-spacing: -.045em;
    }
    .abe-amount small {
      display: block;
      margin-top: 3px;
      color: #64748b;
      font-size: 6px;
    }
    .abe-items {
      display: grid;
      gap: 7px;
      margin-top: 10px;
    }
    .abe-item {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 8px;
      font-size: 7px;
    }
    .abe-item strong {
      display: block;
      overflow: hidden;
      font-size: 7px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .abe-item span {
      display: block;
      margin-top: 2px;
      color: #64748b;
    }
    .abe-item em {
      display: block;
      margin-top: 2px;
      color: #475569;
      font-style: normal;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .abe-summary {
      display: grid;
      gap: 3px;
      margin-top: 12px;
      padding-top: 9px;
      border-top: 1px dashed #cbd5e1;
      font-size: 7px;
    }
    .abe-summary > div {
      display: flex;
      justify-content: space-between;
      gap: 8px;
    }
    .abe-summary .grand {
      margin-top: 4px;
      padding-top: 5px;
      border-top: 1px solid #e2e8f0;
      font-weight: 900;
    }
    .abe-kind {
      margin-top: 9px;
      text-align: center;
      color: #475569;
      font-size: 6px;
      font-weight: 700;
    }
    .abe-thanks {
      margin: 8px 0 0;
      text-align: center;
      color: #64748b;
      font-size: 6px;
      letter-spacing: .07em;
    }
    .abe-barcode {
      width: 128px;
      height: 30px;
      margin: 7px auto 3px;
      background:
        repeating-linear-gradient(
          90deg,
          #111827 0 2px,
          transparent 2px 4px,
          #111827 4px 5px,
          transparent 5px 8px,
          #111827 8px 11px,
          transparent 11px 13px
        );
    }
    .abe-barcode-text {
      display: block;
      text-align: center;
      color: #64748b;
      font: 5.5px ui-monospace, SFMono-Regular, Menlo, monospace;
    }
    .abe-stamp {
      position: absolute;
      right: 14px;
      top: 126px;
      padding: 5px 7px 4px;
      border: 3px solid rgba(225,29,72,.77);
      color: rgba(225,29,72,.82);
      font-size: 13px;
      font-weight: 900;
      letter-spacing: .1em;
      opacity: 0;
      transform: rotate(-10deg) scale(2.4);
      animation: abeStampHit .42s 2.90s cubic-bezier(.18,1.55,.28,1) forwards;
    }
    .abe-status {
      position: relative;
      min-height: 92px;
      margin-top: 4px;
    }
    .abe-before,
    .abe-after {
      position: absolute;
      inset: 0 0 auto 0;
    }
    .abe-before {
      animation: abeHideBefore .20s 3.15s forwards;
    }
    .abe-after {
      opacity: 0;
      transform: translateY(7px);
      animation: abeShowAfter .34s 3.18s forwards cubic-bezier(.2,.85,.24,1);
    }
    .abe-before h2,
    .abe-after h2 {
      margin: 0;
      font-size: 18px;
      letter-spacing: -.025em;
    }
    .abe-before p,
    .abe-after p {
      margin: 3px 0 0;
      color: #94a3b8;
      font-size: 10px;
    }
    .abe-mode {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin-top: 10px;
      padding: 6px 10px;
      border: 1px solid #dbeafe;
      border-radius: 999px;
      background: #eff6ff;
      color: #1d4ed8;
      font-size: 9px;
      font-weight: 800;
      letter-spacing: .04em;
      text-transform: uppercase;
    }
    @keyframes abeFeedReceipt {
      0% { transform: translateY(-100%); }
      7% { transform: translateY(-94%); }
      18% { transform: translateY(-80%); }
      36% { transform: translateY(-61%); }
      58% { transform: translateY(-38%); }
      78% { transform: translateY(-18%); }
      100% { transform: translateY(0); }
    }
    @keyframes abePrinterTick {
      from { transform: translateX(-50%) translateY(0); }
      to { transform: translateX(-50%) translateY(.8px); }
    }
    @keyframes abeStampHit {
      0% { opacity: 0; transform: rotate(-18deg) scale(2.4); }
      58% { opacity: 1; transform: rotate(-9deg) scale(.88); }
      80% { transform: rotate(-11deg) scale(1.08); }
      100% { opacity: 1; transform: rotate(-10deg) scale(1); }
    }
    @keyframes abeHideBefore {
      to { opacity: 0; transform: translateY(4px); }
    }
    @keyframes abeShowAfter {
      to { opacity: 1; transform: translateY(0); }
    }
    @media (max-width: 390px) {
      .abe-anim-overlay { padding-inline: 8px; }
      .abe-anim-stage {
        --paper-w: 226px;
        --paper-h: 412px;
      }
      .abe-anim-brand {
        width: min(350px, 95vw);
        border-radius: 13px;
      }
      .abe-machine {
        width: 286px;
        height: calc(var(--paper-h) + 54px);
      }
      .abe-printer {
        width: 258px;
        height: 51px;
      }
      .abe-feed-window { top: 45px; }
      .abe-slot-shadow {
        top: 44px;
        width: 218px;
      }
      .abe-paper {
        padding: 14px 15px 22px;
      }
      .abe-amount strong { font-size: 21px; }
      .abe-stamp { top: 118px; }
    }
    @media (prefers-reduced-motion: reduce) {
      .abe-printer,
      .abe-paper,
      .abe-stamp,
      .abe-before,
      .abe-after {
        animation-duration: .001ms !important;
        animation-delay: 0ms !important;
      }
      .abe-paper { transform: translateY(0); }
      .abe-stamp { opacity: 1; transform: rotate(-10deg) scale(1); }
      .abe-before { opacity: 0; }
      .abe-after { opacity: 1; transform: none; }
    }
  `
}

function receiptMarkup(
  store: StoreRecord | null,
  items: CartItem[],
  category: TransactionCategory,
  mode: 'print' | 'pdf',
  brandUrl: string,
) {
  const total = items.reduce((sum, item) => sum + item.product.harga * item.quantity, 0)
  const storeAddress = escapeHtml(store?.address ?? '-')
  const code = receiptCode()
  const visibleItems = items.slice(0, 6)
  const hiddenCount = Math.max(0, items.length - visibleItems.length)
  const rows = visibleItems.map(item => {
    const brand = item.product.brand?.trim()

    return `
    <div class="abe-item">
      <div>
        <strong>${item.quantity}X ${escapeHtml(item.product.namaBarang)}</strong>
        ${brand ? `<em>${escapeHtml(brand)}</em>` : ''}
        <span>${escapeHtml(formatCurrency(item.product.harga))} / unit</span>
      </div>
      <strong>${escapeHtml(formatCurrency(item.product.harga * item.quantity))}</strong>
    </div>
  `
  }).join('')

  return `
    <div class="abe-anim-overlay" data-testid="receipt-print-animation">
      <section class="abe-anim-stage" aria-label="Animasi cetak resi ABELEKTRONIK">
        <div class="abe-anim-brand">
          <img src="${escapeHtml(brandUrl)}" alt="ABELEKTRONIK">
        </div>

        <div class="abe-machine">
          <div class="abe-feed-window">
            <article class="abe-paper" data-testid="receipt-print-paper">
              <div class="abe-paper-brand">
                <img src="${escapeHtml(brandUrl)}" alt="ABELEKTRONIK">
              </div>

              <div class="abe-client">
                <span>CLIENT: <b>PELANGGAN UMUM</b></span>
                <span>KASIR: <b>KASIR</b></span>
              </div>

              <p class="abe-address">${storeAddress}</p>

              <div class="abe-amount">
                <strong>${escapeHtml(formatCurrency(total))}</strong>
                <small>${escapeHtml(dateTimeLabel(new Date()))} · INVOICE PAID</small>
              </div>

              <div class="abe-items">
                ${rows}
                ${hiddenCount ? `<div class="abe-item"><div><strong>+${hiddenCount} item lainnya</strong></div><strong></strong></div>` : ''}
              </div>

              <div class="abe-summary">
                <div><span>Subtotal</span><b>${escapeHtml(formatCurrency(total))}</b></div>
                <div><span>Discount (Promo)</span><b>Rp 0</b></div>
                <div><span>Tax (0%)</span><b>Rp 0</b></div>
                <div class="grand"><span>GRAND TOTAL</span><b>${escapeHtml(formatCurrency(total))}</b></div>
              </div>

              <p class="abe-kind">${escapeHtml(transactionLabel(category))}</p>
              <p class="abe-thanks">THANK YOU FOR SHOPPING WITH ABELEKTRONIK</p>
              <div class="abe-barcode" aria-hidden="true"></div>
              <small class="abe-barcode-text">${code}</small>
              <div class="abe-stamp">PAID</div>
            </article>
          </div>

          <div class="abe-slot-shadow" aria-hidden="true"></div>
          <div class="abe-printer" aria-hidden="true"></div>
        </div>

        <div class="abe-status" aria-live="polite">
          <div class="abe-before">
            <h2>Receipt Cut &amp; Torn</h2>
            <p>Resi sedang dicetak dari printer.</p>
            <span class="abe-mode">${mode === 'pdf' ? 'Menyiapkan PDF' : 'Menyiapkan Print'}</span>
          </div>
          <div class="abe-after">
            <h2>Payment Successful</h2>
            <p>${mode === 'pdf' ? 'PDF siap disimpan.' : 'Resi siap masuk ke dialog printer.'}</p>
            <span class="abe-mode">${mode === 'pdf' ? 'PDF Ready' : 'Print Ready'}</span>
          </div>
        </div>
      </section>
    </div>
  `
}

function resolvedBrandUrl() {
  try {
    return new URL(receiptBrandImagePath, window.location.href).href
  } catch {
    return receiptBrandImagePath
  }
}

export async function playReceiptPdfAnimation(
  store: StoreRecord | null,
  items: CartItem[],
  category: TransactionCategory,
) {
  if (typeof document === 'undefined') return

  const host = document.createElement('div')
  host.dataset.receiptAnimationHost = 'true'
  const shadow = host.attachShadow({ mode: 'open' })
  shadow.innerHTML = `<style>${receiptAnimationCss()}</style>${receiptMarkup(store, items, category, 'pdf', resolvedBrandUrl())}`
  document.body.append(host)

  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  await new Promise(resolve => window.setTimeout(resolve, reducedMotion ? 120 : animationDurationMs))
  host.remove()
}

export function buildReceiptPrintAnimationDocument(
  store: StoreRecord | null,
  items: CartItem[],
  category: TransactionCategory,
) {
  const brandUrl = resolvedBrandUrl()
  const printCss = `
    @media print {
      @page { margin: 0; }
      html, body { width: 80mm; margin: 0; background: #fff !important; }
      .abe-anim-brand,
      .abe-printer,
      .abe-slot-shadow,
      .abe-status { display: none !important; }
      .abe-anim-overlay {
        position: static !important;
        overflow: visible !important;
        padding: 0 !important;
        background: #fff !important;
        backdrop-filter: none !important;
      }
      .abe-anim-stage,
      .abe-machine,
      .abe-feed-window {
        position: static !important;
        width: 80mm !important;
        max-width: none !important;
        height: auto !important;
        margin: 0 !important;
        transform: none !important;
        overflow: visible !important;
      }
      .abe-paper {
        position: static !important;
        width: 80mm !important;
        height: auto !important;
        min-height: 150mm !important;
        padding: 6mm !important;
        transform: none !important;
        animation: none !important;
        filter: none !important;
      }
      .abe-paper::after { display: none !important; }
      .abe-stamp {
        opacity: 1 !important;
        transform: rotate(-10deg) scale(1) !important;
        animation: none !important;
      }
      .abe-paper-brand {
        margin: 0 0 4mm !important;
      }
      .abe-client,
      .abe-address,
      .abe-amount small,
      .abe-item,
      .abe-item em,
      .abe-summary,
      .abe-kind,
      .abe-thanks,
      .abe-barcode-text {
        font-size: 8pt !important;
      }
      .abe-amount strong { font-size: 18pt !important; }
    }
  `
  const delay = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 120 : animationDurationMs

  return `<!doctype html>
<html lang="id">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Resi ABELEKTRONIK</title>
    <style>
      html, body { margin: 0; min-height: 100%; background: #fff; }
      ${receiptAnimationCss()}
      ${printCss}
    </style>
  </head>
  <body>
    ${receiptMarkup(store, items, category, 'print', brandUrl)}
    <script>
      window.setTimeout(function () {
        window.print();
        window.setTimeout(function () { window.close(); }, 650);
      }, ${delay});
    </script>
  </body>
</html>`
}
