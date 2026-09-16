import { playReceiptPdfAnimation } from '@/lib/receipt-animation'
import type { CartItem, StoreRecord, TransactionCategory } from '@/lib/types'

export async function playReceiptPrintAnimation(
  store: StoreRecord | null,
  items: CartItem[],
  category: TransactionCategory,
) {
  const animation = playReceiptPdfAnimation(store, items, category)

  // playReceiptPdfAnimation mounts its Shadow DOM synchronously before the first await.
  // Keep the exact same visual animation, but relabel the status so Print never says PDF.
  if (typeof document !== 'undefined') {
    const host = document.querySelector<HTMLElement>('[data-receipt-animation-host="true"]')
    const root = host?.shadowRoot
    const modes = root?.querySelectorAll<HTMLElement>('.abe-mode')
    const beforeTitle = root?.querySelector<HTMLElement>('.abe-before h2')
    const beforeText = root?.querySelector<HTMLElement>('.abe-before p')
    const afterTitle = root?.querySelector<HTMLElement>('.abe-after h2')
    const afterText = root?.querySelector<HTMLElement>('.abe-after p')

    if (modes?.[0]) modes[0].textContent = 'Menyiapkan Print'
    if (modes?.[1]) modes[1].textContent = 'Print Ready'
    if (beforeTitle) beforeTitle.textContent = 'Receipt Cut & Torn'
    if (beforeText) beforeText.textContent = 'Resi sedang disiapkan untuk printer.'
    if (afterTitle) afterTitle.textContent = 'Receipt Ready'
    if (afterText) afterText.textContent = 'Resi siap dikirim ke printer.'
  }

  await animation
}
