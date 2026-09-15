import { expect, test, type Page } from '@playwright/test'

type InventoryData = {
  products: Array<{ id: string; namaBarang: string; stok: number }>
  history: Array<{ kategori: string; keterangan?: string; jumlah: number; namaBarang: string }>
}

test('shopping cancel never changes stock while confirm uses incoming transaction workflow', async ({ page }) => {
  await page.goto('/belanja.html')
  const buyButton = page.getByRole('button', { name: /^Tandai .* sudah dibeli$/ }).first()
  const label = await buyButton.getAttribute('aria-label')
  const productName = label?.replace(/^Tandai /, '').replace(/ sudah dibeli$/, '') ?? ''
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('ab-elektronik-v2-data') ?? '{}') as InventoryData)
  const beforeProduct = before.products.find(product => product.namaBarang === productName)
  expect(beforeProduct).toBeTruthy()

  await buyButton.click()
  await expect(page.getByRole('dialog')).toContainText('Berapa barang yang dibeli?')
  await page.getByRole('button', { name: 'Batal', exact: true }).click()
  const afterCancel = await page.evaluate(() => JSON.parse(localStorage.getItem('ab-elektronik-v2-data') ?? '{}') as InventoryData)
  expect(afterCancel.products.find(product => product.namaBarang === productName)?.stok).toBe(beforeProduct?.stok)
  expect(afterCancel.history).toHaveLength(before.history.length)

  await page.getByRole('button', { name: `Tandai ${productName} sudah dibeli` }).click()
  await page.getByLabel('Jumlah barang dibeli').fill('2')
  await page.getByRole('button', { name: 'Tambah ke Stok' }).click()
  await expect(page.getByText(`${productName} ditambahkan ke stok`)).toBeVisible()

  await expect.poll(() => page.evaluate(name => {
    const data = JSON.parse(localStorage.getItem('ab-elektronik-v2-data') ?? '{}') as InventoryData
    return data.products.find(product => product.namaBarang === name)?.stok
  }, productName)).toBe((beforeProduct?.stok ?? 0) + 2)

  const afterConfirm = await page.evaluate(() => JSON.parse(localStorage.getItem('ab-elektronik-v2-data') ?? '{}') as InventoryData)
  expect(afterConfirm.history).toHaveLength(before.history.length + 1)
  expect(afterConfirm.history.at(-1)).toMatchObject({ kategori: 'masuk', keterangan: 'Belanja stok', jumlah: 2, namaBarang: productName })
})

test('Shopping Mode survives reload per store and finish clears local active state', async ({ page }) => {
  await page.goto('/belanja.html')
  await page.getByRole('button', { name: 'Mulai Mode Belanja' }).click()
  await expect(page.getByRole('status')).toContainText('Mode Belanja Aktif')
  await page.reload()
  await expect(page.getByRole('status')).toContainText('Mode Belanja Aktif')

  await page.getByRole('button', { name: 'Selesaikan Belanja' }).click()
  await expect(page.getByText('Mode Belanja selesai')).toBeVisible()
  await page.reload()
  await expect(page.getByText('Mode Belanja Aktif')).toHaveCount(0)
  const activeStates = await page.evaluate(() => Object.entries(localStorage)
    .filter(([key]) => key.startsWith('ab:shopping-mode:v1:'))
    .map(([, value]) => (JSON.parse(value) as { active?: boolean }).active))
  expect(activeStates.every(value => value === false)).toBe(true)
})

test('release notes appears once per installed version and appears again when version marker changes', async ({ page }) => {
  await page.route('https://api.github.com/repos/alfajrin23/INVENTORY-V2/releases?per_page=10', route => route.fulfill({ status: 200, json: [] }))
  await page.addInitScript(() => localStorage.removeItem('ab:last-seen-release-notes-version:v1'))
  await page.goto('/')

  const whatsNew = page.getByRole('dialog').filter({ hasText: 'Yang Baru di Inventory V2' })
  await expect(whatsNew).toBeVisible()
  await whatsNew.getByRole('button', { name: 'Mengerti' }).click()
  await expect.poll(() => page.evaluate(() => localStorage.getItem('ab:last-seen-release-notes-version:v1'))).toBe('1.1.0-beta.2')

  await page.reload()
  await page.waitForTimeout(1200)
  await expect(page.getByRole('dialog').filter({ hasText: 'Yang Baru di Inventory V2' })).toHaveCount(0)

  await page.evaluate(() => localStorage.setItem('ab:last-seen-release-notes-version:v1', '0.9.0'))
  await page.reload()
  await expect(page.getByRole('dialog').filter({ hasText: 'Yang Baru di Inventory V2' })).toBeVisible()
})

