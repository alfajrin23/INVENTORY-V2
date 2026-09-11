# Audit INVENTORY-V2

Tanggal audit: 11 September 2026

## Kondisi awal branch `main`

Arsitektur aplikasi sudah mengarah ke pola yang benar: UI memakai `InventoryProvider/useInventory`, provider memakai `InventoryRepository`, dan transaksi manual/scanner bermuara pada `processTransaction()`. Route sudah lazy-loaded dan `AppShell` sudah memakai Framer Motion untuk page transition serta reduced-motion.

Namun branch `main` berada dalam keadaan implementasi Supabase/Voice yang tidak lengkap. README menyebut file setup, migration, audit, implementation report, database tests, dan Voice AI yang belum ada pada tree repository.

## Baseline CI

Baseline dijalankan dengan Node 24 pada GitHub Actions sebelum source implementation diubah.

- `npm ci`: PASS, 0 vulnerability.
- `npm run lint`: PASS, 8 warning existing, 0 error.
- `npm run build`: FAIL.
- `npm run test:db`: SKIPPED karena build gagal lebih dulu.
- `npm test`: SKIPPED karena build gagal lebih dulu.

Build gagal karena file yang sudah di-import oleh source tidak tersedia:

- `src/components/auth-gate.tsx`
- `src/components/inventory/voice-dialog.tsx`
- `src/lib/supabase.ts`
- `src/lib/supabase-repository.ts`

`package.json` juga sudah memiliki script `test:db` yang menunjuk ke `tests/database.mjs`, tetapi file tersebut belum tersedia.

## Risiko utama yang ditemukan

1. Production build tidak dapat dibuat karena missing modules.
2. README mendeskripsikan kemampuan database/Voice yang belum benar-benar tersedia di branch.
3. Tidak ada migration yang dapat direview untuk constraint, RLS, atomic stock mutation, atau idempotency.
4. Tidak ada database test yang membuktikan rollback, duplicate request protection, store isolation, atau insufficient stock.
5. Voice entry point sudah ada pada UI, tetapi komponen Voice belum ada sehingga jalur tersebut tidak dapat dipakai.

## Keputusan implementasi

- Tidak rebuild aplikasi.
- Pertahankan React + Vite + TypeScript.
- Pertahankan `InventoryProvider` dan `InventoryRepository` sebagai satu source of truth.
- Manual transaction, scanner, dan Voice tetap menggunakan `processTransaction()` yang sama.
- Mutasi stok production ditempatkan pada PostgreSQL RPC untuk row locking, rollback atomik, dan idempotency.
- RLS memakai ownership berdasarkan `stores.owner_id = auth.uid()`; tidak memakai `user_metadata` sebagai sumber authorization.
- Frontend hanya memakai Supabase publishable key.
- Voice parser/fuzzy matching dibuat pure dan testable, terpisah dari SpeechRecognition/UI.
