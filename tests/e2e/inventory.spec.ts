import { test, expect, type Page } from '@playwright/test'
import { parseVoiceCommand, parseVoiceDraftEdit, matchVoiceProducts } from '../../src/lib/voice-command'

const routes = ['/', '/databarang.html', '/history.html', '/laporan.html', '/laporanbarangmasuk.html', '/laporanbarangkeluar.html', '/laporanstokbarang.html', '/laporanpendapatan.html', '/pendapatanharian.html', '/pendapatanmingguan.html', '/pendapatanbulanan.html', '/pengaturan.html', '/profilsetting.html']
async function data(page: Page) { return page.evaluate(() => JSON.parse(localStorage.getItem('ab-elektronik-v2-data')!)) }
async function mockSpeech(page: Page, text = '', error = '') {
  await page.addInitScript(({ text, error }) => {
    class SpeechMock {
      lang = ''; interimResults = false; continuous = false
      onstart?: () => void; onend?: () => void; onresult?: (e: unknown) => void; onerror?: (e: unknown) => void
      timer?: ReturnType<typeof setTimeout>
      start() {
        this.onstart?.()
        this.timer = setTimeout(() => {
          if (error) { this.onerror?.({ error }); return }
          this.onresult?.({ results: [Object.assign([{ transcript: text }], { isFinal: true })] }); this.onend?.()
        }, 80)
      }
      stop() { this.onend?.() }
      abort() { clearTimeout(this.timer); (window as unknown as { aborted: number }).aborted = ((window as unknown as { aborted: number }).aborted || 0) + 1 }
    }
    Object.defineProperty(window, 'SpeechRecognition', { value: SpeechMock, configurable: true })
  }, { text, error })
}
async function voice(page: Page, command: string) {
  await mockSpeech(page, command)
  await page.goto('/')
  await page.getByRole('button', { name: 'Buka Voice AI' }).click()
}

test('parser understands Indonesian intents, numbers, aliases and multiple items', () => {
  for (const word of ['barang masuk','masuk','restok','stok masuk','tambah stok','tambahkan stok','masukkan stok']) expect(parseVoiceCommand(`${word} lampu Philips lima`).category).toBe('masuk')
  for (const word of ['transaksi','jual','penjualan','barang keluar','keluar']) expect(parseVoiceCommand(`${word} lampu Philips sebanyak tiga`).items[0].quantity).toBe(3)
  expect(parseVoiceCommand('transaksi lampu Philips dua dan kabel Eterna tiga').items).toHaveLength(2)
  expect(parseVoiceCommand('transaksi lampu Philips 2, speaker ACR 1, kabel Eterna 3').items).toEqual([
    { query: 'lampu philips', quantity: 2 },
    { query: 'speaker acr', quantity: 1 },
    { query: 'kabel eterna', quantity: 3 },
  ])
  expect(parseVoiceCommand('transaksi charger Anker 2 speaker JBL 1 kabel Vention 3').items).toHaveLength(3)
  expect(parseVoiceCommand('restok kabel Eterna seratus dua puluh lima').items[0].quantity).toBe(125)
  const create = parseVoiceCommand('tambah barang baru lampu led Panasonic stok 20 harga 35000 barcode 7770001')
  expect(create.intent).toBe('create_product')
  expect(create.intent === 'create_product' ? create.draft.name : '').toBe('Lampu LED Panasonic')
  const partialCreate = parseVoiceCommand('tambah barang baru qty dua belas')
  expect(partialCreate.intent).toBe('create_product')
  expect(partialCreate.intent === 'create_product' ? partialCreate.draft.name : 'filled').toBe('')
  expect(partialCreate.intent === 'create_product' ? partialCreate.draft.stock : 0).toBe(12)
  expect(parseVoiceDraftEdit('bukan provi maksud saya panasonic')).toEqual({ action: 'product', from: 'provi', query: 'panasonic' })
  expect(parseVoiceDraftEdit('qty nya tiga')).toEqual({ action: 'quantity', quantity: 3, query: undefined })
  expect(parseVoiceDraftEdit('batal')).toEqual({ action: 'cancel' })
  for (const text of ['jual lampu','jual lampu nol','jual lampu -2','jual lampu 1.5','lampu dua','jual lampu dua dan restok kabel tiga']) expect(() => parseVoiceCommand(text)).toThrow()
  const product = { id:'1', namaBarang:'Philips LED Bulb 12W', brand:'Philips', stok:15, harga:1, barcode:'1', storeId:'1', createdAt:'' }
  expect(matchVoiceProducts('lampu Philips 12 watt',[product])[0].score).toBe(1)
  expect(matchVoiceProducts('lampu Philips 9 watt',[product])).toHaveLength(0)
})