test('revenue period buttons never overlap from 320px through desktop', async ({ page }) => {
  for (const width of [320, 360, 390, 412, 768, 1280]) {
    await page.setViewportSize({ width, height: width < 600 ? 800 : 900 })
    await page.goto('/pendapatanharian.html')
    const tabs = ['Harian', 'Mingguan', 'Bulanan', 'Tahunan'].map(name => page.getByRole('tab', { name }))
    const boxes = []
    for (const tab of tabs) {
      await expect(tab).toBeVisible()
      const box = await tab.boundingBox()
      expect(box).not.toBeNull()
      expect(box!.height).toBeGreaterThanOrEqual(44)
      boxes.push(box!)
    }
    for (let left = 0; left < boxes.length; left += 1) {
      for (let right = left + 1; right < boxes.length; right += 1) {
        const a = boxes[left]
        const b = boxes[right]
        const overlaps = a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
        expect(overlaps, `tabs overlap at ${width}px`).toBe(false)
      }
    }
    const columns = await page.getByRole('tablist').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').filter(Boolean).length)
    expect(columns).toBe(width < 640 ? 2 : 4)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
  }
})

async function mockShoppingAndroid(page: Page) {
  await page.route('https://api.github.com/repos/alfajrin23/INVENTORY-V2/releases?per_page=10', route => route.fulfill({ status: 200, json: [] }))
  await page.addInitScript(() => {
    localStorage.setItem('ab:last-seen-release-notes-version:v1', '1.2.0')
    const calls: Array<{ plugin: string; method: string; options?: Record<string, unknown> }> = []
    const delivered: number[] = []
    const methods = (names: string[]) => names.map(name => ({ name, rtype: name === 'addListener' ? 'callback' : 'promise' }))
    const fakeWindow = window as typeof window & { androidBridge: object; Capacitor: object; nativeCalls: typeof calls }
    fakeWindow.androidBridge = {}
    fakeWindow.nativeCalls = calls
    fakeWindow.Capacitor = {
      PluginHeaders: [
        { name: 'ABAppUpdate', methods: methods(['getAppInfo', 'canInstallPackages', 'addListener', 'removeListener', 'exitApp']) },
        { name: 'LocalNotifications', methods: methods(['addListener', 'removeListener', 'createChannel', 'registerActionTypes', 'checkPermissions', 'requestPermissions', 'areEnabled', 'listChannels', 'schedule', 'getDeliveredNotifications', 'cancel', 'removeDeliveredNotificationsById']) },
      ],
      nativeCallback: () => Promise.resolve('listener-1'),
      nativePromise: (plugin: string, method: string, options?: Record<string, unknown>) => {
        calls.push({ plugin, method, options })
        if (plugin === 'ABAppUpdate' && method === 'getAppInfo') return Promise.resolve({ versionName: '1.2.0', versionCode: 4 })
        if (plugin === 'ABAppUpdate' && method === 'canInstallPackages') return Promise.resolve({ granted: true })
        if (method === 'checkPermissions' || method === 'requestPermissions') return Promise.resolve({ display: 'granted' })
        if (method === 'areEnabled') return Promise.resolve({ value: true })
        if (method === 'listChannels') return Promise.resolve({ channels: [] })
        if (method === 'schedule') {
          const ids = ((options?.notifications ?? []) as Array<{ id: number }>).map(notification => notification.id)
          for (const id of ids) if (!delivered.includes(id)) delivered.push(id)
          return Promise.resolve()
        }
        if (method === 'getDeliveredNotifications') return Promise.resolve({ notifications: delivered.map(id => ({ id })) })
        if (method === 'cancel') {
          const ids = ((options?.notifications ?? []) as Array<{ id: number }>).map(notification => notification.id)
          for (const id of ids) {
            const index = delivered.indexOf(id)
            if (index >= 0) delivered.splice(index, 1)
          }
          return Promise.resolve()
        }
        return Promise.resolve()
      },
    }
  })
}

test('Android Shopping Mode posts ongoing notification and finish cancels it without polling', async ({ page }) => {
  await mockShoppingAndroid(page)
  await page.goto('/belanja.html')
  await page.getByRole('button', { name: 'Mulai Mode Belanja' }).click()

  await expect.poll(() => page.evaluate(() => (window as typeof window & { nativeCalls: Array<{ method: string; options?: { notifications?: Array<{ id: number; title?: string; ongoing?: boolean }> } }> }).nativeCalls
    .some(call => call.method === 'schedule' && call.options?.notifications?.some(notification => notification.id === 2202 && notification.title?.includes('Mode Belanja') && notification.ongoing === true)))).toBe(true)

  const scheduleCount = await page.evaluate(() => (window as typeof window & { nativeCalls: Array<{ method: string }> }).nativeCalls.filter(call => call.method === 'schedule').length)
  await page.waitForTimeout(600)
  expect(await page.evaluate(() => (window as typeof window & { nativeCalls: Array<{ method: string }> }).nativeCalls.filter(call => call.method === 'schedule').length)).toBe(scheduleCount)

  await page.getByRole('button', { name: 'Selesaikan Belanja' }).click()
  await expect.poll(() => page.evaluate(() => (window as typeof window & { nativeCalls: Array<{ method: string; options?: { notifications?: Array<{ id: number }> } }> }).nativeCalls
    .some(call => call.method === 'cancel' && call.options?.notifications?.some(notification => notification.id === 2202)))).toBe(true)
})
