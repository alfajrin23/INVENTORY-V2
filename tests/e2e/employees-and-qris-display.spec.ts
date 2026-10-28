import { expect, test, type Page } from '@playwright/test'

test.use({ baseURL: 'http://127.0.0.1:5174' })

const ids = {
  owner: '00000000-0000-4000-8000-000000000001',
  cashier: '00000000-0000-4000-8000-000000000002',
  store: '00000000-0000-4000-8000-000000000010',
  product: '00000000-0000-4000-8000-000000000020',
}

async function mockSignedInSupabase(page: Page, role: 'owner' | 'cashier', options: { qris?: boolean | 'legacy' | 'mismatched'; employeeInvite?: boolean; autoConfirmNotification?: boolean } = {}) {
  const userId = role === 'owner' ? ids.owner : ids.cashier
  const email = role === 'owner' ? 'owner@example.test' : 'cashier@example.test'
  const user = { id: userId, aud: 'authenticated', role: 'authenticated', email, created_at: new Date().toISOString(), app_metadata: {}, user_metadata: {} }
  const token = [{ alg: 'HS256', typ: 'JWT' }, { sub: userId, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }, 'signature']
    .map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.')
  const headers = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'content-type': 'application/json',
  }
  let qrisConfirmCalls = 0
  let inventoryTransactionCalls = 0
  let employeeInviteCalls = 0

  await page.route('http://127.0.0.1:54321/**', async route => {
    const url = new URL(route.request().url())
    const method = route.request().method()
    if (method === 'OPTIONS') { await route.fulfill({ status: 200, headers, body: '' }); return }
    if (url.pathname === '/auth/v1/token') {
      await route.fulfill({ headers, json: { access_token: token, refresh_token: 'test-refresh', expires_in: 3600, token_type: 'bearer', user } })
      return
    }
    if (url.pathname === '/auth/v1/user') { await route.fulfill({ headers, json: user }); return }
    if (url.pathname === '/rest/v1/rpc/current_store_role') { await route.fulfill({ headers, json: role }); return }
    if (url.pathname === '/rest/v1/stores') {
      await route.fulfill({ headers, json: [{ id: ids.store, owner_id: ids.owner, name: 'Cabang QRIS', address: 'Majalengka', address_link: '', created_at: new Date().toISOString() }] })
      return
    }
    if (url.pathname === '/rest/v1/products') {
      await route.fulfill({ headers, json: [{ id: ids.product, store_id: ids.store, nama_barang: 'Lampu QRIS', brand: 'Philips', harga: 15000, stok: 5, barcode: '987', created_at: new Date().toISOString() }] })
      return
    }
    if (['/rest/v1/history', '/rest/v1/audit_logs', '/rest/v1/store_memberships'].includes(url.pathname)) {
      await route.fulfill({ headers, json: [] })
      return
    }
    if (url.pathname === '/rest/v1/app_branding') {
      await route.fulfill({ headers, json: [{ profile_photo_url: null }] })
      return
    }
    if (url.pathname === '/functions/v1/create-qris-payment' && options.qris) {
      const now = Date.now()
      const response = {
        id: '00000000-0000-4000-8000-000000000030',
        orderId: 'ABE-TEST-QRIS',
        amount: options.qris === 'mismatched' ? 10000 : 15000,
        qrString: 'TEST-QR-PAYLOAD',
        expiresAt: new Date(now + 15 * 60 * 1000).toISOString(),
        ...(options.qris === 'legacy' ? {} : {
          merchantName: 'ABElektronik',
          createdAt: new Date(now - 1000).toISOString(),
        }),
      }
      await route.fulfill({ headers, json: response })
      return
    }
    if (url.pathname === '/functions/v1/manage-store-member' && options.employeeInvite) {
      employeeInviteCalls += 1
      await route.fulfill({ headers, json: { ok: true } })
      return
    }
    if (url.pathname === '/rest/v1/qris_payments' && options.autoConfirmNotification) {
      const select = url.searchParams.get('select')
      if (select === 'id') {
        await route.fulfill({ headers, json: [{ id: '00000000-0000-4000-8000-000000000030' }] })
        return
      }
    }
    if (url.pathname === '/rest/v1/rpc/confirm_qris_payment') {
      qrisConfirmCalls += 1
      if (options.autoConfirmNotification) {
        await route.fulfill({ headers, json: { status: 'paid' } })
        return
      }
    }
    if (url.pathname === '/rest/v1/rpc/process_inventory_transaction') inventoryTransactionCalls += 1
    await route.fulfill({ status: 400, headers, json: { message: `Unexpected request: ${method} ${url.pathname}` } })
  })

  return {
    qrisConfirmCalls: () => qrisConfirmCalls,
    inventoryTransactionCalls: () => inventoryTransactionCalls,
    employeeInviteCalls: () => employeeInviteCalls,
    signIn: async () => {
      await page.goto('/')
      await page.getByLabel('Email', { exact: true }).fill(email)
      await page.getByLabel('Password', { exact: true }).fill('test-password')
      await page.getByRole('button', { name: 'Masuk', exact: true }).click()
      await expect(page.getByText('Cabang QRIS').first()).toBeVisible()
    },
  }
}