for (const width of [320,360,375,390,412,430,768,1440]) {
  test(`all routes load without overflow or console errors at ${width}px`, async ({ page }) => {
    await page.setViewportSize({width,height:900})
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))
    page.on('console', e => { if (e.type() === 'error') errors.push(e.text()) })
    for (const route of routes) {
      await page.goto(route)
      await expect(page.locator('main')).not.toBeEmpty()
      await expect(page.getByRole('button',{name:'Buka Voice AI'})).toBeVisible()
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    }
    expect(errors).toEqual([])
  })
}

test('mobile bottom navigation and desktop navigation', async ({ page }) => {
  await page.setViewportSize({width:390,height:844}); await page.goto('/')
  for (const [name,url] of [['Barang','databarang'],['Laporan','laporan'],['Setelan','pengaturan'],['Home','/']]) {
    await page.getByRole('navigation',{name:'Navigasi mobile'}).getByRole('link',{name,exact:true}).click()
    await expect(page).toHaveURL(new RegExp(url))
  }
  await page.setViewportSize({width:1440,height:900})
  await page.locator('aside').getByRole('link',{name:'History Barang',exact:true}).click()
  await expect(page.getByRole('heading',{name:'History Barang'})).toBeVisible()
})

test('add, edit, barcode export, search, delete product', async ({ page }) => {
  await page.setViewportSize({width:390,height:844}); await page.goto('/databarang.html')
  await page.getByRole('button',{name:'Tambah Barang',exact:true}).click()
  await page.getByLabel('Nama Barang',{exact:true}).fill('Lampu Philips')
  await page.getByLabel('Brand',{exact:true}).fill('Philips')
  await page.getByLabel('Harga',{exact:true}).fill('15000')
  await page.getByLabel('Stok',{exact:true}).fill('15')
  await page.getByLabel('Barcode',{exact:true}).fill('123456789')
  await page.getByRole('button',{name:'Simpan',exact:true}).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByPlaceholder('Cari nama barang, brand, barcode').fill('Lampu Philips')
  await page.getByRole('button',{name:'Edit Lampu Philips',exact:true}).click()
  await page.getByLabel('Stok',{exact:true}).fill('20')
  await page.getByRole('button',{name:'Simpan',exact:true}).click()
  await expect.poll(async () => (await data(page)).products.find((p: {barcode:string})=>p.barcode==='123456789').stok).toBe(20)
  await page.getByRole('checkbox',{name:'Pilih Lampu Philips'}).check()
  await page.getByRole('button',{name:'Generate Barcode'}).click()
  const download = page.waitForEvent('download'); await page.getByRole('button',{name:'Save PDF',exact:true}).click()
  expect((await download).suggestedFilename()).toContain('.pdf')
  await page.getByRole('button',{name:'Tutup',exact:true}).click()
  page.on('dialog',d=>d.accept())
  await page.getByRole('button',{name:'Hapus Lampu Philips'}).click()
  await expect(page.getByText('Produk tidak ditemukan')).toBeVisible()
})

for (const category of ['masuk','keluar']) {
  test(`manual ${category} updates stock and history`, async ({page}) => {
    await page.goto('/history.html')
    const before = await data(page)
    await page.getByRole('button',{name:category==='masuk'?'Barang Masuk':'Barang Keluar',exact:true}).click()
    await page.getByLabel('Barcode',{exact:true}).fill('8991001000011')
    await page.getByLabel('Jumlah',{exact:true}).fill('2')
    await page.getByRole('button',{name:'Simpan',exact:true}).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    const after=await data(page)
    expect(after.products[0].stok).toBe(before.products[0].stok+(category==='masuk'?2:-2))
    expect(after.history.length).toBe(before.history.length+1)
  })
}

