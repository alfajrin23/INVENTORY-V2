# Supabase Request Audit — Thermal Printer, Scanner, Belanja, Release Notes

Tanggal audit: 15 September 2026

## Tujuan

Fitur baru tetap memakai Supabase hanya untuk data inventory yang memang harus persisten lintas perangkat. State perangkat seperti printer, Shopping Mode, dan release-note read state tidak dibuatkan tabel baru dan tidak menambah polling.

## Before

### Startup

`InventoryProvider` membaca cache lokal terlebih dahulu. Saat cache belum ada, repository memuat toko lalu snapshot toko aktif. Saat cache ada, UI menggunakan cache dan melakukan background refresh yang sudah ada. `getSnapshot` memakai request deduplication sehingga pemanggilan bersamaan menggunakan promise yang sama.

Repository Supabase melakukan filter toko di server. Products dan history menggunakan `store_id` pada query, bukan mengambil seluruh toko lalu memfilter di browser. Select juga menggunakan daftar kolom eksplisit.

### Transaksi

Barang masuk/keluar memakai RPC `process_inventory_transaction`. Satu request transaction mempunyai request ID untuk idempotency. Hasil mutation diterapkan secara incremental/optimistic ke state inventory; tidak ada jalur update stok langsung dari UI transaksi.

### Reports

Laporan dan rekomendasi memakai `products` dan `history` yang sudah berada di `useInventory`. Filter periode, pencarian, perhitungan revenue, dan restock dilakukan terhadap state/cache yang sudah dimuat; tidak ada query Supabase per perubahan tab atau per ketikan pencarian.

### Restock sebelum halaman Belanja

`RestockRecommendations` sebelumnya menghitung rekomendasi sendiri dari state products/history dan membatasi hasil dashboard ke 10 item.

## After

### Printer Thermal

- Default printer, identifier Bluetooth, auto reconnect, toggle barcode transaksi, toggle QR transaksi, dan opsi harga barcode disimpan lokal per perangkat.
- Membuka Printer Settings: **0 request Supabase**.
- Scan/pair/connect/test print/direct receipt/product barcode: **0 request Supabase**.
- Tidak ada ESC/POS byte yang dikirim melalui Supabase.
- Tidak ada tabel printer dan tidak ada Realtime subscription printer.

### Scanner

- Search `namaBarang`, `brand`, dan `barcode` dilakukan dari array `products` yang sudah dimuat.
- Debounce hanya mengatur filtering/rendering lokal.
- Scanner search per keystroke: **0 request Supabase**.
- Voice Search memakai speech recognition perangkat/browser dan hanya menulis transcript ke search field: **0 request Supabase backend**.
- Tidak ada polling dan tidak ada subscription Realtime baru.

### Barcode

- Barcode tetap `text` pada model existing sehingga leading zero seperti `001` dipertahankan.
- Uniqueness tetap memakai constraint existing `(store_id, barcode)` dan validasi client untuk feedback cepat.
- Tidak ada migration atau derived barcode table baru.
- Preview/symbology/CODE128/EAN validation dihitung lokal.

### Belanja

- Dashboard dan halaman Belanja memakai utility shared `buildRestockRecommendations`; tidak ada algoritma/query restock kedua.
- Search/filter/status/suggestedQty berasal dari products/history existing: **0 request Supabase per render/search/filter**.
- Shopping Mode dan daftar selesai disimpan lokal per device/store.
- Persistent notification Android menggunakan state rekomendasi lokal: **0 Supabase polling**.
- Hanya ketika user menekan **Tambah ke Stok**, aplikasi memakai existing `processTransaction({ category: 'masuk' })` → RPC inventory yang sama sehingga stok, history, audit, rollback/revision tetap konsisten.

### Release Notes

- GitHub Releases adalah sumber utama changelog; fallback changelog ada di bundle aplikasi.
- Cache changelog, `lastSeenReleaseNotesVersion`, dan status popup disimpan lokal.
- Membaca/menutup release notes: **0 request Supabase**.
- Logout/login tidak mengubah read state karena state tidak terkait user Supabase.

### Reports

Perubahan responsive Revenue Tabs hanya layout client. Tidak ada query baru untuk Harian/Mingguan/Bulanan/Tahunan.

## Request yang dihilangkan / tidak ditambahkan

Tidak ada `setInterval` fetch Supabase baru, tidak ada query per keystroke, tidak ada refresh products/history ketika printer berubah status, tidak ada polling Shopping notification, tidak ada Supabase changelog query, dan tidak ada Realtime subscription baru untuk printer/scanner/barcode/Shopping Mode/release notes.

## Yang tetap membutuhkan Supabase

1. Login/session existing.
2. Toko dan data inventory existing.
3. Product create/edit/delete existing, termasuk perubahan barcode produk.
4. Konfirmasi transaksi barang masuk/keluar melalui RPC existing.
5. Konfirmasi pembelian di Belanja melalui RPC incoming transaction existing.
6. History/audit/profile/media yang memang merupakan fitur existing.

## Ringkasan bukti target

| Aktivitas | Request Supabase tambahan |
| --- | ---: |
| Printer config | 0 |
| Printer direct print | 0 |
| Scanner search per keystroke | 0 |
| Voice scanner search | 0 |
| Barcode preview/symbology | 0 |
| Release notes read state | 0 |
| Shopping Mode local state | 0 |
| Shopping persistent notification | 0 polling |
| Konfirmasi barang sudah dibeli | existing transaction RPC write |

Arsitektur ini mengurangi request yang tidak perlu, tetapi tidak membuat janji matematis bahwa quota Supabase Free Plan pasti cukup untuk periode tertentu karena pemakaian tetap bergantung pada jumlah user, toko, transaksi, history, dan media.