async function mockAndroidPaymentSpeech(page: Page) {
  await page.addInitScript(() => {
    const paymentNotification = () => ({
      fingerprint: 'a'.repeat(64),
      amount: 15000,
      sourcePackage: 'com.gojek.gopaymerchant',
      notificationAt: Date.now(),
      paymentSuccess: true,
    })
    const deliveredNotifications: Array<{ id: number }> = []
    const pluginHeaders = ['ABAppUpdate', 'ABQrisNotification', 'ABScreenBrightness', 'ABPaymentSpeech', 'LocalNotifications']
      .map(name => ({ name, methods: [
        { name: 'addListener', rtype: 'callback' },
        { name: 'removeListener', rtype: 'promise' },
        ...({
          ABAppUpdate: ['getAppInfo', 'canInstallPackages', 'requestInstallPermission', 'downloadAndInstall', 'exitApp'],
          ABQrisNotification: ['checkAccess', 'openSettings', 'getPendingNotifications', 'consumeNotification'],
          ABScreenBrightness: ['maximize', 'restore'],
          ABPaymentSpeech: ['speak'],
          LocalNotifications: ['checkPermissions', 'requestPermissions', 'areEnabled', 'createChannel', 'registerActionTypes', 'listChannels', 'schedule', 'getDeliveredNotifications', 'cancel', 'removeDeliveredNotificationsById'],
        } as Record<string, string[]>)[name].map(method => ({ name: method, rtype: 'promise' })),
      ] }))

    const nativePromise = (plugin: string, method: string, options: { notifications?: Array<{ id: number }>; text?: string; url?: string } = {}) => {
      ;(window as Window & { nativeCalls: Array<{ plugin: string; method: string; options?: { text?: string; url?: string; profile?: string } }> }).nativeCalls.push({ plugin, method, options })
      if (plugin === 'ABAppUpdate' && method === 'getAppInfo') return Promise.resolve({ versionName: '1.2.8', versionCode: 12 })
      if (plugin === 'ABAppUpdate' && method === 'canInstallPackages') return Promise.resolve({ granted: true })
      if (plugin === 'ABQrisNotification' && method === 'checkAccess') return Promise.resolve({ enabled: true })
      if (plugin === 'ABQrisNotification' && method === 'getPendingNotifications') return Promise.resolve({ notifications: [paymentNotification()] })
      if (plugin === 'LocalNotifications' && method === 'checkPermissions') return Promise.resolve({ display: 'granted' })
      if (plugin === 'LocalNotifications' && method === 'requestPermissions') return Promise.resolve({ display: 'granted' })
      if (plugin === 'LocalNotifications' && method === 'areEnabled') return Promise.resolve({ value: true })
      if (plugin === 'LocalNotifications' && method === 'listChannels') return Promise.resolve({ channels: [] })
      if (plugin === 'LocalNotifications' && method === 'schedule') {
        deliveredNotifications.push(...(options.notifications ?? []))
        return Promise.resolve({ notifications: options.notifications ?? [] })
      }
      if (plugin === 'LocalNotifications' && method === 'getDeliveredNotifications') return Promise.resolve({ notifications: deliveredNotifications })
      return Promise.resolve({})
    }
    Object.assign(window, {
      nativeCalls: [] as Array<{ plugin: string; method: string; options?: { text?: string; url?: string; profile?: string } }>,
      androidBridge: {},
      Capacitor: {
        PluginHeaders: pluginHeaders,
        nativePromise,
        nativeCallback: (_plugin: string, _method: string, _options: unknown) => Promise.resolve(`listener-${Date.now()}`),
      },
    })
  })
}

