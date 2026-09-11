import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { PGlite } from '@electric-sql/pglite'

const here = dirname(fileURLToPath(import.meta.url))
const migrationPath = resolve(here, '../supabase/migrations/202609110001_inventory_v2.sql')
const migration = await readFile(migrationPath, 'utf8')

assert.match(migration, /enable row level security/gi, 'migration harus mengaktifkan RLS')
assert.match(migration, /for update of p/gi, 'mutation stok harus memakai row lock')
assert.match(migration, /transaction_requests/gi, 'migration harus memiliki idempotency ledger')
assert.match(migration, /revoke all on function/gi, 'RPC security definer harus direvoke dari PUBLIC/anon')

const db = new PGlite()
await db.exec(`
  create role anon;
  create role authenticated;
  create schema auth;
  create table auth.users (id uuid primary key);
  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
`)
await db.exec(migration)

const userA = '11111111-1111-4111-8111-111111111111'
const userB = '22222222-2222-4222-8222-222222222222'
await db.exec(`insert into auth.users(id) values ('${userA}'), ('${userB}')`)

async function asUser(userId) {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId])
}

async function scalar(sql, params = []) {
  const result = await db.query(sql, params)
  const row = result.rows[0]
  return row ? Object.values(row)[0] : undefined
}

async function expectFailure(action, message) {
  let failed = false
  try {
    await action()
  } catch {
    failed = true
  }
  assert.equal(failed, true, message)
}

// Authenticated clients may read/insert/delete products, but may not bypass guarded RPC with direct UPDATE.
assert.equal(
  await scalar(`select has_table_privilege('authenticated', 'public.products', 'UPDATE')`),
  false,
  'authenticated tidak boleh direct UPDATE products',
)

await asUser(userA)
const storeResult = await db.query(`
  insert into public.stores(name, address, address_link)
  values ('Toko A', 'Jakarta', '')
  returning id
`)
const storeA = storeResult.rows[0].id
const productsResult = await db.query(`
  insert into public.products(store_id, nama_barang, brand, harga, stok, barcode)
  values
    ($1, 'Lampu Panasonic', 'Panasonic', 35000, 20, 'LP-001'),
    ($1, 'Lampu Provi', 'Provi', 25000, 1, 'LP-002')
  returning id, nama_barang
`, [storeA])
const panasonic = productsResult.rows.find((row) => row.nama_barang === 'Lampu Panasonic').id
const provi = productsResult.rows.find((row) => row.nama_barang === 'Lampu Provi').id

// Constraints: negative stock and duplicate non-empty barcode are rejected.
await expectFailure(
  () => db.query(`insert into public.products(store_id, nama_barang, brand, harga, stok) values ($1, 'Invalid', '', 1, -1)`, [storeA]),
  'stok negatif harus ditolak',
)
await expectFailure(
  () => db.query(`insert into public.products(store_id, nama_barang, brand, harga, stok, barcode) values ($1, 'Duplicate', '', 1, 1, 'LP-001')`, [storeA]),
  'barcode duplikat dalam toko yang sama harus ditolak',
)

const date = '2026-09-11T07:00:00.000Z'
const requestIn = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const itemsIn = JSON.stringify([{ product_id: panasonic, quantity: 10 }])
await db.query(
  `select public.process_inventory_transaction($1::uuid, $2::uuid, 'masuk', $3::jsonb, null, 'Tester', $4::timestamptz)`,
  [requestIn, storeA, itemsIn, date],
)
assert.equal(Number(await scalar(`select stok from public.products where id = $1`, [panasonic])), 30, 'barang masuk harus menaikkan stok')

const requestOut = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const itemsOut = JSON.stringify([{ product_id: panasonic, quantity: 3 }])
await db.query(
  `select public.process_inventory_transaction($1::uuid, $2::uuid, 'keluar', $3::jsonb, 'Penjualan', 'Tester', $4::timestamptz)`,
  [requestOut, storeA, itemsOut, date],
)
assert.equal(Number(await scalar(`select stok from public.products where id = $1`, [panasonic])), 27, 'barang keluar harus menurunkan stok')

// Idempotency: request yang sama kedua kali tidak mengubah stok/history.
const historyBeforeRetry = Number(await scalar(`select count(*) from public.history where request_id = $1`, [requestOut]))
await db.query(
  `select public.process_inventory_transaction($1::uuid, $2::uuid, 'keluar', $3::jsonb, 'Penjualan', 'Tester', $4::timestamptz)`,
  [requestOut, storeA, itemsOut, date],
)
assert.equal(Number(await scalar(`select stok from public.products where id = $1`, [panasonic])), 27, 'retry tidak boleh mengurangi stok lagi')
assert.equal(Number(await scalar(`select count(*) from public.history where request_id = $1`, [requestOut])), historyBeforeRetry, 'retry tidak boleh menambah history')

