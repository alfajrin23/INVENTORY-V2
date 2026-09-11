// Offline converter only. Never connects to Firebase/Supabase or alters the input file.
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'

const [inputPath, outputPath, owner] = process.argv.slice(2)
if (!inputPath || !outputPath || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(owner ?? '')) {
  throw new Error('Usage: node scripts/prepare-firebase-import.mjs backup.json import.sql OWNER_AUTH_USER_UUID')
}
if (resolve(inputPath) === resolve(outputPath)) throw new Error('Output must differ from backup')
const data = JSON.parse(await readFile(inputPath, 'utf8'))
for (const table of ['stores','products','history']) if (!Array.isArray(data[table])) throw new Error(`Missing ${table} array`)
const uuid = (table, id) => {
  if (!id) throw new Error(`Missing source ID in ${table}`)
  const hex = createHash('sha256').update(`inventory-import:${table}:${id}`).digest('hex')
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20,32)}`
}
const quote = v => v == null ? 'null' : `'${String(v).replaceAll("'", "''")}'`
const date = v => {
  if (v == null) return new Date().toISOString()
  const seconds = v?._seconds ?? v?.seconds
  const d = new Date(seconds != null ? Number(seconds)*1000 : v)
  if (!Number.isFinite(d.getTime())) throw new Error(`Invalid date: ${JSON.stringify(v)}`)
  return d.toISOString()
}
const number = (v, min, integer = true) => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || (integer && !Number.isSafeInteger(v))) throw new Error(`Invalid numeric value: ${v}`)
  return v
}
const required = v => { if (typeof v !== 'string' || !v.trim()) throw new Error('Required name/barcode missing'); return v }
const storeIds = new Set(data.stores.map(s=>s.id))
const verifyStore = id => { if (!storeIds.has(id)) throw new Error(`Orphan store reference: ${id}`); return uuid('stores',id) }
const statements = ['-- Review this file and restore-test backups before running as postgres in a staging project.', 'begin;', 'set standard_conforming_strings = on;']
const insert = (table, row) => statements.push(`insert into public.${table} (${Object.keys(row).join(',')}) values (${Object.values(row).map(quote).join(',')});`)
for (const s of data.stores) insert('stores',{id:uuid('stores',s.id),owner_id:owner,name:required(s.name ?? s.storeName),address:s.address ?? s.storeAddress ?? '',address_link:s.addressLink ?? '',photo:s.photo,created_at:date(s.createdAt),updated_at:date(s.updatedAt ?? s.createdAt)})
for (const p of data.products) insert('products',{id:uuid('products',p.id),store_id:verifyStore(p.storeId),nama_barang:required(p.namaBarang),brand:required(p.brand),harga:number(p.harga,0,false),stok:number(p.stok,0),barcode:required(p.barcode),created_at:date(p.createdAt),updated_at:date(p.updatedAt ?? p.createdAt)})
for (const h of data.history) {
  if (!['masuk','keluar'].includes(h.kategori)) throw new Error(`Invalid category: ${h.kategori}`)
  const product = data.products.find(p=>p.storeId === h.storeId && p.barcode === h.barcode)
  insert('history',{id:uuid('history',h.id),store_id:verifyStore(h.storeId),product_id:product ? uuid('products',product.id) : null,barcode:required(h.barcode),tanggal:date(h.tanggal),nama_barang:required(h.namaBarang),brand:h.brand ?? '',kategori:h.kategori,jumlah:number(h.jumlah,1),harga:number(h.harga,0,false),keterangan:h.keterangan,oleh:h.oleh,created_at:date(h.createdAt ?? h.tanggal)})
}
statements.push('commit;')
await writeFile(outputPath, statements.join('\n')+'\n', {flag:'wx'})
console.log(`SQL prepared: ${data.stores.length} stores, ${data.products.length} products, ${data.history.length} history. Nothing imported. Review ${outputPath}.`)
