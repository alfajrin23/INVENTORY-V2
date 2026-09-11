# Audit Inventory V2

Audit dilakukan sebelum implementasi di branch `main`. `.codegraph/` existing digunakan untuk memetakan dependensi; tidak diindeks ulang. `CLAUDE.md`, source aplikasi, shared components, konfigurasi, dan mockup dibaca. Dokumen mockup diperlakukan sebagai referensi visual; permintaan pengguna menjadi scope implementasi.

## Peta alur existing

`main.tsx → App.tsx → BrowserRouter → InventoryProvider → AppShell → halaman lazy`.

- AppShell: sidebar desktop, header, pemilihan toko, tema/localStorage, profil, ringkasan WhatsApp, bottom nav, scanner transaksi.
- InventoryProvider/useInventory: snapshot toko aktif, produk/history, CRUD, transaksi, loading/error.
- inventory-service: kontrak repository; sebelumnya memilih Firestore atau localStorage otomatis berdasarkan konfigurasi.
- transaction-workflow: scanner/pencarian → cart → qty/kategori → processTransaction → resi/PDF/print.
- history-page: form barang masuk/keluar memakai processTransaction yang sama.
- products-page: CRUD, validasi barcode, pilihan produk, barcode PNG/PDF/fullscreen, scanner.
- reports-hub/report-pages: mutasi masuk/keluar, stok, pendapatan harian/mingguan/bulanan/tahunan, filter dan PDF. Analytics/format menghitung revenue dari history kategori keluar.
- profile-settings: CRUD toko, aktivasi, foto profil lokal/foto toko; settings: tentang/keluar.
- scanner-dialog: lazy html5-qrcode, kamera environment, barcode manual, product search, debounce 220 ms, repeated scan guard.
- types: model camelCase StoreRecord/Product/HistoryItem/CartItem/TransactionInput tetap menjadi kontrak UI.
- shared GlassPanel/MetricCard/DataState: visual, loading/empty/error. Radix UI menyediakan dialog, select, input, tables, navigation primitives.

## Temuan dan tindakan

| Temuan sebelum perubahan | Tindakan |
| --- | --- |
| Firebase di `lib/firebase.ts`, `inventory-service.ts`, badge AppShell, provider mode, env/dependency/README | Diganti Supabase repository dan env; SDK Firebase dihapus |
| Firestore batch menyatukan update/history, tetapi cek stok memakai snapshot browser | PostgreSQL RPC memvalidasi stok aktual setelah lock; seluruh keranjang rollback |
| CRUD/edit produk dapat menulis stok absolut dari snapshot lama | RPC edit membandingkan expected stock dan mencatat koreksi atomic |
| Semua mutation memanggil full snapshot refresh | Produk/hasil transaksi digabung dari response; re-fetch toko hanya pada operasi toko; sinkronisasi fokus/online/60 detik |
| Permintaan snapshot lama dapat menimpa pemilihan toko baru | Generation guard dan serialisasi mutation/store selection |
| Supabase default row cap dapat memotong laporan | Pembacaan eksplisit per 500 row, urutan stabil; produk/history paralel |
| Produk save/delete, toko delete/activate berpotensi unhandled rejection | Try/catch dan pesan Bahasa Indonesia; disable saat save |
| Kamera start bisa selesai setelah dialog ditutup; callback berubah restart kamera | Callback ref melalui effect, timer clear, stop setelah delayed start, import catch |
| Scanner mobile tinggi 420px, container overflow hidden menyembunyikan input | Preview 28dvh, scroll dialog, barcode/search fallback selalu terjangkau |
| Tabel mobile existing sudah menggunakan cards | Dipertahankan, spacing/touch/safe area/dialog/mobile report hub diperbaiki |
| Light theme existing mengganti background tetapi teks tetap putih | Warna mobile light disesuaikan; default mobile mint, preferensi tema existing dihormati |
| Main bundle awal 1,321.48 kB minified / 409.53 kB gzip | Firebase dihapus; jsPDF dan VoiceDialog lazy; hasil akhir tercatat di IMPLEMENTATION_REPORT.md |
| Playwright terpasang tetapi tanpa config/suite | Suite regression ditambahkan, microphone mock, database tests menjalankan migration asli |

## Penyimpanan lokal

- `ab-elektronik-v2-data`: data demo hanya saat Vite DEV + `VITE_DEMO_MODE=true`. Data rusak tidak ditimpa seed otomatis.
- `activeStoreId`: preferensi toko; divalidasi terhadap toko yang boleh dibaca akun.
- `theme`, `profilePhoto`, `whatsappPhone`: preferensi perangkat, bukan source of truth inventory.
- Legacy `storeName`, `storeAddress`, `addressLink`: metadata demo existing.
- `pendingBarcode`: sessionStorage scanner → form produk.
- `inventory-pending-transaction`: request ID retry per payload, bukan secret.
- Session Auth disimpan SDK Supabase; logout dilakukan melalui Auth.

## Batas audit

Tidak ada kredensial Supabase/Firebase atau backup data production yang diberikan. Tidak ada data remote yang dibaca, dipindahkan, atau dihapus. Tes DB lokal menggunakan PostgreSQL WASM (PGlite), bukan klaim verifikasi koneksi Supabase hosted. Browser fisik Android/iOS, izin OS, dan printer fisik memerlukan pemeriksaan manual. Tidak ada benchmark volume production karena dataset production tidak tersedia.
