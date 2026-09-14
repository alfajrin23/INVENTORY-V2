import { expect, test, type Page } from '@playwright/test'

async function expectFullscreen(page: Page, locator: ReturnType<Page['locator']>) {
  await expect.poll(async () => locator.evaluate((element) => {
    const box = element.getBoundingClientRect()
    return {
      left: Math.round(box.left),
      top: Math.round(box.top),
      right: Math.round(box.right),
      bottom: Math.round(box.bottom),
      width: Math.round(box.width),
      height: Math.round(box.height),
      viewportWidth: Math.round(innerWidth),
      viewportHeight: Math.round(innerHeight),
    }
  })).toEqual({
    left: 0,
    top: 0,
    right: 740,
    bottom: 1600,
    width: 740,
    height: 1600,
    viewportWidth: 740,
    viewportHeight: 1600,
  })
}

test('Android guide fills the WebView instead of being cropped at tablet-density width', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 740, height: 1600 })
  await page.goto('/pengaturan.html')
  await page.evaluate(() => document.documentElement.classList.add('is-capacitor-native'))

  await page.getByRole('button', { name: 'Panduan Penggunaan' }).click()
  const usageGuide = page.getByTestId('interactive-guide')
  await expect(usageGuide).toBeVisible()
  await expectFullscreen(page, usageGuide)
  await expect.poll(() => usageGuide.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('android-guide-740x1600.png'), fullPage: false })

  await page.getByRole('button', { name: 'Tutup Panduan' }).first().click()
  await expect(usageGuide).toBeHidden()

  await page.getByRole('button', { name: 'Panduan Aplikasi' }).click()
  const appGuide = page.getByRole('dialog')
  await expect(appGuide).toContainText('Panduan ABElektronik Inventory')
  await expectFullscreen(page, appGuide)
  await expect.poll(() => appGuide.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
})

test('Android barcode PNG and PDF are routed to the native Downloads saver', async ({ page }) => {
  await page.addInitScript(() => {
    const saved: Array<{ plugin: string; method: string; options: { dataUrl: string; fileName: string; mimeType: string } }> = []
    const fakeWindow = window as typeof window & {
      androidBridge: object
      Capacitor: object
      nativeSaved: typeof saved
    }

    fakeWindow.androidBridge = {}
    fakeWindow.nativeSaved = saved
    fakeWindow.Capacitor = {
      PluginHeaders: [
        {
          name: 'ABFileSaver',
          methods: [{ name: 'saveBase64File', rtype: 'promise' }],
        },
      ],
      nativePromise: (plugin: string, method: string, options: { dataUrl: string; fileName: string; mimeType: string }) => {
        saved.push({ plugin, method, options })
        return Promise.resolve({
          uri: `content://downloads/${saved.length}`,
          path: `Download/ABElektronik/${options.fileName}`,
        })
      },
      nativeCallback: () => Promise.resolve('listener-1'),
    }
  })

  await page.goto('/databarang.html')
  await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('is-capacitor-native'))).toBe(true)

  const productCheckbox = page.getByRole('checkbox', { name: /Pilih .* untuk barcode/ }).first()
  await expect(productCheckbox).toBeVisible()
  await productCheckbox.check()
  await page.getByRole('button', { name: /^Barcode/ }).click()

  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Save PNG', exact: true }).click()
  await expect.poll(() => page.evaluate(() => (window as typeof window & { nativeSaved: unknown[] }).nativeSaved.length)).toBe(1)

  await dialog.getByRole('button', { name: 'Save PDF', exact: true }).click()
  await expect.poll(() => page.evaluate(() => (window as typeof window & { nativeSaved: unknown[] }).nativeSaved.length)).toBe(2)

  const saved = await page.evaluate(() => (window as typeof window & {
    nativeSaved: Array<{ plugin: string; method: string; options: { dataUrl: string; fileName: string; mimeType: string } }>
  }).nativeSaved.map(entry => ({
    plugin: entry.plugin,
    method: entry.method,
    fileName: entry.options.fileName,
    mimeType: entry.options.mimeType,
    prefix: entry.options.dataUrl.slice(0, 32),
  })))

  expect(saved[0]).toMatchObject({ plugin: 'ABFileSaver', method: 'saveBase64File', mimeType: 'image/png' })
  expect(saved[0].fileName).toMatch(/\.png$/)
  expect(saved[0].prefix).toContain('data:image/png')

  expect(saved[1]).toMatchObject({ plugin: 'ABFileSaver', method: 'saveBase64File', mimeType: 'application/pdf' })
  expect(saved[1].fileName).toMatch(/\.pdf$/)
  expect(saved[1].prefix).toContain('data:application/pdf')
})
