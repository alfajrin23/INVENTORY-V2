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
  await expect(page.locator('p:visible', { hasText: 'Charger USB-C 33W' }).first()).toBeVisible()
})

test('ambiguous voice product shows suggestions and never auto-submits', async ({ page }) => {
  await openVoice(page)
  await page.getByTestId('voice-command').fill('jual 1 charger anker')
  await page.getByTestId('voice-submit').click()

  const suggestions = page.getByTestId('voice-suggestions')
  await expect(suggestions).toBeVisible()
  await expect(page.getByTestId('voice-confirmation')).toHaveCount(0)
  await expect(suggestions.getByRole('button', { name: /Charger USB-C 33W/ })).toBeVisible()
})

test('voice pending transaction can be corrected before confirmation', async ({ page }) => {
  await openVoice(page)
  await page.getByTestId('voice-command').fill('jual 2 charger usb c 33w')
  await page.getByTestId('voice-submit').click()
  const confirmation = page.getByTestId('voice-confirmation')
  await expect(confirmation).toContainText('42 → 40')

  await page.getByTestId('voice-command').fill('qty tiga')
  await page.getByTestId('voice-submit').click()
  await expect(confirmation).toContainText('42 → 39')

  await page.getByTestId('voice-command').fill('bukan charger maksud saya kabel hdmi 2 meter')
  await page.getByTestId('voice-submit').click()
  await expect(confirmation).toContainText('Kabel HDMI 2 Meter')
  await expect(confirmation).toContainText('16 → 13')
  await confirmation.getByRole('button', { name: 'Batal' }).click()
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

test('product CRUD and search use the existing inventory provider', async ({ page }) => {
  const name = 'Lampu QA E2E'
  await page.goto('/databarang.html')
  await page.getByRole('button', { name: 'Tambah Barang' }).click()
  await expect(page.getByRole('heading', { name: 'Tambah Barang' })).toBeVisible()

  await page.getByLabel('Nama Barang').fill(name)
  await page.getByLabel('Brand').fill('OpenAI QA')
  await page.getByLabel('Harga').fill('45000')
  await page.getByLabel('Stok').fill('12')
  await page.getByLabel('Barcode').fill('QA-E2E-20260911')
  await page.getByRole('button', { name: 'Simpan' }).click()

  const search = page.getByPlaceholder('Cari nama barang, brand, barcode')
  await search.fill('QA-E2E-20260911')
  await expect(page.locator(':visible', { hasText: name }).first()).toBeVisible()

  await page.locator(`button[aria-label="Edit ${name}"]:visible`).click()
  await page.getByLabel('Stok').fill('15')
  await page.getByRole('button', { name: 'Simpan' }).click()
  await expect(page.locator(':visible', { hasText: '15' }).first()).toBeVisible()

  page.once('dialog', (dialog) => dialog.accept())
  await page.locator(`button[aria-label="Hapus ${name}"]:visible`).click()
  await expect(page.locator(`text=${name}`)).toHaveCount(0)
})

test('scanner manual barcode resolves existing product into transaction cart', async ({ page }) => {
  await page.goto('/')
  await page.locator('button[aria-label="Buka scanner"]:visible, button:has-text("Scan"):visible').first().click()
  await expect(page.getByRole('heading', { name: 'Scanner Barcode' })).toBeVisible()
  await page.getByLabel('Input barcode manual').fill('8991001000011')
  await page.getByRole('button', { name: 'Cari barcode' }).click()

  await expect(page.getByRole('heading', { name: 'Keranjang Transaksi' })).toBeVisible()
  await expect(page.getByText('Charger USB-C 33W').first()).toBeVisible()
})

test('desktop and mobile navigation remain usable without horizontal overflow', async ({ page }) => {
  await page.goto('/')
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(1)

  await page.locator('a[href="/databarang.html"]:visible').first().click()
  await expect(page).toHaveURL(/databarang\.html$/)
  await expect(page.getByRole('heading', { name: /Data Barang/i })).toBeVisible()
})
