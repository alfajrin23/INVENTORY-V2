# Setup QRIS Dinamis GoPay

Alur aplikasi memakai **GoPay QRIS POS melalui Midtrans**. Setiap transaksi meminta QRIS baru dengan nilai total dari server. Aplikasi baru mengurangi stok dan menampilkan transaksi selesai setelah webhook Midtrans terverifikasi.

## Perbedaan dengan QR statis GoBiz

QR cetak GoBiz yang disertakan tetap dapat dilihat dan diganti dari **Pengaturan → Pengaturan QRIS** sebagai gambar referensi. QR tersebut bersifat statis sehingga tidak membawa nominal transaksi dan tidak menghubungkan sebuah pembayaran ke keranjang tertentu. Aplikasi membuat QR dinamis dari respons API Midtrans untuk pembayaran. Agar pencairannya masuk ke rekening usaha yang benar, selesaikan onboarding Midtrans dengan data merchant dan rekening pencairan ABElektronik yang sesuai.

## 1. Aktifkan akses GoPay QRIS POS di Midtrans

1. Masuk atau daftar di [Midtrans Dashboard](https://dashboard.midtrans.com/).
2. Selesaikan onboarding merchant dan pengajuan dokumen usaha. Jika sudah memakai GoBiz, hubungi Midtrans Business PIC/Support dan sampaikan: **“Saya ingin mengaktifkan GoPay QRIS POS / Core API untuk aplikasi kasir, termasuk QR dinamis dan HTTP notification.”** Minta mereka memastikan merchant ID dan rekening settlement yang digunakan.
3. Mulai dari Sandbox. Di Dashboard pilih **Settings → Access Keys** pada lingkungan Sandbox. Simpan **Server Key** dan **Merchant ID**. Aplikasi ini tidak membutuhkan Client Key.
4. Setelah uji Sandbox selesai dan merchant disetujui, ambil Server Key dan Merchant ID Production secara terpisah.

Midtrans menyatakan pembuatan QR dan pemrosesan API dilakukan dari backend. Jangan masukkan Server Key ke `.env` frontend, APK, GitHub, tiket publik, atau percakapan.

## 2. Pasang perubahan ke proyek Supabase aplikasi

Pastikan project ref yang dipakai adalah milik aplikasi Inventory V2. Sambungkan Supabase CLI bila belum:

```powershell
npx supabase login
npx supabase link --project-ref <PROJECT_REF_INVENTORY_V2>
```

Masukkan tiga nilai Sandbox di Dashboard Supabase pada **Edge Functions → Secrets**:

| Nama | Nilai |
| --- | --- |
| `MIDTRANS_SERVER_KEY` | Server Key Sandbox Midtrans |
| `MIDTRANS_EXPECTED_MERCHANT_ID` | Merchant ID Sandbox yang sama |
| `MIDTRANS_IS_PRODUCTION` | `false` |

Lalu jalankan migration dan deploy dua fungsi:

```powershell
npx supabase db push
npx supabase functions deploy create-qris-payment
npx supabase functions deploy midtrans-qris-notification
```

Fungsi pembuatan QR memerlukan login kasir. Endpoint notifikasi publik hanya menerima transaksi dengan signature SHA-512 yang valid, merchant ID yang cocok, kanal `qris`/`gopay`, nominal yang sama, serta status `settlement` dan fraud status `accept`. URL notifikasi Midtrans disertakan otomatis saat transaksi dibuat.

## 3. Uji Sandbox

1. Buka aplikasi dengan akun yang memiliki toko di project Supabase tersebut.
2. Buat transaksi **Barang Keluar**, tekan **Proses → QRIS GoPay**.
3. Pastikan nominal di layar sama dengan total keranjang. QR dinamis Sandbox akan tampil selama masa aktif dari Midtrans.
4. Selesaikan skenario pembayaran QRIS Sandbox sesuai panduan/akun uji Midtrans. Setelah webhook `settlement`, aplikasi memperbarui stok, menampilkan modal transaksi selesai, dan memasukkan pembayaran ke **Riwayat QRIS**.
5. Uji juga QR kedaluwarsa, webhook duplikat, dan notifikasi dengan nominal/merchant tidak cocok. Ketiganya tidak boleh menandai transaksi lunas.

## 4. Aktifkan Production

Setelah akun merchant dan QRIS Production aktif, ganti ketiga secret Supabase dengan **Production Server Key**, **Production Merchant ID**, dan `MIDTRANS_IS_PRODUCTION=true`. Jangan gunakan Server Key Sandbox di Production atau sebaliknya. Buat transaksi live bernilai kecil untuk memastikan pencairan masuk ke rekening usaha yang benar.

## Notifikasi Android

Saat aplikasi kasir terbuka di layar QR, Supabase Realtime memantau pembayaran dan aplikasi menampilkan notifikasi lokal setelah settlement. Jika aplikasi ditutup atau Android menghentikan prosesnya, notifikasi jarak jauh memerlukan konfigurasi push Firebase Cloud Messaging (FCM) tersendiri; kredensial FCM tidak termasuk integrasi ini.
