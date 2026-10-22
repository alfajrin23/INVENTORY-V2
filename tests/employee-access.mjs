import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const owner = '00000000-0000-4000-8000-000000000001'
const manager = '00000000-0000-4000-8000-000000000002'
const cashier = '00000000-0000-4000-8000-000000000003'
const otherOwner = '00000000-0000-4000-8000-000000000004'
const store = '00000000-0000-4000-8000-000000000010'
const otherStore = '00000000-0000-4000-8000-000000000011'
const product = '00000000-0000-4000-8000-000000000020'

try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key, email text unique, raw_user_meta_data jsonb not null default '{}'::jsonb);
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth, public to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;
    insert into auth.users(id,email,raw_user_meta_data) values
      ('${owner}','owner@example.test','{"full_name":"Owner"}'),
      ('${manager}','manager@example.test','{"full_name":"Manager"}'),
      ('${cashier}','cashier@example.test','{"full_name":"Cashier"}'),
      ('${otherOwner}','other@example.test','{"full_name":"Other Owner"}');
  `)

  const migrations = [
    '001_inventory_schema.sql',
    '002_inventory_transaction_rpc.sql',
    '003_transaction_revision_audit.sql',
    '004_performance_tuning.sql',
    '005_user_profiles.sql',
    '20260914024812_fix_transaction_delete_stock_rollback.sql',
  ]
  for (const file of migrations) {
    await db.exec(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'))
  }
  await db.exec(`create table public.app_branding(id text primary key, profile_photo_url text); insert into public.app_branding(id) values('default');`)
  for (const file of ['20261021031316_qris_payment_integration.sql', '20261021035956_qris_local_dynamic_manual_confirmation.sql']) {
    await db.exec(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'))
  }
  await db.exec(`
    insert into public.stores(id,owner_id,name) values
      ('${store}','${owner}','Owner Store'),('${otherStore}','${otherOwner}','Other Store');
    insert into public.products(id,store_id,nama_barang,brand,harga,stok,barcode)
      values('${product}','${store}','Lampu','Philips',15000,5,'123');
  `)
  await db.exec(await readFile(new URL('../supabase/migrations/20261022065920_employee_access_and_qris_notifications.sql', import.meta.url), 'utf8'))

  await db.exec(`
    set role service_role;
    insert into public.store_memberships(store_id,user_id,email,role,invited_by) values
      ('${store}','${manager}','manager@example.test','manager','${owner}'),
      ('${store}','${cashier}','cashier@example.test','cashier','${owner}'),
      ('${otherStore}','${owner}','owner@example.test','manager','${otherOwner}');
  `)

  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${owner}';`)
  assert.equal((await db.query(`select public.current_store_role($1) as role`, [store])).rows[0].role, 'owner')
  assert.equal((await db.query(`select public.current_user_can_create_store() as allowed`)).rows[0].allowed, true)
  await db.exec(`insert into public.stores(owner_id,name) values('${owner}','Owner New Branch')`)

  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${manager}';`)
  assert.equal((await db.query(`select public.current_store_role($1) as role`, [store])).rows[0].role, 'manager')
  await db.exec(`update public.stores set name='Manager Updated Store' where id='${store}'`)
  await db.exec(`insert into public.products(store_id,nama_barang,brand,harga,stok,barcode) values('${store}','Manager Product','A',100,1,'456')`)
  const managerLog = (await db.query(`select actor_name from public.audit_logs where store_id=$1 order by created_at desc limit 1`, [store])).rows
  assert.equal(managerLog[0].actor_name, 'Manager')
  await assert.rejects(db.exec(`insert into public.stores(owner_id,name) values('${manager}','Manager Cannot Add Store')`), /row-level security|policy/)

  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${cashier}';`)
  assert.equal((await db.query(`select public.current_store_role($1) as role`, [store])).rows[0].role, 'cashier')
  await assert.rejects(db.exec(`insert into public.products(store_id,nama_barang,brand,harga,stok,barcode) values('${store}','Cashier Product','A',100,1,'789')`), /row-level security|policy/)
  await db.query(`select public.process_inventory_transaction($1,$2,'keluar',$3::jsonb)`, [
    store,
    '00000000-0000-4000-8000-000000000030',
    JSON.stringify([{ productId: product, quantity: 1 }]),
  ])
  await assert.rejects(db.query(`select public.process_inventory_transaction($1,$2,'masuk',$3::jsonb)`, [
    store,
    '00000000-0000-4000-8000-000000000031',
    JSON.stringify([{ productId: product, quantity: 1 }]),
  ]), /Kasir hanya dapat mencatat barang keluar/)

  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${owner}';`)
  const history = (await db.query(`select oleh from public.history where store_id=$1`, [store])).rows
  assert.equal(history[0].oleh, 'Cashier')
  const logs = (await db.query(`select actor_name from public.audit_logs where store_id=$1 order by created_at desc limit 1`, [store])).rows
  assert.equal(logs[0].actor_name, 'Cashier')
  console.log('PASS: employee migration, owner/manager/cashier roles, store creation restrictions, outgoing-only cashier RPC, and actor audit attribution (no QRIS payment was confirmed).')
} finally {
  await db.close()
}
