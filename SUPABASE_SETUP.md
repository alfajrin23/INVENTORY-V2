# Setup Inventory V2 dari nol

Source utama production adalah Supabase. Firebase sudah dilepas dari runtime. Jalankan setup di project Supabase baru/staging terlebih dahulu. Tidak ada data production yang dipindahkan otomatis oleh perubahan kode ini.

## 1. Buat project

1. Buka https://supabase.com/dashboard dan masuk.
2. Klik **New project**, pilih organisasi, isi nama (misalnya `inventory-v2`).
3. Buat database password kuat dan simpan di password manager. Password ini **tidak** dimasukkan ke Vite atau Git.
4. Pilih region yang dekat dengan pengguna, lalu **Create new project** dan tunggu provisioning selesai.

## 2. Ambil URL dan key yang benar

1. Buka project, klik **Connect**. Salin **Project URL**, berbentuk `https://PROJECT_REF.supabase.co`. URL juga tersedia pada **Project Settings → Data API**. Jangan memakai connection string PostgreSQL sebagai URL frontend.
2. Buka **Project Settings → API Keys → Publishable and secret API keys**. Salin **Publishable key**, umumnya berawalan `sb_publishable_`.
3. Jangan salin **Secret key**, **service_role**, database password, atau access token CLI ke frontend. Publishable key memang dapat terlihat di browser; akses data dilindungi Auth, RLS, dan grants. [Dokumentasi API keys](https://supabase.com/docs/guides/getting-started/api-keys).

## 3. Environment lokal

Di folder project (`D:\INVENTORY V2`), jalankan PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Buka `.env.local`, isi **persis** nama variabel berikut:

```dotenv
VITE_SUPABASE_URL=https://PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_GANTI_DENGAN_KEY_PROJECT
VITE_DEMO_MODE=false
```

`.env.local` diabaikan Git. Restart Vite setelah mengubah env. Jangan membuat variabel AI secret dengan awalan `VITE_`.

Untuk demo development tanpa database, kosongkan URL/key dan ubah `VITE_DEMO_MODE=true`. Demo hanya bekerja saat `npm run dev`; production build **selalu** membutuhkan Supabase. Kegagalan koneksi Supabase tidak otomatis mengalihkan transaksi ke demo.

## 4. Jalankan migration

Cara paling mudah tanpa Docker/CLI:

1. Di dashboard Supabase, buka **SQL Editor → New query**.
2. Buka file `supabase/migrations/001_inventory_schema.sql` di repository; copy **seluruh isi** ke editor; klik **Run**.
3. Buat query baru, copy seluruh `supabase/migrations/002_inventory_transaction_rpc.sql`; klik **Run**.
4. Keduanya harus menunjukkan sukses. Jalankan berurutan dan hanya sekali untuk project kosong. Jangan menghapus tabel jika mendapatkan “already exists”; periksa migration mana yang telah berhasil.

Alternatif CLI untuk pengelolaan migration:

```powershell
npx supabase login
npx supabase init
npx supabase link --project-ref PROJECT_REF
npx supabase db push --dry-run
npx supabase db push
```

CLI meminta kredensial melalui prompt. Jangan memasukkannya ke source. Pilih **SQL Editor atau CLI** untuk database baru; jangan menjalankan keduanya tanpa merekonsiliasi migration history. File SQL memiliki transaksi `begin/commit`, sehingga migration yang gagal tidak meninggalkan sebagian skema.

## 5. Pastikan schema berhasil

Di **Table Editor**, schema `public` harus memuat `stores`, `products`, `history`, `inventory_requests`. SQL Editor:

```sql
select tablename, rowsecurity from pg_tables
where schemaname = 'public' and tablename in ('stores','products','history','inventory_requests');
select proname from pg_proc
where proname in ('process_inventory_transaction','update_inventory_product');
```

Keempat nilai `rowsecurity` harus `true`; kedua function harus ada. Jangan menambahkan policy `using (true)` untuk membuat app “langsung bekerja”.

## 6. Auth dan RLS

Implementasi menggunakan login email/password minimal, tanpa sistem signup publik, organisasi, atau role kasir terpisah.

1. Buka **Authentication → Users → Add user → Create new user**.
2. Isi email dan password akun pemilik toko. Pilih konfirmasi email otomatis bila pilihan tersebut tersedia untuk akun yang dibuat admin.
3. Pada pengaturan Auth, pastikan provider **Email** aktif. Nonaktifkan public signup bila hanya admin yang membuat akun.
4. Masuk di aplikasi menggunakan akun ini, lalu buka **Setelan → Profil & Toko → Tambah Toko**.
5. Kolom `stores.owner_id` otomatis berisi UUID akun yang sedang login. Akun lain tidak dapat membaca atau mengubah toko tersebut.

RLS stores membatasi pemilik; products/history mengikuti kepemilikan toko. Anonymous tidak dapat mengakses inventory. Authenticated tidak dapat update stock secara langsung atau insert history; stock mutation harus RPC. RPC `security definer` memakai `search_path` kosong, validasi `auth.uid()`, validasi toko, dan izin execute hanya authenticated. [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Database functions](https://supabase.com/docs/guides/database/functions).

Saat ini toko dimiliki satu akun; akses beberapa kasir dengan akun berbeda memerlukan tabel membership/policy tambahan. Jangan berbagi service-role untuk mengatasi hal ini. Menghapus toko melakukan **CASCADE** pada products, history, inventory_requests; UI meminta konfirmasi. Menghapus produk mempertahankan snapshot history dan menjadikan `history.product_id` null. Backup sebelum menghapus toko.

## 7. Jalankan aplikasi

Gunakan Node.js yang memenuhi versi Vite pada package-lock (Node 22.12+ atau versi LTS lebih baru yang kompatibel).

```powershell
npm install
npm run dev
```

Buka URL yang dicetak terminal, biasanya `http://localhost:5173`. Login, buat toko, lalu tambah produk. Halaman memuat konfigurasi bila URL/key kosong; tidak ada data demo diam-diam di production.

## 8. Test koneksi sampai database

1. Buat toko `Uji Staging` dan produk `Lampu Philips`, brand `Philips`, harga `15000`, stok `15`, barcode unik `8990000000001`.
2. Buka History Barang, pilih Barang Masuk, isi qty `5`, Simpan. Stok menjadi `20`; history masuk muncul.
3. Klik mic, ucapkan `transaksi lampu Philips dua`. **Sebelum konfirmasi**, stok tetap `20`.
4. Konfirmasi, stok menjadi `18`. Di Table Editor, cek `products.stok=18`, history keluar qty 2, dan satu record `inventory_requests` untuk transaksi itu.
5. Uji qty keluar `999`; database harus menolak dan tidak membuat history baru.
6. Login akun kedua pada private window. Toko akun pertama tidak boleh terlihat.
7. Buka dua browser akun sama. Coba menjual stok terakhir bersamaan. Total penjualan berhasil tidak boleh melebihi stok awal; salah satu request harus ditolak ketika stok habis.
8. Di DevTools → Network, transaksi memanggil satu `POST /rest/v1/rpc/process_inventory_transaction`; UI tidak mengirim PATCH stok lalu POST history terpisah.

Tes langkah 7 perlu dilakukan terhadap Supabase hosted setelah setup; tes DB otomatis lokal tidak mengklaim pengujian dua koneksi jaringan production.

## 9. Voice AI dan fallback

Tidak ada LLM atau API AI berbayar pada implementasi ini. Speech-to-text memakai `SpeechRecognition`/`webkitSpeechRecognition` dengan `lang=id-ID`. Interpreter deterministik lokal menghasilkan intent, query produk, dan jumlah. Browser dapat memakai layanan speech milik vendornya; “parser lokal” tidak berarti audio selalu diproses offline. [Dukungan SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition).

Contoh perintah:

```text
barang masuk lampu Philips 10
masukkan stok kabel Eterna lima
restok kabel Eterna dua puluh
transaksi lampu Philips dua
jual lampu Philips tiga
penjualan lampu Philips sebanyak tiga
transaksi lampu Philips dua dan kabel Eterna tiga
```

Angka digit sampai 1.000.000 didukung; angka kata satuan, belasan, puluhan, ratusan dan ribuan didukung. Perintah campur masuk+keluar, desimal, negatif, qty kosong, atau produk ambigu tidak dieksekusi. Nama model dengan angka sebaiknya menyertakan unit, misalnya `lampu Philips 12 watt dua`.

Flow: **mic → izin/listening → transcript → parser → matching produk toko aktif → validasi → preview stok → Konfirmasi → transaction workflow existing → provider/repository → RPC → UI sukses**. Kandidat yang belum pasti harus dipilih secara eksplisit. Tombol konfirmasi dinonaktifkan saat menyimpan, stok kurang, atau produk belum dipilih. Tidak ada write saat recognition selesai.

Gunakan HTTPS pada ponsel (localhost hanya untuk perangkat itu sendiri). Izinkan microphone pada pengaturan situs. Jika API speech tidak tersedia atau izin ditolak, dialog tetap terbuka dan menyediakan input teks/dikte keyboard Bahasa Indonesia. Barcode scanner tetap memiliki input manual/search jika kamera gagal.

### Edge Function / AI secret / deployment AI

**Tidak diperlukan pada versi ini.** Tidak ada function `voice-command`, MediaRecorder upload, atau AI key yang perlu diisi/deploy. Fallback saat ini adalah teks/dikte keyboard, sehingga browser tanpa SpeechRecognition tidak merekam audio melalui tombol mic. Ini batas kompatibilitas yang disengaja, bukan endpoint placeholder.

Jika kelak menambahkan transkripsi audio/LLM, implementasikan Supabase Edge Function dengan verifikasi user, batas ukuran/durasi/rate, timeout, secret server-side, dan validasi JSON. Jangan memberi AI akses SQL atau hak write inventory. Secret hanya melalui Supabase **Edge Functions → Secrets**, bukan env Vite. Penambahan tersebut merupakan pekerjaan lanjutan; perintah dasar yang ada tidak membutuhkannya.

## 10. Deployment Vercel

1. Simpan perubahan di repository Git yang Anda gunakan; branch utama tetap `main`.
2. Buka Vercel dashboard → **Add New → Project** → import repository.
3. Framework preset: **Vite**. Root directory: folder yang memuat `package.json`.
4. Install command: `npm install`; build command: `npm run build`; output directory: `dist`.
5. Di **Project → Settings → Environment Variables**, buat:

| Name persis | Value yang disalin | Lingkungan |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Project URL Supabase | Production; Preview memakai project staging bila tersedia |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Publishable key untuk URL tersebut | Production dan Preview yang sesuai |

6. Jangan aktifkan demo di Vercel. Jangan menambahkan secret/service-role/AI key sebagai `VITE_*`.
7. Klik **Deploy**. `vercel.json` mengarahkan route React termasuk `.html` legacy ke `index.html`.
8. Jika env diubah setelah build, buka **Deployments → menu deployment → Redeploy**. Env Vite disisipkan saat build, jadi perubahan env memerlukan build baru. [Environment variables Vercel](https://vercel.com/docs/environment-variables).
9. Jika menggunakan email recovery/Auth redirect di kemudian hari, tambahkan domain HTTPS deployment pada Supabase **Authentication → URL Configuration**, termasuk Site URL yang benar.
10. Uji login, reload langsung `/history.html`, CRUD, transaksi, PDF, dan microphone pada URL HTTPS deployment.

Tidak ada deployment remote yang dijalankan oleh perubahan ini; konfigurasi akun/env dilakukan oleh pemilik project.

## 11. Memindahkan data Firebase dengan backup

Tidak ada backup Firebase di repository yang diberikan. Keberadaan/isi database lama belum diverifikasi. SDK Firebase dihapus dari runtime, **bukan** data pada akun Firebase Anda.

1. Bekukan penulisan aplikasi lama saat cutover. Buat managed Firestore export/backup dan simpan salinan aman. Simpan juga file/foto Firebase Storage terpisah bila digunakan.
2. Siapkan JSON dari export Admin SDK terpercaya atau dump lokal berbentuk `{ "stores": [...], "products": [...], "history": [...] }`. Setiap record perlu field `id`; field lain memakai model camelCase existing (`storeId`, `namaBarang`, `addressLink`, dll.). Managed Firestore export biner tidak langsung diterima converter ini.
3. Tanggal harus ISO string atau objek timestamp `{ "seconds": 1234567890 }` / `{ "_seconds": 1234567890 }`. Numeric harus JSON number. Tanggal metadata kosong memakai waktu konversi; pastikan `history.tanggal` asli dipertahankan.
4. Buat user pemilik di Supabase Auth dan copy UUID user tersebut dari **Authentication → Users**.
5. Buat folder `backups` yang sudah diabaikan Git dan jalankan:

```powershell
New-Item -ItemType Directory -Force backups
node scripts/prepare-firebase-import.mjs backups/firebase.json backups/import.sql UUID_USER_PEMILIK
```

6. Utility hanya membaca JSON dan menulis SQL baru; tidak melakukan request jaringan, tidak mengubah backup, dan menolak overwrite output. ID Firebase dipetakan ke UUID stabil; foreign key dan snapshot history dipertahankan. Nilai negatif/qty invalid dan orphan toko ditolak. Duplicate barcode/ID akan ditolak saat SQL dijalankan.
7. Review `import.sql`, lalu jalankan di SQL Editor **project staging dengan migration selesai dan tabel kosong**. Seluruh import satu transaksi; tidak memakai upsert atau delete. Menjalankan ulang pada data sama akan gagal dan rollback, tidak menggandakan stok.
8. Bandingkan jumlah toko/produk/history, total stok per toko, total nilai inventory, total penjualan, sampling tanggal/nama/barcode dengan sumber. Test login pemilik dan laporan.
9. Foto berupa URL Firebase tetap merujuk storage lama. Pindahkan file ke storage yang dipilih dan perbarui URL setelah verifikasi; jangan hapus storage lama sebelum semua referensi selesai.
10. Lakukan backup target, import final setelah freeze, deploy env Supabase, verifikasi, lalu arsipkan aplikasi lama. Jangan menyalakan dua sumber penulisan production bersamaan.

Backup Supabase: gunakan **Database → Backups** sesuai paket atau `supabase db dump` untuk schema/data ke penyimpanan aman. Uji restore ke project terpisah. Jangan menghapus `inventory_requests` sembarangan: record ini mencegah transaksi retry dicatat ulang.

## 12. Testing otomatis

```powershell
npm install
npm run build
npm run lint
npm run test:db
npx playwright install chromium
npm test
```

Playwright menggunakan demo DEV di port 5173, serta repository Supabase di port 5174 dengan HTTP/Auth mock dan SQL PGlite; tidak membutuhkan microphone fisik atau kredensial. Tutup server port 5173/5174 bila konfigurasi tidak sama dengan Playwright config, atau jalankan test dengan server yang dikelola config. PGlite mengeksekusi migration SQL asli dan menguji rollback/RLS/idempotency, tetapi tidak menggantikan pengujian jaringan Supabase hosted. Buka HTML report dengan `npx playwright show-report`.

## 13. Troubleshooting

| Gejala | Pemeriksaan/tindakan |
| --- | --- |
| Konfigurasi belum lengkap | Periksa `.env.local`, nama exact, URL bukan connection string, restart Vite |
| Invalid API key / 401 | URL dan publishable key harus berasal dari project sama; login ulang |
| Login gagal | Auth user sudah dibuat/confirmed, Email provider aktif, password benar, koneksi normal |
| Tabel kosong setelah login | Tambah toko atau cek `owner_id`; jangan membuka RLS |
| Function not found | Jalankan migration 002 pada project yang sama dengan env |
| Permission denied / 403 | Login dan kepemilikan toko; cek policy/grants, bukan service-role di browser |
| Stok berubah saat edit | Tutup form, muat ulang, buka Edit lagi; perubahan bersamaan sengaja ditolak |
| Timeout / koneksi terputus saat konfirmasi | Coba ulang payload yang sama; request ID dipertahankan di sessionStorage dan RPC idempotent |
| Produk tidak cocok | Sebutkan brand/unit/model; pilih kandidat manual bila mirip |
| Microphone tidak tersedia | HTTPS, pengaturan permission, dukungan API browser; teks/dikte keyboard tetap tersedia |
| Kamera tidak tersedia | Izinkan kamera, hentikan aplikasi lain yang memakainya; gunakan barcode manual/search |
| PDF/print tidak membuka | Izinkan download/popup; print fisik mengikuti browser dan driver printer |
| Data pada perangkat lain belum berubah | Sinkronisasi saat fokus/online dan setiap 60 detik ketika visible; validasi stok tetap dilakukan di DB |
| Reload route Vercel 404 | Pastikan `vercel.json` di root deployment dan output `dist` |
| Demo data rusak | Backup localStorage terlebih dahulu; aplikasi tidak menimpa payload rusak otomatis |

Untuk error server buka Supabase **Logs → Postgres / API / Auth**, cocokkan waktu request dengan DevTools Network. Simpan kode error dan pesan tanpa menyalin token Authorization. Tidak ada Edge Function log pada versi tanpa backend AI ini.