test('QRIS checkout shows the server-provided merchant name without confirming payment', async ({ page }) => {
  const mock = await mockSignedInSupabase(page, 'owner', { qris: true })
  await page.setViewportSize({ width: 1440, height: 900 })
  await mock.signIn()

  await page.getByRole('button', { name: 'Scan', exact: true }).click()
  await page.getByLabel('Input barcode manual').fill('987')
  await page.getByRole('button', { name: 'Cari barcode' }).click()
  await page.getByRole('button', { name: 'Proses', exact: true }).click()
  await page.getByRole('button', { name: /^QRIS/ }).click()

  await expect(page.getByRole('heading', { name: 'QRIS pembayaran' })).toBeVisible()
  await expect(page.getByText(/Merchant: ABElektronik/)).toBeVisible()
  const qrisDialog = page.getByRole('dialog').filter({ hasText: 'Merchant: ABElektronik' })
  await expect(qrisDialog.getByText(/Rp\s*15\.000/).last()).toBeVisible()
  expect(mock.qrisConfirmCalls()).toBe(0)
  expect(mock.inventoryTransactionCalls()).toBe(0)
})

test('QRIS checkout accepts the existing server response shape and still checks the amount', async ({ page }) => {
  const legacyMock = await mockSignedInSupabase(page, 'owner', { qris: 'legacy' })
  await page.setViewportSize({ width: 1440, height: 900 })
  await legacyMock.signIn()

  await page.getByRole('button', { name: 'Scan', exact: true }).click()
  await page.getByLabel('Input barcode manual').fill('987')
  await page.getByRole('button', { name: 'Cari barcode' }).click()
  await page.getByRole('button', { name: 'Proses', exact: true }).click()
  await page.getByRole('button', { name: /^QRIS/ }).click()

  const qrisDialog = page.getByRole('dialog').filter({ hasText: 'Merchant: ABElektronik' })
  await expect(qrisDialog).toBeVisible()
  await expect(qrisDialog.getByText(/Rp\s*15\.000/).last()).toBeVisible()
  expect(legacyMock.qrisConfirmCalls()).toBe(0)
  expect(legacyMock.inventoryTransactionCalls()).toBe(0)

  await page.context().clearCookies()
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  const mismatchedMock = await mockSignedInSupabase(page, 'owner', { qris: 'mismatched' })
  await mismatchedMock.signIn()
  await page.getByRole('button', { name: 'Scan', exact: true }).click()
  await page.getByLabel('Input barcode manual').fill('987')
  await page.getByRole('button', { name: 'Cari barcode' }).click()
  await page.getByRole('button', { name: 'Proses', exact: true }).click()
  await page.getByRole('button', { name: /^QRIS/ }).click()

  await expect(page.getByText('QRIS dari server tidak sesuai dengan total keranjang. Transaksi belum dibuat.')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'QRIS pembayaran' })).toHaveCount(0)
  expect(mismatchedMock.qrisConfirmCalls()).toBe(0)
  expect(mismatchedMock.inventoryTransactionCalls()).toBe(0)
})

test('successful GoPay notification speaks the confirmed QRIS amount on Android', async ({ page }) => {
  await mockAndroidPaymentSpeech(page)
  const mock = await mockSignedInSupabase(page, 'owner', { qris: true, autoConfirmNotification: true })
  await page.setViewportSize({ width: 1440, height: 900 })
  await mock.signIn()

  await page.getByRole('button', { name: 'Scan', exact: true }).click()
  await page.getByLabel('Input barcode manual').fill('987')
  await page.getByRole('button', { name: 'Cari barcode' }).click()
  await page.getByRole('button', { name: 'Proses', exact: true }).click()
  await page.getByRole('button', { name: /^QRIS/ }).click()

  await expect.poll(async () => page.evaluate(() =>
    (window as Window & { nativeCalls: Array<{ plugin: string; method: string; options?: { text?: string } }> }).nativeCalls
      .find(call => call.plugin === 'ABPaymentSpeech' && call.method === 'speak')?.options?.text,
  )).toBe('Pembayaran Berhasil Melalui QRIS sebesar lima belas ribu rupiah.')
  expect(mock.qrisConfirmCalls()).toBe(1)
})

