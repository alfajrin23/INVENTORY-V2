import { expect, test, type Page } from '@playwright/test'

async function openVoice(page: Page) {
  await page.goto('/')
  await page.locator('button[aria-label="Buka Voice AI"]:visible').click()
  await expect(page.getByRole('heading', { name: 'Voice Inventory Assistant' })).toBeVisible()
}

test('text fallback creates a confirmed inventory transaction', async ({ page }) => {
  await openVoice(page)
  await page.getByTestId('voice-command').fill('barang masuk 2 charger usb c 33w')
  await page.getByTestId('voice-submit').click()

  const confirmation = page.getByTestId('voice-confirmation')
  await expect(confirmation).toBeVisible()
  await expect(confirmation).toContainText('Charger USB-C 33W')
  await expect(confirmation).toContainText('42 → 44')

  await page.getByTestId('voice-confirm').click()
  await expect(page.getByText('Transaksi berhasil dan database telah diperbarui.')).toBeVisible()

  await page.getByRole('button', { name: 'Tutup' }).click()
  await page.goto('/history.html')
  await expect(page.getByText('Charger USB-C 33W').first()).toBeVisible()
})

test('ambiguous voice product shows suggestions and never auto-submits', async ({ page }) => {
  await openVoice(page)
  await page.getByTestId('voice-command').fill('jual 1 charger anker')
  await page.getByTestId('voice-submit').click()

  await expect(page.getByTestId('voice-suggestions')).toBeVisible()
  await expect(page.getByTestId('voice-confirmation')).toHaveCount(0)
  await expect(page.getByText('Charger USB-C 33W')).toBeVisible()
})

test('voice pending transaction can be cancelled without mutation', async ({ page }) => {
  await openVoice(page)
  await page.getByTestId('voice-command').fill('jual 2 charger usb c 33w')
  await page.getByTestId('voice-submit').click()
  const confirmation = page.getByTestId('voice-confirmation')
  await expect(confirmation).toContainText('42 → 40')

  await confirmation.getByRole('button', { name: 'Batal' }).click()
  await expect(page.getByTestId('voice-confirmation')).toHaveCount(0)
  await expect(page.getByText('Aksi dibatalkan. Tidak ada perubahan database.')).toBeVisible()
})

test('desktop and mobile navigation remain usable without horizontal overflow', async ({ page }) => {
  await page.goto('/')
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(1)

  await page.locator('a[href="/databarang.html"]:visible').first().click()
  await expect(page).toHaveURL(/databarang\.html$/)
  await expect(page.getByRole('heading', { name: /Data Barang/i })).toBeVisible()
})
