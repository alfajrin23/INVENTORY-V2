import { expect, test, type Page } from '@playwright/test'

type NativeCall = { plugin: string; method: string; options?: Record<string, unknown> }

type NativeTestWindow = typeof window & {
  nativeCalls: NativeCall[]
}

type MockConfig = {
  saved: boolean
  connected: boolean
  connectFails?: boolean
}

async function mockThermalAndroid(page: Page, config: MockConfig) {
  await page.route('https://api.github.com/repos/alfajrin23/INVENTORY-V2/releases?per_page=10', route => route.fulfill({ status: 200, json: [] }))
  await page.addInitScript(initial => {
    localStorage.setItem('ab:last-seen-release-notes-version:v1', '1.2.0')
    const device = { name: 'XANTRI BT-58D PRO', address: '11:22:33:44:55:66', bonded: true }
    const state = { saved: initial.saved ? device : null as typeof device | null, connected: initial.connected }
    const calls: NativeCall[] = []
    const methods = (names: string[]) => names.map(name => ({ name, rtype: name === 'addListener' ? 'callback' : 'promise' }))
    const fakeWindow = window as typeof window & {
      androidBridge: object
      Capacitor: object
      nativeCalls: NativeCall[]
    }
    fakeWindow.androidBridge = {}
    fakeWindow.nativeCalls = calls
    fakeWindow.Capacitor = {
      PluginHeaders: [
        { name: 'ABAppUpdate', methods: methods(['getAppInfo', 'canInstallPackages', 'requestInstallPermission', 'downloadAndInstall', 'exitApp', 'addListener', 'removeListener']) },
        { name: 'ABThermalPrinter', methods: methods(['isBluetoothSupported', 'getBluetoothState', 'requestBluetoothPermissions', 'getPairedPrinters', 'discoverPrinters', 'connect', 'disconnect', 'getConnectionStatus', 'getSavedPrinter', 'saveDefaultPrinter', 'forgetPrinter', 'testPrint', 'printReceipt', 'printBarcode', 'printQr']) },
        { name: 'LocalNotifications', methods: methods(['addListener', 'removeListener', 'createChannel', 'registerActionTypes', 'checkPermissions', 'requestPermissions', 'areEnabled', 'listChannels', 'schedule', 'getDeliveredNotifications', 'cancel', 'removeDeliveredNotificationsById']) },
      ],
      nativeCallback: () => Promise.resolve('listener-1'),
      nativePromise: (plugin: string, method: string, options?: Record<string, unknown>) => {
        calls.push({ plugin, method, options })
        if (plugin === 'ABAppUpdate' && method === 'getAppInfo') return Promise.resolve({ versionName: '1.2.0', versionCode: 4 })
        if (plugin === 'ABAppUpdate' && method === 'canInstallPackages') return Promise.resolve({ granted: true })
        if (plugin === 'LocalNotifications' && method === 'checkPermissions') return Promise.resolve({ display: 'denied' })
        if (plugin === 'LocalNotifications' && method === 'requestPermissions') return Promise.resolve({ display: 'denied' })
        if (plugin === 'LocalNotifications' && method === 'areEnabled') return Promise.resolve({ value: true })
        if (plugin === 'LocalNotifications' && method === 'listChannels') return Promise.resolve({ channels: [] })
        if (plugin === 'LocalNotifications' && method === 'getDeliveredNotifications') return Promise.resolve({ notifications: [] })

        if (plugin === 'ABThermalPrinter' && method === 'isBluetoothSupported') return Promise.resolve({ supported: true })
        if (plugin === 'ABThermalPrinter' && method === 'getBluetoothState') return Promise.resolve({ supported: true, enabled: true, state: 'on' })
        if (plugin === 'ABThermalPrinter' && method === 'requestBluetoothPermissions') return Promise.resolve({ granted: true })
        if (plugin === 'ABThermalPrinter' && method === 'getPairedPrinters') return Promise.resolve({ devices: [device] })
        if (plugin === 'ABThermalPrinter' && method === 'discoverPrinters') return Promise.resolve({ devices: [device] })
        if (plugin === 'ABThermalPrinter' && method === 'getSavedPrinter') return Promise.resolve({ printer: state.saved })
        if (plugin === 'ABThermalPrinter' && method === 'getConnectionStatus') {
          return Promise.resolve({ connected: state.connected, address: state.connected ? state.saved?.address : undefined, name: state.connected ? state.saved?.name : undefined })
        }
        if (plugin === 'ABThermalPrinter' && method === 'connect') {
          if (initial.connectFails) return Promise.reject(new Error('Printer tidak ditemukan'))
          state.connected = true
          return Promise.resolve({ connected: true, address: options?.address, name: state.saved?.name ?? device.name })
        }
        if (plugin === 'ABThermalPrinter' && method === 'saveDefaultPrinter') {
          state.saved = { name: String(options?.name ?? device.name), address: String(options?.address ?? device.address), bonded: true }
          return Promise.resolve()
        }
        if (plugin === 'ABThermalPrinter' && method === 'forgetPrinter') {
          state.saved = null
          state.connected = false
          return Promise.resolve()
        }
        return Promise.resolve()
      },
    }
  }, config)
}

