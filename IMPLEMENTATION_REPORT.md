# Implementation Report - Inventory V2

## 1. Audit Awal

Baseline dijalankan sebelum perubahan: `npm install`, `npm run lint`, `npm run build`, `npm run test:db`, dan `npm test`.

Kondisi awal lokal sudah jauh melampaui repo awal: arsitektur `UI -> InventoryProvider/useInventory -> InventoryRepository -> Supabase/Demo Repository` tersedia, Supabase repository sudah ada, migration atomic RPC sudah ada, Voice AI sudah masuk melalui workflow transaksi existing, dan Playwright/PGlite test suite sudah berjalan. Temuan lokal yang tersisa: `.env.example` hilang dari worktree, `IMPLEMENTATION_REPORT.md` direferensikan README tetapi belum ada, dan Voice AI belum mendukung draft tambah barang baru serta koreksi lisan pending transaction.

## 2. Database

Migration ada di `supabase/migrations/001_inventory_schema.sql` dan `supabase/migrations/002_inventory_transaction_rpc.sql`.

Schema meliputi `stores`, `products`, `history`, dan `inventory_requests`. Constraint utama mencakup UUID primary key, FK store/product, stok non-negatif, harga non-negatif, quantity positif, kategori `masuk`/`keluar`, dan unique barcode per toko.

RPC `process_inventory_transaction` melakukan validasi auth, validasi toko, idempotency request ID, lock produk berurutan, update stok, insert history, dan rollback otomatis bila ada langkah gagal. RPC `update_inventory_product` menangani edit stok dengan expected-stock check dan history koreksi.

RLS aktif pada tabel public. Direct stock/history writes dari client ditolak; transaksi stok harus lewat RPC. Fungsi RPC memakai `security definer`, `search_path = ''`, explicit `auth.uid()` checks, dan grant execute hanya untuk `authenticated`.

Project Supabase baru belum dibuat dari tool connector karena organization ID dari URL PRD (`gxqquyniyulmvczmkrpp`) ditolak oleh connector pada cost-check flow (`INVALID_ARGUMENT`). Connector hanya menampilkan akses ke org lain, sehingga saya tidak membuat project di org yang tidak diminta.

## 3. Frontend Changes

File utama yang berubah:

- `.env.example`: dipulihkan dengan placeholder `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, dan `VITE_DEMO_MODE=false`.
- `src/lib/voice-command.ts`: parser sekarang mendukung transaksi, fuzzy product matching termasuk barcode, draft tambah barang baru, cancel/retry, koreksi produk, dan koreksi qty sebagai pure helpers.
- `src/components/inventory/voice-dialog.tsx`: dialog sekarang dapat mengubah pending draft tanpa membuat transaksi baru, membatalkan lewat kata `batal`, dan menampilkan form konfirmasi tambah barang baru sebelum save.
- `src/components/inventory/transaction-workflow.tsx`: Voice create-product disalurkan lewat `addProduct` dari `useInventory`.
- `tests/e2e/inventory.spec.ts`: coverage voice parser/dialog ditambah untuk correction, spoken cancel, dan create-product draft/save.

## 4. Voice AI

Intent transaksi yang didukung: `barang masuk`, `stok masuk`, `masukkan stok`, `tambahkan stok`, `tambah stok`, `restok`, `masuk`, `barang keluar`, `transaksi`, `penjualan`, `jual`, dan `keluar`.

Tambahan sekarang:

- `tambah barang baru lampu led Panasonic stok 20 harga 35000 barcode 7770001` membuat draft barang baru.
- `bukan anker maksud saya jbl` mengganti produk pada draft transaksi yang sedang menunggu konfirmasi.
- `qty tiga` mengganti quantity draft, bukan membuat transaksi baru.
- `batal` menutup draft tanpa write.
- `ulang`, `ulangi`, `coba lagi`, atau `retry` memulai ulang listening.

Transaksi voice tetap wajib menunggu tombol `Konfirmasi`; tidak ada update stok saat recognition selesai.

## 5. UI/UX

Existing UI sudah memakai lucide icons, dialog responsive, semantic feedback colors, skeleton/empty/error states, bottom navigation mobile, scanner fallback, dan route-level lazy loading. Patch ini menambah state visual untuk create-product voice form dan warning icon pada kandidat ambiguous.

## 6. Performance

Existing provider sudah melakukan merge mutation result, request deduplication snapshot, background refresh saat focus/online/interval, lazy VoiceDialog/jsPDF, dan explicit Supabase paging agar laporan tidak terpotong row limit. Patch voice tetap lokal/pure dan tidak menambah query saat user mengetik koreksi.

## 7. Security

Tidak ada secret baru ditulis. `.env.example` hanya placeholder. `.env` tidak disalin ke dokumentasi. Supabase publishable key tetap satu-satunya key frontend. Service-role/database password tidak digunakan di client.

## 8. Testing

```text
Install:
PASS - npm install

Lint:
PASS - npm run lint
Warnings existing: react fast-refresh exports and set-state-in-effect warnings.

Build:
PASS - npm run build
Warning existing: Vite large chunks above 500 kB.

Database:
PASS - npm run test:db

Playwright:
35 passed
0 failed

Browser gut-check:
PASS - Playwright fallback opened http://127.0.0.1:5175/ in demo mode, rendered content, found no Vite/error overlay, found no console/page errors, and saved artifacts/dev-browser-check.png.
```

## 9. Known Limitations

- Live Supabase hosted project creation/advisors were not completed because the requested org identifier was rejected by the connector cost flow.
- Supabase CLI is not installed in this environment, so CLI-only advisor commands were unavailable here.
- `agent-browser` is not installed on PATH, so the visual dev-server check used Playwright directly.
- Automated DB tests run the real migration SQL on PGlite and Playwright mocks Supabase HTTP/Auth; hosted Supabase networking, billing, dashboard advisors, and real mobile microphone permission still need validation after the new project exists.
- Current auth model remains single-owner store access. Multi-cashier membership requires a separate membership table/policy design.

## 10. Deployment Instructions

Create the requested Supabase project in the correct organization or provide the connector-accessible organization ID. Use Singapore/AP Southeast (`ap-southeast-1`) if available. Then run the two migration files in order, create at least one Auth user, and configure:

```dotenv
VITE_SUPABASE_URL=https://PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_REPLACE_ME
VITE_DEMO_MODE=false
```

For Vercel, set the same two Supabase env vars in project settings and keep demo mode disabled for production. After deployment, run a hosted smoke test for login, store/product CRUD, manual in/out, voice confirmation, ambiguous voice suggestion, duplicate confirmation retry, reports, scanner fallback, and direct reload of legacy `.html` routes.
