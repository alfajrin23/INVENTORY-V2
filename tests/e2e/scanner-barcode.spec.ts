import { expect, test, type Page } from '@playwright/test'

import {
  extractBarcodeValue,
  isSafeCustomBarcodeValue,
} from '../../src/lib/barcode-product-reference'

async function mockSearchSpeech(page: Page, text: string) {
  await page.addInitScript(spoken => {
    class SpeechMock {
      lang = ''
      interimResults = false
      continuous = false
      onstart: (() => void) | null = null
      onend: (() => void) | null = null
      onerror: ((event: { error: string }) => void) | null = null
      onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null = null
      start() {
        this.onstart?.()
        window.setTimeout(() => {
          this.onresult?.({ results: [[{ transcript: spoken }]] })
          this.onend?.()
        }, 40)
      }
      stop() { this.onend?.() }
      abort() {}
    }
    Object.defineProperty(window, 'SpeechRecognition', { value: SpeechMock, configurable: true })
    Object.defineProperty(window, 'webkitSpeechRecognition', { value: undefined, configurable: true })
  }, text)
}

test('custom barcode parser accepts 1/2/3 digit and preserves leading zero', () => {
  for (const value of ['1', '12', '123', '001', '002', 'A1', 'L01']) {
    expect(extractBarcodeValue(value)).toBe(value)
    expect(isSafeCustomBarcodeValue(value)).toBe(true)
  }
  expect(extractBarcodeValue('001')).not.toBe('1')
  expect(isSafeCustomBarcodeValue('A 1')).toBe(false)
  expect(isSafeCustomBarcodeValue('A'.repeat(33))).toBe(false)
})

test('scanner exposes every matching result and searches name, brand, barcode, and voice locally', async ({ page }) => {
  await mockSearchSpeech(page, 'lampu provi')
  await page.goto('/')

  await page.evaluate(() => {
    const key = 'ab-elektronik-v2-data'
    const data = JSON.parse(localStorage.getItem(key) ?? '{}') as {
      stores: Array<{ id: string }>
      products: Array<Record<string, unknown>>
    }
    const template = data.products[0]
    const storeId = String(template?.storeId ?? data.stores?.[0]?.id ?? '')
    for (let index = 1; index <= 9; index += 1) {
      data.products.push({
        ...template,
        id: `scan-lamp-${index}`,
        storeId,
        namaBarang: `Lampu Provi Test ${index}`,
        brand: 'Provi',
        barcode: index === 1 ? 'ZX900' : `L0${index}`,
        stok: 10 + index,
      })
    }
    localStorage.setItem(key, JSON.stringify(data))
  })
  await page.reload()

  await page.getByRole('button', { name: 'Scan', exact: true }).click()
  const search = page.getByLabel('Pencarian produk')

  await search.fill('lampu')
  await expect(page.getByText(/Tampil \d+ produk/)).toBeVisible()
  await expect.poll(() => page.getByRole('list', { name: 'Hasil pencarian produk' }).getByRole('listitem').count()).toBeGreaterThan(6)

  await search.fill('PrOvI')
  await expect(page.getByText('Tampil 9 produk')).toBeVisible()
  await expect(page.getByRole('list', { name: 'Hasil pencarian produk' }).getByRole('listitem')).toHaveCount(9)

  await search.fill('ZX900')
  await expect(page.getByText('Tampil 1 produk')).toBeVisible()
  await expect(page.getByRole('list', { name: 'Hasil pencarian produk' })).toContainText('ZX900')

  await page.getByRole('button', { name: 'Cari produk dengan suara' }).click()
  await expect(search).toHaveValue('lampu provi')
  await expect(page.getByText('Tampil 9 produk')).toBeVisible()
})

test('barcode manager saves custom CODE128 with leading zero and rejects duplicates', async ({ page }) => {
  await page.goto('/databarang.html')
  await expect(page.getByRole('heading', { name: 'Barcode Thermal 58 mm' })).toBeVisible()
  await page.getByRole('button', { name: 'Cetak Barcode', exact: true }).click()

  const settingsButtons = page.getByRole('button', { name: /^Atur barcode / })
  const firstLabel = await settingsButtons.first().getAttribute('aria-label')
  const firstName = firstLabel?.replace(/^Atur barcode /, '') ?? ''
  await settingsButtons.first().click()
  await page.getByRole('radio', { name: /Barcode Buatan/ }).click()
  await page.getByLabel('Kode barcode').fill('001')
  await expect(page.getByLabel('Preview barcode 001')).toBeVisible()
  await page.getByRole('button', { name: 'Simpan Barcode' }).click()
  await expect(page.getByText(/Barcode disimpan sebagai CODE128 custom/)).toBeVisible()

  await expect.poll(() => page.evaluate(name => {
    const data = JSON.parse(localStorage.getItem('ab-elektronik-v2-data') ?? '{}') as { products?: Array<{ namaBarang: string; barcode: string }> }
    return data.products?.find(product => product.namaBarang === name)?.barcode
  }, firstName)).toBe('001')

  await page.getByRole('button', { name: /^Atur barcode / }).nth(1).click()
  await page.getByRole('radio', { name: /Barcode Buatan/ }).click()
  await page.getByLabel('Kode barcode').fill('001')
  await page.getByRole('button', { name: 'Simpan Barcode' }).click()
  await expect(page.getByText('Barcode sudah digunakan produk lain di toko ini')).toBeVisible()
})

test('factory barcode accepts a valid EAN-13 and keeps custom codes out of EAN mode', async ({ page }) => {
  await page.goto('/databarang.html')
  await page.getByRole('button', { name: 'Cetak Barcode', exact: true }).click()
  await page.getByRole('button', { name: /^Atur barcode / }).first().click()

  await page.getByRole('radio', { name: /Barcode Pabrik/ }).click()
  await page.getByLabel('Kode barcode').fill('1')
  await page.getByRole('button', { name: 'Simpan Barcode' }).click()
  await expect(page.getByText(/Barcode pabrik harus berupa EAN-13/)).toBeVisible()

  await page.getByLabel('Kode barcode').fill('4006381333931')
  await page.getByRole('button', { name: 'Simpan Barcode' }).click()
  await expect(page.getByText(/Barcode disimpan sebagai EAN13/)).toBeVisible()
})