// Lost-response retry: no explicit timestamp, same logical items in a different order still resolve to one request.
const requestReordered = 'abababab-abab-4bab-8bab-abababababab'
const firstOrder = JSON.stringify([{ product_id: panasonic, quantity: 1 }, { product_id: provi, quantity: 1 }])
const reversedOrder = JSON.stringify([{ product_id: provi, quantity: 1 }, { product_id: panasonic, quantity: 1 }])
await db.query(
  `select public.process_inventory_transaction($1::uuid, $2::uuid, 'masuk', $3::jsonb, null, 'Tester', null::timestamptz)`,
  [requestReordered, storeA, firstOrder],
)
await db.query(
  `select public.process_inventory_transaction($1::uuid, $2::uuid, 'masuk', $3::jsonb, null, 'Tester', null::timestamptz)`,
  [requestReordered, storeA, reversedOrder],
)
assert.equal(Number(await scalar(`select stok from public.products where id = $1`, [panasonic])), 28, 'reordered retry tidak boleh double mutate Panasonic')
assert.equal(Number(await scalar(`select stok from public.products where id = $1`, [provi])), 2, 'reordered retry tidak boleh double mutate Provi')
assert.equal(Number(await scalar(`select count(*) from public.history where request_id = $1`, [requestReordered])), 2, 'satu history per product untuk request yang sama')

// Insufficient stock: no partial history/stock mutation.
const requestFail = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
await expectFailure(
  () => db.query(
    `select public.process_inventory_transaction($1::uuid, $2::uuid, 'keluar', $3::jsonb, null, 'Tester', $4::timestamptz)`,
    [requestFail, storeA, JSON.stringify([{ product_id: provi, quantity: 3 }]), date],
  ),
  'stok tidak cukup harus menggagalkan transaksi',
)
assert.equal(Number(await scalar(`select stok from public.products where id = $1`, [provi])), 2)
assert.equal(Number(await scalar(`select count(*) from public.history where request_id = $1`, [requestFail])), 0)
assert.equal(Number(await scalar(`select count(*) from public.transaction_requests where request_id = $1`, [requestFail])), 0, 'ledger juga rollback jika transaksi gagal')

// Multiple products commit together; if one fails, previous updates in the same RPC rollback.
const panasonicBeforeMulti = Number(await scalar(`select stok from public.products where id = $1`, [panasonic]))
const requestMulti = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
await expectFailure(
  () => db.query(
    `select public.process_inventory_transaction($1::uuid, $2::uuid, 'keluar', $3::jsonb, null, 'Tester', $4::timestamptz)`,
    [requestMulti, storeA, JSON.stringify([{ product_id: panasonic, quantity: 1 }, { product_id: provi, quantity: 3 }]), date],
  ),
  'multi-product harus atomic',
)
assert.equal(Number(await scalar(`select stok from public.products where id = $1`, [panasonic])), panasonicBeforeMulti, 'update item pertama harus rollback')
assert.equal(Number(await scalar(`select count(*) from public.history where request_id = $1`, [requestMulti])), 0)

// Store isolation is enforced inside privileged RPC, not only by frontend/RLS.
await asUser(userB)
await expectFailure(
  () => db.query(
    `select public.process_inventory_transaction($1::uuid, $2::uuid, 'masuk', $3::jsonb, null, 'Tester', $4::timestamptz)`,
    ['eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', storeA, JSON.stringify([{ product_id: panasonic, quantity: 1 }]), date],
  ),
  'user lain tidak boleh bertransaksi pada store A',
)

// Product edit uses optimistic expected-stock guard and creates correction history atomically.
await asUser(userA)
const correction = await db.query(
  `select public.update_inventory_product($1::uuid, $2::uuid, 'Lampu Panasonic', 'Panasonic', 36000, 29, 'LP-001', $3::integer) as result`,
  [panasonic, storeA, panasonicBeforeMulti],
)
assert.equal(correction.rows.length, 1)
assert.equal(Number(await scalar(`select stok from public.products where id = $1`, [panasonic])), 29)
assert.equal(Number(await scalar(`select count(*) from public.history where product_id = $1 and keterangan = 'Koreksi stok melalui edit produk'`, [panasonic])), 1)
await expectFailure(
  () => db.query(`select public.update_inventory_product($1::uuid, $2::uuid, 'Lampu Panasonic', 'Panasonic', 36000, 30, 'LP-001', 28)`, [panasonic, storeA]),
  'expected stock stale harus ditolak',
)

console.log('Database tests: PASS')
await db.close()
