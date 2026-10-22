import { expect, test, type Page } from '@playwright/test'

test.use({ baseURL: 'http://127.0.0.1:5174' })

const ids = {
  owner: '00000000-0000-4000-8000-000000000001',
  cashier: '00000000-0000-4000-8000-000000000002',
  store: '00000000-0000-4000-8000-000000000010',
  product: '00000000-0000-4000-8000-000000000020',
}

async function mockSignedInSupabase(page: Page, role: 'owner' | 'cashier', options: { qris?: boolean | 'legacy' | 'mismatched'; employeeInvite?: boolean } = {}) {
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
    if (url.pathname === '/rest/v1/rpc/confirm_qris_payment') qrisConfirmCalls += 1
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