for (const [command,delta] of [['transaksi charger Anker dua',-2],['jual charger Anker tiga',-3],['barang masuk charger Anker 10',10],['restok charger Anker lima',5]] as const) {
  test(`voice confirmation: ${command}`,async ({page})=>{
    await page.setViewportSize({width:390,height:844}); await voice(page,command)
    const before=await data(page)
    await expect(page.getByRole('button',{name:'Konfirmasi',exact:true})).toBeEnabled()
    expect((await data(page)).products[0].stok).toBe(before.products[0].stok)
    await page.getByRole('button',{name:'Konfirmasi',exact:true}).evaluate((button:HTMLButtonElement)=>{button.click();button.click()})
    await expect(page.getByText('Stok dan history berhasil diperbarui.')).toBeVisible()
    const after=await data(page)
    expect(after.products[0].stok).toBe(before.products[0].stok+delta)
    expect(after.history.length).toBe(before.history.length+1)
    await page.getByRole('button',{name:'Selesai',exact:true}).click()
    expect(await page.evaluate(()=>(window as unknown as {aborted:number}).aborted)).toBeGreaterThan(0)
  })
}

test('ambiguous product requires explicit selection',async ({page})=>{
  await mockSpeech(page,'transaksi charger dua'); await page.goto('/')
  await page.evaluate(()=>{const d=JSON.parse(localStorage.getItem('ab-elektronik-v2-data')!);d.products.push({...d.products[0],id:'ambiguous',brand:'Philips',barcode:'ambiguous'});localStorage.setItem('ab-elektronik-v2-data',JSON.stringify(d))})
  await page.reload(); await page.getByRole('button',{name:'Buka Voice AI'}).click()
  await expect(page.getByText(/Terdapat beberapa barang/)).toBeVisible()
  await expect(page.getByRole('button',{name:'Konfirmasi',exact:true})).toBeDisabled()
  await page.getByLabel('Produk untuk charger').selectOption('prd-001')
  await expect(page.getByRole('button',{name:'Konfirmasi',exact:true})).toBeEnabled()
})

test('voice correction changes pending product and quantity before confirmation', async ({page}) => {
  await voice(page, 'jual charger Anker dua')
  const before = await data(page)
  await expect(page.getByRole('button', { name: 'Konfirmasi', exact: true })).toBeEnabled()
  await page.getByLabel('Perintah Anda').fill('bukan anker maksud saya jbl')
  await page.getByRole('button', { name: 'Pahami perintah' }).click()
  await expect(page.getByRole('region', { name: 'Konfirmasi transaksi suara' }).getByText('Speaker Bluetooth Mini', { exact: true })).toBeVisible()
  await page.getByLabel('Perintah Anda').fill('qty tiga')
  await page.getByRole('button', { name: 'Pahami perintah' }).click()
  await expect(page.getByText('Qty: 3')).toBeVisible()
  await page.getByRole('button', { name: 'Konfirmasi', exact: true }).click()
  await expect(page.getByText('Stok dan history berhasil diperbarui.')).toBeVisible()
  const after = await data(page)
  expect(after.products.find((p:{id:string}) => p.id === 'prd-001').stok).toBe(before.products.find((p:{id:string}) => p.id === 'prd-001').stok)
  expect(after.products.find((p:{id:string}) => p.id === 'prd-003').stok).toBe(before.products.find((p:{id:string}) => p.id === 'prd-003').stok - 3)
})

