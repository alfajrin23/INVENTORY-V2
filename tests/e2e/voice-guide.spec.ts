import { expect, test, type Page } from '@playwright/test'

async function mockSpeech(page: Page, text: string) {
  await page.addInitScript((spoken) => {
    class SpeechMock {
      lang = ''
      interimResults = false
      continuous = false
      onstart?: () => void
      onend?: () => void
      onresult?: (event: unknown) => void
      onerror?: (event: unknown) => void

      start() {
        this.onstart?.()
        window.setTimeout(() => {
          this.onresult?.({ results: [Object.assign([{ transcript: spoken }], { isFinal: true })] })
          this.onend?.()
        }, 60)
      }

      stop() { this.onend?.() }
      abort() {}
    }

    Object.defineProperty(window, 'SpeechRecognition', { value: SpeechMock, configurable: true })
  }, text)
}

test('Voice AI keeps the modal focused on the recognized result and exact product', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockSpeech(page, 'transaksi charger Anker dua')
  await page.goto('/')
  await page.getByRole('button', { name: 'Buka Voice AI' }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Periksa dan konfirmasi')
  await expect(dialog).toContainText('Hasil Voice')
  await expect(dialog).toContainText('100% cocok')
  await expect(dialog).not.toContainText('Panduan cepat perintah suara')
  await expect(page.getByRole('button', { name: 'Konfirmasi', exact: true })).toBeEnabled()
})

test('Voice AI shows close candidates only when the result is ambiguous or user asks for alternatives', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockSpeech(page, 'transaksi lampu Philips dua')
  await page.goto('/')
  await page.getByRole('button', { name: 'Buka Voice AI' }).click()

  const candidates = page.getByLabel('Kandidat untuk lampu philips')
  await expect(candidates).toBeVisible()
  await expect(candidates.getByRole('button').first()).toBeVisible()
})

test('Panduan Voice button opens the dedicated keyword and example guide', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockSpeech(page, 'transaksi charger Anker dua')
  await page.goto('/')
  await page.getByRole('button', { name: 'Buka Voice AI' }).click()
  await page.getByRole('button', { name: 'Panduan Voice' }).click()

  await expect(page).toHaveURL(/\/pengaturan\.html\?guide=voice$/)
  await expect(page.getByRole('heading', { name: 'Cara memakai Voice AI' })).toBeVisible()
  await expect(page.getByText('Kata Kunci Voice AI')).toBeVisible()
  await expect(page.getByText('Transaksi / Barang Keluar')).toBeVisible()
  await expect(page.getByText('Barang Masuk', { exact: true })).toBeVisible()
  await expect(page.getByText('Tambah Barang Baru')).toBeVisible()
  await expect(page.getByText('Transaksi lampu 11 watt Provi dua')).toBeVisible()
})
