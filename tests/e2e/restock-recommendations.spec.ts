import { expect, test } from '@playwright/test'

test('barang keluar menampilkan prioritas restock dari stok kritis dan item laris', async ({ page }) => {
  await page.goto('/laporanbarangkeluar.html')

  await expect(page.getByRole('heading', { name: 'Rekomendasi Restock' })).toBeVisible()
  await expect(page.getByText(/Prioritas otomatis dari stok habis, stok kritis, lalu barang paling laris/)).toBeVisible()

  const criticalCard = page.locator('article').filter({ hasText: 'Powerbank 20000 mAh' })
  await expect(criticalCard).toBeVisible()
  await expect(criticalCard).toContainText('Stok kritis')
  await expect(criticalCard).toContainText('Saran restock')
  await expect(criticalCard).toContainText('+3')

  const fastSellerCard = page.locator('article').filter({ hasText: 'Kabel HDMI 2 Meter' })
  await expect(fastSellerCard).toBeVisible()
  await expect(fastSellerCard).toContainText('Laris')
  await expect(fastSellerCard).toContainText('Keluar 7 hari')
  await expect(fastSellerCard).toContainText('5 unit')
  await expect(fastSellerCard).toContainText('+3')
})
