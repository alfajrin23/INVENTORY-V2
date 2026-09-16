# Ikon Android ABELEKTRONIK

`abelektronik-wordmark.png` adalah logo utuh yang dipilih untuk ikon APK.
Huruf dan warna dari gambar sumber dipertahankan; tidak diganti monogram AB.

Resource siap build berada di `android/app/src/main/res/mipmap-*`:

- Ikon biasa dan bulat: 48, 72, 96, 144, dan 192 px (mdpi sampai xxxhdpi).
- Foreground adaptif: 108, 162, 216, 324, dan 432 px dengan transparansi.
- Latar adaptif putih memakai `@color/ic_launcher_background` yang sudah ada.
- Android 13+ memakai alpha foreground yang sama untuk ikon bertema.

Ekspor memakai area logo sumber x=43, y=252, lebar=2086, tinggi=195 px.
Logo dipusatkan tanpa mengubah rasio: lebar 88% untuk ikon lama, serta
64 dp pada kanvas foreground 108 dp agar tetap dalam area aman lingkaran
66 dp. Nama yang panjang akan terlihat kecil pada launcher, sesuai pilihan
mempertahankan tulisan lengkap dalam satu baris.

Sumber panduan: https://developer.android.com/develop/ui/compose/system/icon_design_adaptive

Semua PNG sudah disimpan sehingga build tidak memerlukan generator gambar
atau dependency tambahan. `AndroidManifest.xml` sudah menunjuk resource ini.

## Memakai ikon baru

1. Ambil perubahan terbaru dengan `git pull`.
2. Jalankan `npm run android:apk` jika toolchain portable proyek sudah tersedia.
   Alternatif melalui Android Studio: `npm run cap:sync`, kemudian
   `npm run android:open`, lalu build APK.
3. Install APK hasil build. Pembaruan atas aplikasi yang sudah terpasang
   harus memakai signing key yang sama; gunakan alur release proyek untuk
   APK release. Jangan menghapus aplikasi hanya untuk mengganti ikon.

Ikon native tidak berubah hanya dengan deploy web/Vercel. APK lama tetap
memuat resource lama sampai APK baru dipasang. Jika launcher masih menampilkan
cache ikon lama setelah update, coba hapus shortcut dari layar utama lalu
tambahkan lagi atau restart perangkat.

Untuk mengganti logo berikutnya, gunakan gambar sumber di Android Studio
Image Asset Studio dan ekspor ikon adaptive serta legacy dengan nama resource
yang sama. Periksa pula resource `mipmap-anydpi-v33` untuk ikon bertema.
