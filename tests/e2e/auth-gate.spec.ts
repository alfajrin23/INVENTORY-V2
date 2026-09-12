import { expect, test } from '@playwright/test'

test.use({ baseURL: 'http://127.0.0.1:5174' })

test('login fits mobile and password visibility can be toggled', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 760 })
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Masuk ke Inventory' })).toBeVisible()
  await expect(page.locator('.auth-mascot img')).toHaveJSProperty('complete', true)
  const password = page.getByLabel('Password', { exact: true })
  await password.fill('secret-password')
  await expect(password).toHaveAttribute('type', 'password')
  await page.getByRole('button', { name: 'Tampilkan password' }).click()
  await expect(password).toHaveAttribute('type', 'text')
  await page.getByRole('button', { name: 'Sembunyikan password' }).click()
  await expect(password).toHaveAttribute('type', 'password')

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('forgot password sends a recovery request and returns to login', async ({ page }) => {
  let requestedEmail = ''
  await page.route('http://127.0.0.1:54321/auth/v1/recover', async route => {
    requestedEmail = route.request().postDataJSON().email
    await route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, json: {} })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Lupa password?' }).click()
  await expect(page.getByRole('heading', { name: 'Pulihkan akun' })).toBeVisible()
  await page.getByLabel('Email', { exact: true }).fill('owner@example.test')
  await page.getByRole('button', { name: 'Kirim tautan' }).click()
  await expect(page.getByRole('status')).toContainText('tautan pemulihan telah dikirim')
  expect(requestedEmail).toBe('owner@example.test')
  await page.getByRole('button', { name: 'Kembali ke masuk' }).click()
  await expect(page.getByRole('heading', { name: 'Masuk ke Inventory' })).toBeVisible()
})
