import { test, expect } from '@playwright/test'
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'

// Real Supabase JS repository + real SQL migrations; HTTP/Auth are test doubles.
test.use({ baseURL: 'http://127.0.0.1:5174' })
test('Supabase repository: login → voice RPC → lost-response retry → manual RPC → database', async ({ page }) => {
  const db = new PGlite()
  const uid='00000000-0000-4000-8000-000000000001'
  const store='00000000-0000-4000-8000-000000000010'
  const product='00000000-0000-4000-8000-000000000020'
  let user={id:uid,aud:'authenticated',role:'authenticated',email:'owner@example.test',created_at:new Date().toISOString(),app_metadata:{},user_metadata:{}}
  const token=[{alg:'HS256',typ:'JWT'},{sub:uid,role:'authenticated',exp:Math.floor(Date.now()/1000)+3600},'signature'].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.')
  const rpcIds: string[]=[]
  let loseResponse=true
  const restRequests:string[]=[]
  let accountUpdate: Record<string, unknown> | null = null
  let queryQueue: Promise<void> = Promise.resolve()
  const runQuery = <T,>(task: () => Promise<T>) => {
    const result = queryQueue.then(task)
    queryQueue = result.then(() => undefined, () => undefined)
    return result
  }
  await db.exec(`create role authenticated; create role anon; create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as $$select '${uid}'::uuid$$;
    grant usage on schema public,auth to authenticated;
    insert into auth.users values('${uid}');`)
  for(const file of ['001_inventory_schema.sql','002_inventory_transaction_rpc.sql','003_transaction_revision_audit.sql','004_performance_tuning.sql','005_user_profiles.sql']) await db.exec(await readFile(`supabase/migrations/${file}`,'utf8'))
  await db.exec(`set role authenticated;
    insert into stores(id,name) values('${store}','Toko SQL');
    insert into products(id,store_id,nama_barang,brand,harga,stok,barcode) values('${product}','${store}','Lampu Philips','Philips',15000,15,'12345');`)
  await page.route('http://127.0.0.1:54321/**',async route=>{
    const url=new URL(route.request().url()); const method=route.request().method()
    const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,PUT,PATCH,DELETE,OPTIONS','content-type':'application/json'}
    if(method==='OPTIONS') {await route.fulfill({status:200,headers,body:''});return}
    if(url.pathname==='/auth/v1/token') {await route.fulfill({headers,json:{access_token:token,refresh_token:'test-refresh',expires_in:3600,token_type:'bearer',user}});return}
    if(url.pathname==='/auth/v1/user') {
      if(method === 'PUT') {
        accountUpdate = route.request().postDataJSON()
        user = { ...user, email: String(accountUpdate?.email ?? user.email) }
      }
      await route.fulfill({headers,json:user});return
    }
    restRequests.push(`${method} ${url.pathname}`)
    try {
      if(url.pathname==='/rest/v1/rpc/process_inventory_transaction') {
        const p=route.request().postDataJSON();rpcIds.push(p.p_request_id)
        const {rows}=await runQuery(()=>db.query<{result: unknown}>('select process_inventory_transaction($1,$2,$3,$4::jsonb,$5,$6,$7) as result',[p.p_store_id,p.p_request_id,p.p_category,JSON.stringify(p.p_items),p.p_note,p.p_operator,p.p_date]))
        if(loseResponse) {loseResponse=false;await route.fulfill({status:504,headers,json:{message:'network timeout',code:'504'}});return}
        await route.fulfill({headers,json:rows[0].result});return
      }
      if(url.pathname==='/rest/v1/rpc/revise_inventory_transaction') {
        const p=route.request().postDataJSON()
        const {rows}=await runQuery(()=>db.query<{result: unknown}>('select revise_inventory_transaction($1,$2,$3,$4::jsonb,$5) as result',[p.p_store_id,p.p_history_id,p.p_expected_updated_at,JSON.stringify(p.p_change),p.p_delete]))
        await route.fulfill({headers,json:rows[0].result});return
      }
      const table=url.pathname.split('/').pop()
      if(method==='GET' && ['stores','products','history','audit_logs'].includes(table!)) {
        const {rows}=await runQuery(()=>db.query(`select * from public.${table} ${table==='audit_logs' ? 'order by created_at desc limit 200' : 'order by id'}`))
        await route.fulfill({headers,json:rows});return
      }
      await route.fulfill({status:400,headers,json:{message:'Unexpected request'}})
    } catch(e) {await route.fulfill({status:400,headers,json:{message:e instanceof Error?e.message:String(e),code:'P0001'}})}
  })
  try {
    await page.addInitScript(()=>{Object.defineProperty(window,'SpeechRecognition',{value:undefined});Object.defineProperty(window,'webkitSpeechRecognition',{value:undefined})})
    await page.goto('/');await expect(page.getByRole('heading',{name:'Masuk ke Inventory'})).toBeVisible()
    await page.getByLabel('Email',{exact:true}).fill('owner@example.test');await page.getByLabel('Password',{exact:true}).fill('test-password')
    await page.getByRole('button',{name:'Masuk',exact:true}).click()
    await expect(page.getByText('Toko SQL').first()).toBeVisible()
    await page.getByRole('button',{name:'Buka Voice AI'}).click()
    await page.getByLabel('Perintah Anda').fill('jual lampu Philips dua');await page.getByRole('button',{name:'Pahami perintah'}).click()
    expect((await db.query<{stok:number}>('select stok from products')).rows[0].stok).toBe(15)
    await page.getByRole('button',{name:'Konfirmasi',exact:true}).click()
    await expect(page.getByRole('alert')).toContainText('Koneksi terputus')
    await page.getByRole('button',{name:'Konfirmasi',exact:true}).click()
    await expect(page.getByText('Stok dan history berhasil diperbarui.')).toBeVisible()
    expect(rpcIds).toHaveLength(2);expect(rpcIds[0]).toBe(rpcIds[1])
    expect((await db.query<{stok:number}>('select stok from products')).rows[0].stok).toBe(13)
    expect((await db.query('select * from history')).rows).toHaveLength(1)
    await page.getByRole('button',{name:'Selesai',exact:true}).click()
    await page.goto('/history.html');await page.getByRole('button',{name:'Barang Masuk',exact:true}).click()
    await page.getByLabel('Barcode',{exact:true}).fill('12345');await page.getByLabel('Jumlah',{exact:true}).fill('5')
    await page.getByRole('button',{name:'Simpan',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0)
    expect((await db.query<{stok:number}>('select stok from products')).rows[0].stok).toBe(18)
    expect((await db.query('select * from history')).rows).toHaveLength(2)
    expect(restRequests.filter(r=>r.startsWith('POST'))).toEqual(Array(3).fill('POST /rest/v1/rpc/process_inventory_transaction'))
    await page.goto('/history.html')
    await page.getByRole('row').filter({hasText:'Barang Masuk'}).getByRole('button',{name:'Edit transaksi Lampu Philips'}).click()
    await page.getByLabel('Jumlah',{exact:true}).last().fill('4')
    await page.getByRole('button',{name:'Simpan perubahan'}).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect((await db.query<{stok:number}>('select stok from products')).rows[0].stok).toBe(17)
    await page.getByRole('row').filter({hasText:'Barang Masuk'}).getByRole('button',{name:'Hapus transaksi Lampu Philips'}).click()
    await page.getByRole('dialog').getByRole('button',{name:'Hapus transaksi'}).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect((await db.query<{stok:number}>('select stok from products')).rows[0].stok).toBe(13)
    expect((await db.query('select * from history')).rows).toHaveLength(1)
    await page.goto('/pengaturan.html')
    await page.getByRole('button',{name:'Pengaturan Akun'}).click()
    await page.getByLabel('Email Login').fill('admin-baru@example.test')
    await page.getByLabel('Password Baru Akun').fill('password-baru-123')
    await page.getByLabel('Konfirmasi Password Akun').fill('password-baru-123')
    await page.getByRole('button',{name:'Simpan Akun'}).click()
    await expect(page.getByRole('status')).toContainText('Akun diperbarui')
    expect(accountUpdate).toMatchObject({ email: 'admin-baru@example.test', password: 'password-baru-123' })
    await page.getByRole('button',{name:'Batal'}).click()
    await page.getByRole('link',{name:'Logs Input'}).click()
    await expect(page.getByRole('heading',{name:'Logs Input'})).toBeVisible()
    await expect(page.getByRole('row').filter({hasText:'Hapus transaksi: Lampu Philips'})).toBeVisible()
    await expect(page.getByRole('row').filter({hasText:'Edit transaksi: Lampu Philips'})).toBeVisible()
    // Remote stock changed after confirmation was prepared: server validation wins.
    await page.getByRole('button',{name:'Buka Voice AI'}).click();await page.getByLabel('Perintah Anda').fill('jual lampu Philips sepuluh');await page.getByRole('button',{name:'Pahami perintah'}).click()
    await db.exec('reset role; update products set stok=1; set role authenticated;')
    await page.getByRole('button',{name:'Konfirmasi',exact:true}).click();await expect(page.getByRole('alert')).toContainText('tidak cukup')
    expect((await db.query('select * from history')).rows).toHaveLength(1)
  } finally {await db.close()}
})

test('account settings shows Supabase email update detail', async ({ page }) => {
  const uid = '00000000-0000-4000-8000-000000000001'
  const store = '00000000-0000-4000-8000-000000000010'
  const token = [{ alg: 'HS256', typ: 'JWT' }, { sub: uid, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }, 'signature']
    .map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.')
  const user = { id: uid, aud: 'authenticated', role: 'authenticated', email: 'owner@example.test', created_at: new Date().toISOString(), app_metadata: {}, user_metadata: {} }
  const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS', 'content-type': 'application/json' }

  await page.route('http://127.0.0.1:54321/**', async route => {
    const url = new URL(route.request().url())
    const method = route.request().method()
    if (method === 'OPTIONS') { await route.fulfill({ status: 200, headers, body: '' }); return }
    if (url.pathname === '/auth/v1/token') { await route.fulfill({ headers, json: { access_token: token, refresh_token: 'test-refresh', expires_in: 3600, token_type: 'bearer', user } }); return }
    if (url.pathname === '/auth/v1/user') {
      if (method === 'PUT') {
        await route.fulfill({ status: 400, headers, json: { message: 'Email sudah digunakan akun lain.' } })
        return
      }
      await route.fulfill({ headers, json: user })
      return
    }
    if (url.pathname === '/rest/v1/stores') { await route.fulfill({ headers, json: [{ id: store, owner_id: uid, name: 'Toko Akun', address: '', address_link: '', created_at: new Date().toISOString() }] }); return }
    if (url.pathname === '/rest/v1/products' || url.pathname === '/rest/v1/history' || url.pathname === '/rest/v1/audit_logs') {
      await route.fulfill({ headers, json: [] })
      return
    }
    await route.fulfill({ status: 400, headers, json: { message: 'Unexpected request' } })
  })

  await page.goto('/')
  await page.getByLabel('Email', { exact: true }).fill('owner@example.test')
  await page.getByLabel('Password', { exact: true }).fill('test-password')
  await page.getByRole('button', { name: 'Masuk', exact: true }).click()
  await expect(page.getByText('Toko Akun').first()).toBeVisible()
  await page.goto('/pengaturan.html')
  await page.getByRole('button', { name: 'Pengaturan Akun' }).click()
  await expect(page.getByLabel('Email Login')).toHaveValue('owner@example.test')
  await page.getByLabel('Email Login').fill('admin@dipakai.test')
  await page.getByRole('button', { name: 'Simpan Akun' }).click()
  await expect(page.getByRole('alert')).toContainText('Email sudah digunakan akun lain.')
})

test('product data appears while transaction history is still loading', async ({ page }) => {
  const uid = '00000000-0000-4000-8000-000000000001'
  const store = '00000000-0000-4000-8000-000000000010'
  const token = [{ alg: 'HS256', typ: 'JWT' }, { sub: uid, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }, 'signature']
    .map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.')
  const user = { id: uid, aud: 'authenticated', role: 'authenticated', email: 'owner@example.test', created_at: new Date().toISOString(), app_metadata: {}, user_metadata: {} }
  const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'content-type': 'application/json' }
  let releaseHistory = () => undefined
  let historyRequested = false
  const historyGate = new Promise<void>(resolve => { releaseHistory = resolve })
  await page.route('http://127.0.0.1:54321/**', async route => {
    const pathname = new URL(route.request().url()).pathname
    if (route.request().method() === 'OPTIONS') { await route.fulfill({ status: 200, headers, body: '' }); return }
    if (pathname === '/auth/v1/token') { await route.fulfill({ headers, json: { access_token: token, refresh_token: 'test-refresh', expires_in: 3600, token_type: 'bearer', user } }); return }
    if (pathname === '/auth/v1/user') { await route.fulfill({ headers, json: user }); return }
    if (pathname === '/rest/v1/stores') { await route.fulfill({ headers, json: [{ id: store, owner_id: uid, name: 'Toko Cepat', address: '', address_link: '', created_at: new Date().toISOString() }] }); return }
    if (pathname === '/rest/v1/products') { await route.fulfill({ headers, json: [{ id: '00000000-0000-4000-8000-000000000020', store_id: store, nama_barang: 'Lampu Cepat', brand: 'Philips', harga: 15000, stok: 5, barcode: '987', created_at: new Date().toISOString() }] }); return }
    if (pathname === '/rest/v1/history') { historyRequested = true; await historyGate; await route.fulfill({ headers, json: [] }); return }
    await route.fulfill({ status: 400, headers, json: { message: 'Unexpected request' } })
  })
  try {
    await page.addInitScript(id => localStorage.setItem('activeStoreId', id), store)
    await page.goto('/')
    await page.getByLabel('Email', { exact: true }).fill('owner@example.test')
    await page.getByLabel('Password', { exact: true }).fill('test-password')
    await page.getByRole('button', { name: 'Masuk', exact: true }).click()
    await page.getByRole('complementary').getByRole('link', { name: 'Data Barang' }).click()
    await expect(page.getByText('Lampu Cepat').first()).toBeVisible()
    expect(historyRequested).toBe(true)
    releaseHistory()
    await page.getByRole('link', { name: 'Dashboard' }).click()
    await expect(page.getByText('Pendapatan Hari Ini')).toBeVisible()
  } finally { releaseHistory() }
})
