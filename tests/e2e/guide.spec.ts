import { expect, test } from '@playwright/test'

test.describe('interactive usage guide', () => {
  test('stays inside a 360px viewport and teaches where controls live', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 360, height: 800 })
    await page.goto('/pengaturan.html')

    await page.getByRole('button', { name: 'Panduan Penggunaan' }).click()
    const guide = page.getByTestId('interactive-guide')
    await expect(guide).toBeVisible()
    await expect(guide).toContainText('Kenali Tombol Utama')
    await expect(guide).toContainText('KENALI SIMBOL')
    await expect(guide).toContainText('LIHAT POSISI TOMBOL')

    const box = await guide.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.x).toBeGreaterThanOrEqual(-0.5)
    expect(box!.y).toBeGreaterThanOrEqual(-0.5)
    expect(box!.x + box!.width).toBeLessThanOrEqual(360.5)
    expect(box!.width).toBeLessThanOrEqual(360.5)
    expect(await guide.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBeTruthy()

    await page.getByRole('button', { name: /Search/ }).click()
    await expect(guide).toContainText('Pencarian Produk')
    await expect(guide.locator('[data-guide-spotlight="search"]')).toBeVisible()

    await page.getByRole('button', { name: /Scanner/ }).click()
    await expect(guide.locator('[data-guide-spotlight="scanner"]')).toBeVisible()

    await page.getByRole('button', { name: /Voice AI/ }).click()
    await expect(guide.locator('[data-guide-spotlight="voice-nav"]')).toBeVisible()
    await expect(guide).toContainText('Barang masuk Charger Samsung 10')

    await page.screenshot({ path: testInfo.outputPath('interactive-guide-mobile.png'), fullPage: false })
  })

  test('settings guide uses the same app icon language and can close cleanly', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/pengaturan.html')
    await page.getByRole('button', { name: 'Panduan Penggunaan' }).click()

    const guide = page.getByTestId('interactive-guide')
    await page.getByRole('button', { name: /^Setelan$/ }).click()
    await expect(guide).toContainText('Setelan & Panduan')
    await expect(guide).toContainText('Panduan Penggunaan')
    await expect(guide.locator('[data-guide-spotlight="settings-nav"]')).toBeVisible()

    await page.getByRole('button', { name: 'Tutup Panduan' }).first().click()
    await expect(guide).toBeHidden()
  })

  test('app and usage guide dialogs stay framed in Android-sized viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/pengaturan.html')

    await page.getByRole('button', { name: 'Panduan Penggunaan' }).click()
    const usageGuide = page.getByTestId('interactive-guide')
    await expect(usageGuide).toBeVisible()
    await expect.poll(() => usageGuide.evaluate((element) => {
      const box = element.getBoundingClientRect()
      return box.left >= -1 && box.top >= -1 && box.right <= innerWidth + 1 && box.bottom <= innerHeight + 1
    })).toBe(true)
    await page.getByRole('button', { name: 'Tutup Panduan' }).first().click()
    await expect(usageGuide).toBeHidden()

    await page.getByRole('button', { name: 'Panduan Aplikasi' }).click()
    const appGuide = page.getByRole('dialog')
    await expect(appGuide).toContainText('Panduan ABElektronik Inventory')
    await expect.poll(() => appGuide.evaluate((element) => {
      const box = element.getBoundingClientRect()
      return box.left >= -1 && box.top >= -1 && box.right <= innerWidth + 1 && box.bottom <= innerHeight + 1
    })).toBe(true)
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
  })
})