test('spoken cancel clears pending voice transaction without writing', async ({page}) => {
  await voice(page, 'jual charger Anker dua')
  const before = await data(page)
  await expect(page.getByRole('button', { name: 'Konfirmasi', exact: true })).toBeEnabled()
  await page.getByLabel('Perintah Anda').fill('batal')
  await page.getByRole('button', { name: 'Pahami perintah' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(await data(page)).toEqual(before)
})

test('voice create product opens a prefilled confirmation form before save', async ({page}) => {
  await voice(page, 'tambah barang baru lampu led Panasonic stok 20 harga 35000 barcode 7770001')
  await expect(page.getByRole('heading', { name: 'Tambah Barang Baru' })).toBeVisible()
  await expect(page.getByLabel('Nama Barang Baru')).toHaveValue('Lampu LED Panasonic')
  await expect(page.getByLabel('Merek / Brand (opsional)')).toHaveValue('Panasonic')
  await expect(page.getByLabel('Stok Awal')).toHaveValue('20')
  await expect(page.getByLabel('Harga Jual (opsional)')).toHaveValue('35000')
  await page.getByRole('button', { name: 'Simpan Barang Baru' }).click()
  await expect(page.getByText('Barang baru berhasil ditambahkan.')).toBeVisible()
  const after = await data(page)
  const created = after.products.find((p:{barcode:string}) => p.barcode === '7770001')
  expect(created.namaBarang).toBe('Lampu LED Panasonic')
  expect(created.brand).toBe('Panasonic')
  expect(created.stok).toBe(20)
  expect(created.harga).toBe(35000)
})

test('voice create product accepts qty first and barcode from scanner/manual input', async ({page}) => {
  await voice(page, 'tambah barang baru qty 20')
  await expect(page.getByRole('heading', { name: 'Tambah Barang Baru' })).toBeVisible()
  await expect(page.getByLabel('Nama Barang Baru')).toHaveValue('')
  await expect(page.getByLabel('Stok Awal')).toHaveValue('20')
  await expect(page.getByRole('button', { name: 'Simpan Barang Baru' })).toBeDisabled()
  await page.getByLabel('Nama Barang Baru').fill('Lampu Meja')
  await page.getByRole('button', { name: 'Scan Barcode' }).click()
  await page.getByLabel('Input barcode manual').fill('7770002')
  await page.getByRole('button', { name: 'Cari barcode' }).click()
  await page.getByRole('button', { name: 'Tambah produk baru' }).click()
  await expect(page.getByLabel('Barcode Baru')).toHaveValue('7770002')
  await expect(page.getByRole('button', { name: 'Simpan Barang Baru' })).toBeEnabled()
  await page.getByRole('button', { name: 'Simpan Barang Baru' }).click()
  await expect(page.getByText('Barang baru berhasil ditambahkan.')).toBeVisible()
  const after = await data(page)
  const created = after.products.find((p:{barcode:string}) => p.barcode === '7770002')
  expect(created.namaBarang).toBe('Lampu Meja')
  expect(created.brand).toBe('Tanpa Merek')
  expect(created.harga).toBe(0)
  expect(created.stok).toBe(20)
})

test('microphone denied preserves dialog and supports text fallback',async ({page})=>{
  await mockSpeech(page,'','not-allowed'); await page.goto('/'); await page.getByRole('button',{name:'Buka Voice AI'}).click()
  await expect(page.getByRole('alert')).toContainText('Izin microphone ditolak')
  await page.getByLabel('Perintah Anda').fill('restok charger Anker lima')
  await page.getByRole('button',{name:'Pahami perintah'}).click()
  await expect(page.getByRole('button',{name:'Konfirmasi',exact:true})).toBeEnabled()
})

test('negative stock, missing product and unknown intent never write',async ({page})=>{
  await voice(page,'jual charger Anker 9999')
  const before=await data(page)
  await expect(page.getByRole('alert')).toContainText('Stok tidak cukup')
  await expect(page.getByRole('button',{name:'Konfirmasi',exact:true})).toBeDisabled()
  for (const command of ['jual barangtidakada dua','perintah yang tidak diketahui']) {
    await page.getByLabel('Perintah Anda').fill(command); await page.getByRole('button',{name:'Pahami perintah'}).click()
  }
  expect(await data(page)).toEqual(before)
})

test('scanner fallback, missing barcode, cart, receipt PDF and print',async ({page})=>{
  await page.setViewportSize({width:320,height:800});await page.goto('/')
  await page.getByRole('button',{name:'Buka scanner',exact:true}).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByLabel('Input barcode manual').fill('missing')
  await page.getByRole('button',{name:'Cari barcode'}).click()
  await expect(page.getByText('Barcode tidak ditemukan')).toBeVisible()
  await page.getByLabel('Input barcode manual').fill('8991001000011')
  await page.getByRole('button',{name:'Cari barcode'}).click()
  await expect(page.getByRole('heading',{name:'Keranjang Transaksi'})).toBeVisible()
  await page.getByRole('button',{name:'Proses',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Transaksi selesai'})).toBeVisible()
  await page.getByRole('button',{name:'Lihat Resi'}).click()
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Save PDF',exact:true}).click();expect((await download).suggestedFilename()).toContain('resi')
  const popup=page.waitForEvent('popup');await page.getByRole('button',{name:'Print Resi'}).click();expect(await popup).toBeTruthy()
})

test('report PDF exports and theme',async ({page})=>{
  await page.goto('/')
  await page.getByRole('button',{name:'Ganti tema'}).click();await expect(page.locator('html')).toHaveClass('light')
  for(const route of ['/laporanbarangmasuk.html','/laporanbarangkeluar.html','/laporanstokbarang.html','/pendapatanharian.html','/pendapatanmingguan.html','/pendapatanbulanan.html','/laporanpendapatan.html']) {
    await page.goto(route);const download=page.waitForEvent('download');await page.getByRole('button',{name:'Simpan PDF'}).click();expect((await download).suggestedFilename()).toContain('.pdf')
  }
})

test('store create, edit, switch and cascade delete',async ({page})=>{
  await page.goto('/profilsetting.html');await page.getByRole('button',{name:'Tambah Toko',exact:true}).click()
  await page.getByLabel('Nama Toko',{exact:true}).last().fill('Toko Test')
  await page.getByLabel('Alamat Toko',{exact:true}).last().fill('Jakarta')
  await page.getByLabel('Link Lokasi URL').fill('https://maps.google.com/?q=Jakarta')
  await page.getByRole('button',{name:'Simpan',exact:true}).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button',{name:'Edit toko Toko Test'}).click()
  await page.getByLabel('Nama Toko',{exact:true}).last().fill('Toko Update')
  await page.getByRole('button',{name:'Update',exact:true}).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  page.on('dialog',d=>d.accept())
  await page.getByRole('button',{name:'Hapus toko Toko Update'}).click()
  await expect(page.getByRole('button',{name:'Edit toko Toko Update'})).toHaveCount(0)
  expect((await data(page)).stores).toHaveLength(2)
})

test('multiple voice items commit once and cancellation never writes', async ({page}) => {
  await voice(page,'transaksi charger Anker dua dan speaker JBL tiga')
  const before=await data(page)
  await expect(page.getByRole('button',{name:'Konfirmasi',exact:true})).toBeEnabled()
  await page.getByRole('button',{name:'Batalkan',exact:true}).click()
  expect(await data(page)).toEqual(before)
  await page.getByRole('button',{name:'Buka Voice AI'}).click()
  await page.getByRole('button',{name:'Konfirmasi',exact:true}).click()
  await expect(page.getByText('Stok dan history berhasil diperbarui.')).toBeVisible()
  const after=await data(page)
  expect(after.products.find((p:{id:string})=>p.id==='prd-001').stok).toBe(40)
  expect(after.products.find((p:{id:string})=>p.id==='prd-003').stok).toBe(5)
  expect(after.history.length).toBe(before.history.length+2)
})

test('voice transaction detects comma and sequential items over two products', async ({page}) => {
  await voice(page,'transaksi charger Anker 2, speaker JBL 1, kabel Vention 3')
  const before=await data(page)
  const region = page.getByRole('region', { name: 'Konfirmasi transaksi suara' })
  await expect(region.getByText('Charger USB-C 33W', { exact: true })).toBeVisible()
  await expect(region.getByText('Speaker Bluetooth Mini', { exact: true })).toBeVisible()
  await expect(region.getByText('Kabel HDMI 2 Meter', { exact: true })).toBeVisible()
  await expect(region.getByText('Qty: 2')).toBeVisible()
  await expect(region.getByText('Qty: 1')).toBeVisible()
  await expect(region.getByText('Qty: 3')).toBeVisible()
  await page.getByRole('button',{name:'Konfirmasi',exact:true}).click()
  await expect(page.getByText('Stok dan history berhasil diperbarui.')).toBeVisible()
  const after=await data(page)
  expect(after.products.find((p:{id:string})=>p.id==='prd-001').stok).toBe(before.products.find((p:{id:string})=>p.id==='prd-001').stok-2)
  expect(after.products.find((p:{id:string})=>p.id==='prd-002').stok).toBe(before.products.find((p:{id:string})=>p.id==='prd-002').stok-3)
  expect(after.products.find((p:{id:string})=>p.id==='prd-003').stok).toBe(before.products.find((p:{id:string})=>p.id==='prd-003').stok-1)
  expect(after.history.length).toBe(before.history.length+3)
})

for(const [error,message] of [['audio-capture','Microphone tidak tersedia'],['no-speech','Suara belum terdengar'],['network','internet normal']]) {
  test(`voice error ${error} keeps transcript UI available`,async ({page})=>{
    await mockSpeech(page,'',error);await page.goto('/');await page.getByRole('button',{name:'Buka Voice AI'}).click()
    await expect(page.getByRole('alert')).toContainText(message)
    await expect(page.getByLabel('Perintah Anda')).toBeEnabled()
    await expect(page.getByRole('button',{name:'Coba Lagi'})).toBeEnabled()
  })
}

test('voice network error can continue through text fallback example', async ({page}) => {
  await mockSpeech(page, '', 'network')
  await page.goto('/')
  await page.getByRole('button', { name: 'Buka Voice AI' }).click()
  await expect(page.getByRole('alert')).toContainText('internet normal')
  await expect(page.getByRole('button', { name: 'Pahami perintah' })).toBeDisabled()
  await page.getByRole('button', { name: 'Pakai Contoh' }).click()
  await expect(page.getByLabel('Perintah Anda')).not.toHaveValue('')
  await expect(page.getByRole('button', { name: 'Pahami perintah' })).toBeEnabled()
  await page.getByRole('button', { name: 'Pahami perintah' }).click()
  await expect(page.getByRole('button', { name: 'Konfirmasi', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Konfirmasi', exact: true }).click()
  await expect(page.getByText('Stok dan history berhasil diperbarui.')).toBeVisible()
})

test('unsupported speech and empty recognition fail safely',async ({page})=>{
  await page.addInitScript(()=>{Object.defineProperty(window,'SpeechRecognition',{value:undefined,configurable:true});Object.defineProperty(window,'webkitSpeechRecognition',{value:undefined,configurable:true})})
  await page.goto('/');await page.getByRole('button',{name:'Buka Voice AI'}).click()
  await expect(page.getByRole('alert')).toContainText('SpeechRecognition tidak tersedia')
  await page.getByRole('button',{name:'Batalkan'}).click()
  await mockSpeech(page,'');await page.reload();await page.getByRole('button',{name:'Buka Voice AI'}).click()
  await expect(page.getByRole('alert')).toContainText('Suara belum jelas')
})

test('manual quantity validation and changed barcode do not reuse previous selection',async ({page})=>{
  await page.goto('/history.html');const before=await data(page)
  await page.getByRole('button',{name:'Barang Keluar',exact:true}).click()
  await page.getByLabel('Barcode',{exact:true}).fill('8991001000011')
  for(const amount of ['0','-1','1.5','9999']) {
    await page.getByLabel('Jumlah',{exact:true}).fill(amount);await page.getByRole('button',{name:'Simpan',exact:true}).click()
    await expect(page.getByRole('dialog')).toBeVisible()
  }
  await page.getByLabel('Jumlah',{exact:true}).fill('1');await page.getByLabel('Barcode',{exact:true}).fill('badbarcode')
  await page.getByRole('button',{name:'Simpan',exact:true}).click()
  expect(await data(page)).toEqual(before)
})

test('scanner repeat manual detection does not duplicate cart selection',async ({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message))
  await page.setViewportSize({width:360,height:800});await page.goto('/')
  await page.getByRole('button',{name:'Buka scanner',exact:true}).click()
  await page.getByLabel('Input barcode manual').fill('8991001000011')
  await page.getByRole('button',{name:'Cari barcode'}).evaluate((button:HTMLButtonElement)=>{button.click();button.click()})
  await expect(page.getByRole('heading',{name:'Keranjang Transaksi'})).toBeVisible()
  await page.getByRole('button',{name:'Proses',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Transaksi selesai'})).toBeVisible()
  expect((await data(page)).products[0].stok).toBe(41)
  expect(errors).toEqual([])
})

test('mobile light visual evidence and reduced height dialog',async ({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/laporan.html')
  await expect(page.locator('html')).toHaveClass('light')
  await expect.poll(()=>page.locator('[data-glass-panel]').first().evaluate(el=>getComputedStyle(el).opacity)).toBe('1')
  await page.screenshot({path:'artifacts/mobile-reports-light.png'})
  await mockSpeech(page,'transaksi charger Anker dua');await page.goto('/')
  await expect(page.getByRole('heading',{name:'Pendapatan 7 Hari'})).toBeVisible()
  await expect.poll(()=>page.locator('[data-glass-panel]').first().evaluate(el=>getComputedStyle(el).opacity)).toBe('1')
  await page.screenshot({path:'artifacts/mobile-dashboard-light.png'})
  await page.getByRole('button',{name:'Buka Voice AI'}).click()
  await expect(page.getByRole('button',{name:'Konfirmasi',exact:true})).toBeEnabled()
  await expect.poll(()=>page.getByRole('dialog').evaluate(el=>{const r=el.getBoundingClientRect();return r.x>=0 && r.y>=0 && r.right<=innerWidth && r.bottom<=innerHeight+1})).toBe(true)
  await page.screenshot({path:'artifacts/mobile-voice-confirmation.png'})
  await page.setViewportSize({width:320,height:460})
  await page.getByRole('button',{name:'Konfirmasi',exact:true}).scrollIntoViewIfNeeded()
  await expect(page.getByRole('button',{name:'Konfirmasi',exact:true})).toBeInViewport()
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
})
