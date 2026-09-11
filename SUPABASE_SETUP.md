# Supabase Setup — INVENTORY-V2

## Target project

Buat project Supabase baru khusus aplikasi ini pada organisasi `gxqquyniyulmvczmkrpp`. Nama yang direkomendasikan `inventory-v2` atau `inventory-v2-prod`, region `ap-southeast-1` (Singapore) bila tersedia.

Jangan menggunakan project Supabase aplikasi lain untuk INVENTORY-V2.

## Migration

Schema production berada di:

`supabase/migrations/202609110001_inventory_v2.sql`

Migration membuat:

- `stores`
- `products`
- `transaction_requests` sebagai idempotency ledger
- `history`
- constraint stock/harga/qty/type
- partial unique barcode per store
- index sesuai query store/product/history
- RLS ownership per store
- RPC `process_inventory_transaction()`
- RPC `update_inventory_product()`

RPC mutasi stok memakai row lock dan transaksi PostgreSQL. Jika satu item gagal, seluruh statement rollback. `request_id` yang sama dengan payload yang sama mengembalikan hasil transaksi sebelumnya dan tidak mengubah stok dua kali.

## Environment variables

Development/production frontend hanya membutuhkan public configuration:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
VITE_DEMO_MODE=false
```

Jangan menaruh database password, secret key, atau `service_role` pada Vite/Vercel frontend.

Untuk demo lokal saja:

```env
VITE_DEMO_MODE=true
```

Demo mode sengaja hanya aktif pada `import.meta.env.DEV`; production build tetap meminta konfigurasi Supabase.

## Authentication & RLS

Aplikasi memakai Supabase Auth email/password. `AuthGate` membaca session browser dan menampilkan login/register bila belum authenticated.

Authorization database tidak memakai `user_metadata`. Setiap store memiliki `owner_id` dan RLS membatasi store/product/history berdasarkan `auth.uid()`.

RPC privileged memakai `SECURITY DEFINER` hanya untuk transaksi atomik, dengan:

- explicit `auth.uid()` check
- store ownership check
- fixed `search_path`
- EXECUTE direvoke dari `PUBLIC` dan `anon`
- EXECUTE hanya diberikan ke `authenticated`

## Apply migration

Setelah project baru tersedia, link Supabase CLI ke project tersebut lalu apply migration melalui workflow Supabase yang digunakan tim Anda. Review project ref sebelum menjalankan perubahan agar migration tidak pernah diarahkan ke project lain.

Setelah migration:

1. Buat/konfirmasi user Auth.
2. Isi environment variables lokal.
3. Login ke aplikasi.
4. Buat store pertama dari UI.
5. Jalankan CRUD + transaction smoke test.
6. Jalankan Security Advisor dan Performance Advisor.
7. Perbaiki advisor warning yang relevan sebelum production.

## Vercel

Tambahkan hanya:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_DEMO_MODE=false`

Lakukan redeploy setelah environment variables disimpan.

## Verification commands

```bash
npm ci
npm run lint
npm run build
npm run test:db
npx playwright install chromium
npm test
```

`npm run test:db` menjalankan migration dan integrity tests secara lokal melalui PGlite. Setelah project Supabase target tersedia, tetap lakukan smoke test pada database Supabase nyata dan jalankan Security/Performance Advisor karena local test tidak menggantikan verification terhadap konfigurasi project hosted.