async function chooseFirstBarcode(page: Page) {
  await page.getByRole('button', { name: 'Cetak Barcode', exact: true }).click()
  await page.getByRole('button', { name: /^Pilih / }).first().click()
}

async function calls(page: Page) {
  return page.evaluate(() => (window as NativeTestWindow).nativeCalls)
}

test('first barcode print opens one-time printer setup then automatically continues pending print', async ({ page }) => {
  await mockThermalAndroid(page, { saved: false, connected: false })
  await page.goto('/databarang.html')
  await chooseFirstBarcode(page)
  await page.getByRole('button', { name: /Cetak 1 Barcode/ }).click()

  await expect(page.getByRole('dialog').filter({ hasText: 'Hubungkan printer untuk mencetak' })).toBeVisible()
  await page.getByRole('button', { name: 'Cari Printer Bluetooth' }).click()
  await page.getByRole('listitem', { name: 'Hubungkan XANTRI BT-58D PRO' }).click()

  await expect.poll(async () => (await calls(page)).filter(call => call.plugin === 'ABThermalPrinter' && call.method === 'printBarcode').length).toBe(1)
  expect((await calls(page)).filter(call => call.plugin === 'ABThermalPrinter' && call.method === 'saveDefaultPrinter')).toHaveLength(1)
})

test('disconnected saved printer auto reconnects before direct barcode print', async ({ page }) => {
  await mockThermalAndroid(page, { saved: true, connected: false })
  await page.goto('/databarang.html')
  await chooseFirstBarcode(page)
  await page.getByRole('button', { name: /Cetak 1 Barcode/ }).click()

  await expect.poll(async () => (await calls(page)).some(call => call.plugin === 'ABThermalPrinter' && call.method === 'printBarcode')).toBe(true)
  const printerCalls = (await calls(page)).filter(call => call.plugin === 'ABThermalPrinter')
  const connectIndex = printerCalls.findIndex(call => call.method === 'connect')
  const printIndex = printerCalls.findIndex(call => call.method === 'printBarcode')
  expect(connectIndex).toBeGreaterThanOrEqual(0)
  expect(printIndex).toBeGreaterThan(connectIndex)
})

test('failed reconnect keeps pending print and shows connect-and-print setup', async ({ page }) => {
  await mockThermalAndroid(page, { saved: true, connected: false, connectFails: true })
  await page.goto('/databarang.html')
  await chooseFirstBarcode(page)
  await page.getByRole('button', { name: /Cetak 1 Barcode/ }).click()

  await expect(page.getByRole('dialog').filter({ hasText: 'Hubungkan printer untuk mencetak' })).toBeVisible()
  await expect(page.getByText(/Printer tidak ditemukan/).first()).toBeVisible()
  expect((await calls(page)).some(call => call.plugin === 'ABThermalPrinter' && call.method === 'printBarcode')).toBe(false)
})

test('settings Test Print uses the native thermal bridge', async ({ page }) => {
  await mockThermalAndroid(page, { saved: true, connected: true })
  await page.goto('/pengaturan.html')
  await page.getByRole('button', { name: 'Test Print' }).click()
  await expect.poll(async () => (await calls(page)).some(call => call.plugin === 'ABThermalPrinter' && call.method === 'testPrint')).toBe(true)
})

test('transaction receipt direct prints through native ESC/POS with barcode and QR preferences', async ({ page }) => {
  await mockThermalAndroid(page, { saved: true, connected: true })
  await page.goto('/')
  await page.getByRole('button', { name: 'Scan', exact: true }).click()
  await page.getByLabel('Input barcode manual').fill('8991001000011')
  await page.getByRole('button', { name: 'Cari barcode' }).click()
  await expect(page.getByRole('heading', { name: 'Keranjang Transaksi' })).toBeVisible()
  await page.getByRole('button', { name: 'Proses', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Transaksi selesai' })).toBeVisible()
  await page.getByRole('button', { name: 'Lihat Resi' }).click()
  await page.getByRole('button', { name: 'Print Resi' }).click()

  await expect.poll(async () => (await calls(page)).some(call => call.plugin === 'ABThermalPrinter' && call.method === 'printReceipt')).toBe(true)
  const receiptCall = (await calls(page)).find(call => call.plugin === 'ABThermalPrinter' && call.method === 'printReceipt')
  expect(receiptCall?.options).toMatchObject({ receipt: { printBarcode: true, printQr: true } })
})
