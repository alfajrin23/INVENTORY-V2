import { PGlite } from '@electric-sql/pglite'
import { readFile, writeFile, mkdtemp, unlink, rmdir } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const db = new PGlite()
const owner = '00000000-0000-4000-8000-000000000001'
const other = '00000000-0000-4000-8000-000000000002'
const store = '00000000-0000-4000-8000-000000000010'
const p1 = '00000000-0000-4000-8000-000000000020'
const p2 = '00000000-0000-4000-8000-000000000021'
await db.exec(`create role anon; create role authenticated; create schema auth;
  create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  grant usage on schema auth,public to authenticated,anon;
  grant execute on function auth.uid() to authenticated,anon;
  insert into auth.users values('${owner}'),('${other}');`)
for (const file of ['001_inventory_schema.sql', '002_inventory_transaction_rpc.sql', '003_transaction_revision_audit.sql', '004_performance_tuning.sql']) {
  await db.exec(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'))
}
await db.exec(`set request.jwt.claim.sub='${owner}'; set role authenticated;
  insert into public.stores(id,name) values('${store}','Test');
  insert into public.products(id,store_id,nama_barang,brand,harga,stok,barcode) values
  ('${p1}','${store}','Lampu Philips','Philips',10000,10,'111'),
  ('${p2}','${store}','Kabel Eterna','Eterna',20000,2,'222');`)
const call = (items, category = 'keluar', id = crypto.randomUUID(), storeId = store) => db.query(
  'select public.process_inventory_transaction($1,$2,$3,$4::jsonb) as result', [storeId, id, category, JSON.stringify(items)])
const stock = async () => (await db.query('select stok from products order by id')).rows.map(r => r.stok)
const count = async () => (await db.query('select count(*)::int as n from history')).rows[0].n
const id = crypto.randomUUID()
await call([{ productId: p1, quantity: 2 }], 'keluar', id)
assert.deepEqual(await stock(), [8,2]); assert.equal(await count(),1)
await call([{ productId: p1, quantity: 2 }], 'keluar', id)
assert.deepEqual(await stock(), [8,2]); assert.equal(await count(),1)
await assert.rejects(call([{ productId: p1, quantity: 3 }], 'keluar', id), /sudah digunakan/)
await assert.rejects(call([{ productId: p1, quantity: 1 }, { productId: p2, quantity: 3 }]), /tidak cukup/)
assert.deepEqual(await stock(), [8,2]); assert.equal(await count(),1)
await call([{ productId: p1, quantity: 2 }, { productId: p1, quantity: 3 }], 'masuk')
assert.deepEqual(await stock(), [13,2]); assert.equal(await count(),2)
for (const quantity of [0, -1, 1.5, null, '2', 1000001]) {
  await assert.rejects(call([{ productId: p1, quantity }]))
}
await assert.rejects(call([])); await assert.rejects(call([{productId:p1,quantity:1}], 'invalid'))
await assert.rejects(call([{productId:crypto.randomUUID(),quantity:1}]), /tidak ditemukan/)
await assert.rejects(db.exec(`update products set stok=0 where id='${p1}'`), /permission denied/)
await assert.rejects(db.exec(`insert into history(store_id,barcode,nama_barang,brand,kategori,jumlah,harga) values('${store}','1','x','x','keluar',1,1)`), /permission denied/)
const update = expected => db.query('select update_inventory_product($1,$2,$3,$4::jsonb)', [p1,store,expected,JSON.stringify({nama_barang:'Lampu Philips',brand:'Philips',harga:10000,stok:15,barcode:'111'})])
await assert.rejects(update(10), /Stok berubah/)
await update(13); assert.deepEqual(await stock(),[15,2]); assert.equal(await count(),3)
await db.exec(`reset role;
  create function public.reject_test_history() returns trigger language plpgsql as $$begin raise exception 'Injected history failure'; end;$$;
  create trigger reject_test_history before insert on public.history for each row execute function public.reject_test_history();
  set role authenticated;`)
await assert.rejects(call([{productId:p1,quantity:1}]), /Injected history failure/)
assert.deepEqual(await stock(),[15,2]); assert.equal(await count(),3)
await db.exec('reset role; drop trigger reject_test_history on public.history; drop function public.reject_test_history(); set role authenticated;')
const originalSale = (await db.query("select id, updated_at from history where kategori='keluar' order by tanggal limit 1")).rows[0]
const revisedSale = { productId: p1, category: 'keluar', quantity: 4, price: 15000, date: new Date().toISOString(), note: 'Harga dikoreksi', operator: 'Admin' }
const revise = (row, change, remove = false) => db.query(
  'select revise_inventory_transaction($1,$2,$3,$4::jsonb,$5) as result',
  [store, row.id, row.updated_at, JSON.stringify(change), remove])
await revise(originalSale, revisedSale)
assert.deepEqual(await stock(), [13,2]); assert.equal(await count(),3)
await assert.rejects(revise(originalSale, revisedSale), /sudah berubah/)
const changedSale = (await db.query('select id, updated_at from history where id=$1',[originalSale.id])).rows[0]
await revise(changedSale, revisedSale, true)
assert.deepEqual(await stock(), [17,2]); assert.equal(await count(),2)
await assert.rejects(revise(changedSale, revisedSale, true), /tidak ditemukan/)
assert.ok((await db.query("select count(*)::int as n from audit_logs where entity='transaction' and action='delete'")).rows[0].n >= 1)
await assert.rejects(db.exec(`insert into audit_logs(owner_id,store_id,entity,action,record_id) values('${owner}','${store}','product','insert','${p1}')`), /permission denied/)
await call([{productId:p1,quantity:16}], 'keluar')
assert.deepEqual(await stock(), [1,2])
const incoming = (await db.query("select id, updated_at from history where kategori='masuk' and jumlah=5 limit 1")).rows[0]
await assert.rejects(revise(incoming, revisedSale, true), /Stok tidak cukup/)
assert.deepEqual(await stock(), [1,2])
await db.exec(`set request.jwt.claim.sub='${other}'`)
assert.equal((await db.query('select * from stores')).rows.length,0)
assert.equal((await db.query('select * from products')).rows.length,0)
assert.equal(await count(),0)
assert.equal((await db.query('select * from audit_logs')).rows.length,0)
await assert.rejects(call([{productId:p1,quantity:1}]), /akses ditolak/)
await assert.rejects(revise(incoming, revisedSale, true), /akses ditolak/)
await assert.rejects(db.exec(`insert into products(store_id,nama_barang,brand,harga,stok,barcode) values('${store}','bad','bad',1,1,'bad')`), /row-level security/)
await db.exec(`reset role; set role anon;`)
await assert.rejects(db.query('select * from stores'), /permission denied/)
await assert.rejects(call([{productId:p1,quantity:1}]), /permission denied/)
await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${owner}'; delete from stores where id='${store}';`)
assert.deepEqual(await stock(),[]); assert.equal(await count(),0)
const temp = await mkdtemp(join(tmpdir(), 'inventory-import-test-'))
const input = join(temp,'backup.json'); const output=join(temp,'import.sql')
try {
  await writeFile(input,JSON.stringify({stores:[{id:'old-store',name:"Toko O'Connor",createdAt:'2025-01-01'}],products:[{id:'old-product',storeId:'old-store',namaBarang:'Lampu',brand:'Philips',harga:10000,stok:4,barcode:'001',createdAt:'2025-01-01'}],history:[{id:'old-history',storeId:'old-store',namaBarang:'Lampu',brand:'Philips',harga:10000,jumlah:2,kategori:'masuk',barcode:'001',tanggal:{seconds:1735689600}}]}))
  execFileSync(process.execPath,['scripts/prepare-firebase-import.mjs',input,output,owner])
  assert.throws(()=>execFileSync(process.execPath,['scripts/prepare-firebase-import.mjs',input,output,owner],{stdio:'pipe'}))
  await db.exec('reset role;')
  await db.exec(await readFile(output,'utf8'))
  assert.equal((await db.query('select name from stores')).rows[0].name,"Toko O'Connor")
  assert.deepEqual(await stock(),[4]); assert.equal(await count(),1)
} finally { await unlink(input); await unlink(output).catch(()=>{}); await rmdir(temp) }
await db.close()
console.log('PASS: migrations, stock in/out, atomic rollback, idempotency, transaction revision/deletion and conflict, negative-stock protection, audit RLS, tenant isolation, offline import and overwrite protection.')