test('new GitHub APK triggers the update popup and can be downloaded from Settings', async ({ page }) => {
  await mockAndroidPaymentSpeech(page)
  const mock = await mockSignedInSupabase(page, 'owner')
  const apkUrl = 'https://github.com/alfajrin23/INVENTORY-V2/releases/download/v1.2.9/ABElektronik-Inventory.apk'
  await page.route('https://api.github.com/**', async route => {
    await route.fulfill({
      headers: { 'content-type': 'application/json' },
      json: [{
        draft: false,
        prerelease: false,
        tag_name: 'v1.2.9',
        name: 'ABElektronik Inventory 1.2.9',
        body: 'Update menu Pengaturan dan pilihan suara konfirmasi QRIS.',
        published_at: new Date().toISOString(),
        html_url: 'https://github.com/alfajrin23/INVENTORY-V2/releases/tag/v1.2.9',
        assets: [{ name: 'ABElektronik-Inventory.apk', browser_download_url: apkUrl }],
      }],
    })
  })
  await page.goto('/')
  await page.getByLabel('Email', { exact: true }).fill('owner@example.test')
  await page.getByLabel('Password', { exact: true }).fill('test-password')
  await page.getByRole('button', { name: 'Masuk', exact: true }).click()
  const updateDialog = page.getByRole('dialog').filter({ hasText: 'Update aplikasi tersedia' })
  await expect(updateDialog).toBeVisible()
  await updateDialog.getByRole('button', { name: 'Nanti' }).click()
  await expect(page.getByText('Cabang QRIS').first()).toBeVisible()

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/pengaturan.html')
  await page.getByRole('link', { name: /Update aplikasi/i }).click()
  await page.getByRole('button', { name: 'Cek versi terbaru' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Versi 1.2.9 tersedia' })).toBeVisible()
  await page.getByRole('button', { name: 'Download asset & update' }).click()

  await expect.poll(async () => page.evaluate(() =>
    (window as Window & { nativeCalls: Array<{ plugin: string; method: string; options?: { url?: string } }> }).nativeCalls
      .find(call => call.plugin === 'ABAppUpdate' && call.method === 'downloadAndInstall')?.options?.url,
  )).toBe(apkUrl)
})

test('QRIS voice profile can be selected and previewed from Settings', async ({ page }) => {
  await mockAndroidPaymentSpeech(page)
  const mock = await mockSignedInSupabase(page, 'owner')
  await mock.signIn()
  await page.goto('/pengaturan.html')

  await page.getByRole('button', { name: /Perempuan formal/ }).click()
  await page.getByRole('button', { name: 'Putar contoh suara' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Terpilih: Perempuan formal' })).toBeVisible()
  await expect.poll(async () => page.evaluate(() =>
    (window as Window & { nativeCalls: Array<{ plugin: string; method: string; options?: { text?: string; profile?: string } }> }).nativeCalls
      .find(call => call.plugin === 'ABPaymentSpeech' && call.method === 'speak')?.options,
  )).toMatchObject({
    profile: 'female_formal',
    text: 'Pembayaran Berhasil Melalui QRIS sebesar seratus lima puluh ribu rupiah.',
  })
})

test('owner can invite a manager by email and cashier is limited to outgoing scanner and QRIS history', async ({ page }) => {
  const ownerMock = await mockSignedInSupabase(page, 'owner', { employeeInvite: true })
  await ownerMock.signIn()
  await page.goto('/profilsetting.html')
  await expect(page.getByRole('heading', { name: 'Cabang & Karyawan' })).toBeVisible()
  await page.getByLabel('Email karyawan').fill('manager@example.test')
  await page.getByLabel('Jabatan').click()
  await page.getByRole('option', { name: 'Manager' }).click()
  await page.getByRole('button', { name: 'Undang' }).click()
  await expect(page.getByText(/Karyawan menetapkan password melalui tautan undangan/)).toBeVisible()
  expect(ownerMock.employeeInviteCalls()).toBe(1)

  await page.context().clearCookies()
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  const cashierMock = await mockSignedInSupabase(page, 'cashier')
  await cashierMock.signIn()
  await expect(page.getByRole('heading', { name: 'Transaksi barang keluar' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Buka Voice AI' })).toHaveCount(0)
  await page.goto('/databarang.html')
  await expect(page.getByRole('alert')).toContainText('hanya dapat mencatat barang keluar')
  await page.goto('/profilsetting.html')
  await expect(page.getByRole('button', { name: 'Tambah Toko' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Cabang & Karyawan' })).toHaveCount(0)
})
