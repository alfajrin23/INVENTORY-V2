import { expect, test, type Page } from '@playwright/test'

const releasesPattern = 'https://api.github.com/repos/alfajrin23/INVENTORY-V2/releases?per_page=10'

type NativeCall = { plugin: string; method: string; options?: Record<string, unknown> }

type BackAwareWindow = typeof window & {
  __abHandleNativeBack?: () => void
  nativeCalls: NativeCall[]
}

async function mockAndroid(page: Page, releases: unknown[] = []) {
  await page.route(releasesPattern, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(releases),
  }))

  await page.addInitScript(() => {
    localStorage.setItem('ab:last-seen-release-notes-version:v1', '1.2.0')
    const calls: NativeCall[] = []
    const fakeWindow = window as typeof window & {
      androidBridge: object
      Capacitor: object
      nativeCalls: NativeCall[]
    }

    fakeWindow.androidBridge = {}
    fakeWindow.nativeCalls = calls
    fakeWindow.Capacitor = {
      PluginHeaders: [
        {
          name: 'ABAppUpdate',
          methods: [
            { name: 'getAppInfo', rtype: 'promise' },
            { name: 'canInstallPackages', rtype: 'promise' },
            { name: 'requestInstallPermission', rtype: 'promise' },
            { name: 'downloadAndInstall', rtype: 'promise' },
            { name: 'exitApp', rtype: 'promise' },
            { name: 'addListener', rtype: 'callback' },
            { name: 'removeListener', rtype: 'promise' },
          ],
        },
      ],
      nativePromise: (plugin: string, method: string, options?: Record<string, unknown>) => {
        calls.push({ plugin, method, options })
        if (plugin === 'ABAppUpdate' && method === 'getAppInfo') {
          return Promise.resolve({ versionName: '1.2.0', versionCode: 4 })
        }
        if (plugin === 'ABAppUpdate' && method === 'canInstallPackages') {
          return Promise.resolve({ granted: true })
        }
        return Promise.resolve()
      },
      nativeCallback: () => Promise.resolve('listener-1'),
    }
  })
}

test('Android back closes the top shared dialog before leaving the page', async ({ page }) => {
  await mockAndroid(page)
  await page.goto('/pengaturan.html')

  await page.getByRole('button', { name: 'Panduan Aplikasi' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()

  await page.evaluate(() => (window as BackAwareWindow).__abHandleNativeBack?.())
  await expect(dialog).toBeHidden()
  await expect(page).toHaveURL(/\/pengaturan\.html$/)
})

test('Android back uses the report parent when a detail page has no browser history', async ({ page }) => {
  await mockAndroid(page)
  await page.goto('/pendapatanharian.html')
  await expect(page).toHaveURL(/\/pendapatanharian\.html$/)

  await page.evaluate(() => (window as BackAwareWindow).__abHandleNativeBack?.())
  await expect(page).toHaveURL(/\/laporan\.html$/)
})

test('Android app exits only after two back presses on the dashboard', async ({ page }) => {
  await mockAndroid(page)
  await page.goto('/')

  await page.evaluate(() => (window as BackAwareWindow).__abHandleNativeBack?.())
  await expect.poll(() => page.evaluate(() => (window as BackAwareWindow).nativeCalls
    .filter(call => call.plugin === 'ABAppUpdate' && call.method === 'exitApp').length)).toBe(0)

  await page.evaluate(() => (window as BackAwareWindow).__abHandleNativeBack?.())
  await expect.poll(() => page.evaluate(() => (window as BackAwareWindow).nativeCalls
    .filter(call => call.plugin === 'ABAppUpdate' && call.method === 'exitApp').length)).toBe(1)
})

test('Android updater popup downloads the newer GitHub Release through the native plugin', async ({ page }) => {
  await mockAndroid(page, [
    {
      draft: false,
      prerelease: false,
      tag_name: 'v1.3.0',
      name: 'ABElektronik Inventory 1.3.0',
      body: 'Perbaikan dan fitur baru.',
      published_at: '2026-09-15T07:00:00Z',
      assets: [
        {
          name: 'ABElektronik-Inventory.apk',
          browser_download_url: 'https://github.com/alfajrin23/INVENTORY-V2/releases/download/v1.3.0/ABElektronik-Inventory.apk',
        },
      ],
    },
  ])

  await page.goto('/')
  const updateDialog = page.getByRole('dialog')
  await expect(updateDialog).toContainText('Update aplikasi tersedia')
  await expect(updateDialog).toContainText('versi 1.3.0')
  await expect(updateDialog).toContainText('Yang Baru')
  await expect(updateDialog).toContainText('Perbaikan dan fitur baru.')

  await updateDialog.getByRole('button', { name: 'Update sekarang' }).click()
  await expect.poll(() => page.evaluate(() => (window as BackAwareWindow).nativeCalls
    .some(call => call.plugin === 'ABAppUpdate' && call.method === 'downloadAndInstall'))).toBe(true)
})
