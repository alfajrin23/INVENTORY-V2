# ABElektronik Inventory V2

React + Vite + TypeScript inventory dengan Supabase, transaksi PostgreSQL atomic, barcode scanner, perintah suara Bahasa Indonesia, multi-store, laporan, PDF, dan tampilan mobile.

Mulai dari [SUPABASE_SETUP.md](SUPABASE_SETUP.md) untuk membuat database, menjalankan migration, membuat akun, mengisi `.env.local`, migrasi data Firebase, dan deploy Vercel.

```powershell
npm install
npm run dev
```

Untuk demo lokal, isi `VITE_DEMO_MODE=true` di `.env.local`. Production menggunakan Supabase dengan login dan RLS; demo tidak tersedia pada production build.

```powershell
npm run build
npm run lint
npm run test:db
npx playwright install chromium
npm test
```

- [Audit struktur dan risiko](AUDIT.md)
- [Laporan implementasi dan hasil verifikasi](IMPLEMENTATION_REPORT.md)
- [Setup lengkap](SUPABASE_SETUP.md)
- SQL migration: `supabase/migrations/`
- Konversi backup offline: `scripts/prepare-firebase-import.mjs`

Rute legacy seperti `/databarang.html`, `/history.html`, dan `/laporanpendapatan.html` dipertahankan. Tidak ada Firebase runtime SDK. Voice di web menggunakan SpeechRecognition browser, sedangkan APK memakai pengenal suara native Android. Parser berjalan lokal dan setiap transaksi wajib dikonfirmasi. Browser tanpa SpeechRecognition dapat memakai input teks atau dikte keyboard.

## Android

Jalankan `npm run android:apk` untuk menyinkronkan Capacitor dan membuat `release/ABElektronik-Inventory-debug.apk`. APK meminta izin mikrofon saat Voice AI dipakai dan izin notifikasi saat aplikasi dibuka. Notifikasi panel menampilkan ringkasan toko, jumlah produk, stok menipis, serta tombol Voice AI dan Lihat stok. Tombol lonceng di aplikasi dapat meminta ulang izin notifikasi. Pengenalan suara memerlukan layanan pengenal suara yang aktif di perangkat Android.
