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

Rute legacy seperti `/databarang.html`, `/history.html`, dan `/laporanpendapatan.html` dipertahankan. Tidak ada Firebase runtime SDK. Voice menggunakan SpeechRecognition browser dan parser lokal; setiap transaksi wajib dikonfirmasi. Browser tanpa SpeechRecognition dapat memakai input teks atau dikte keyboard.
