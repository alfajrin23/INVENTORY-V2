# QRIS dinamis lokal dan konfirmasi kasir

Aplikasi memakai data QRIS statis ABElektronik untuk membentuk isi QRIS per transaksi. Nominal keranjang dan referensi transaksi ditambahkan ke payload, lalu checksum QRIS dihitung ulang. QR ditampilkan dari perangkat kasir tanpa membuat transaksi di Midtrans.

## Batas konfirmasi pembayaran

QR yang dibentuk aplikasi tidak terhubung ke GoBiz, bank, atau penyedia QRIS untuk membaca status pembayaran. Kasir harus membuka GoBiz, memastikan dana transaksi benar-benar masuk dengan nominal yang cocok, lalu menekan **Konfirmasi dibayar** di layar QR atau **Riwayat QRIS**. Tindakan itu mencatat transaksi, mengurangi stok, menampilkan modal transaksi selesai, dan mengirim notifikasi lokal di Android.

Konfirmasi hanya tersedia untuk pemilik toko yang sedang masuk. Server memeriksa akses toko dan menghitung ulang nominal dari snapshot keranjang sebelum mengubah stok. Jika reservasi stok 15 menit sudah lewat dan stok berubah, sistem tetap mencatat bahwa kasir mengonfirmasi dana, lalu memberi status **Dana dikonfirmasi · stok perlu ditinjau**.

Batas 15 menit hanya melepas reservasi stok aplikasi. Aplikasi tidak dapat membatalkan QR yang sudah dibuat di perangkat, jadi QR mungkin masih bisa dipindai sesudah batas itu. Kasir perlu mengecek GoBiz sebelum membuat pembayaran pengganti. Tidak ada webhook atau konfirmasi otomatis di alur ini.

## Menyiapkan Supabase

Pastikan project ref yang dipakai adalah project Inventory V2. Sambungkan Supabase CLI bila belum:

```powershell
npx supabase login
npx supabase link --project-ref <PROJECT_REF_INVENTORY_V2>
npx supabase db push
npx supabase functions deploy create-qris-payment
```

Jika versi lama pernah men-deploy endpoint notifikasi Midtrans, ganti dengan endpoint nonaktif agar notifikasi lama tidak lagi mengubah transaksi:

```powershell
npx supabase functions deploy midtrans-qris-notification
```

Migration akan menyimpan payload QRIS ABElektronik yang disertakan pada project. Bucket Storage `inventory-assets` perlu tersedia dan public agar gambar referensi pengaturan dapat ditampilkan.

Untuk mengganti QR, buka **Pengaturan → Pengaturan QRIS** dan unggah gambar QRIS statis ABElektronik yang benar. Aplikasi membaca payload langsung dari gambar dan hanya menerima merchant yang cocok dengan data ABElektronik Majalengka pada project. Perubahan gambar dan payload merchant disimpan bersama.

Setelah deployment, buka aplikasi dengan akun pemilik toko dan lakukan transaksi uji bernilai kecil. Pastikan aplikasi pelanggan menampilkan ABElektronik dan nominal yang tepat, pembayaran masuk ke akun GoBiz yang dimaksud, kasir bisa mengonfirmasi pembayaran, stok dan Riwayat QRIS tercatat, serta notifikasi Android muncul. Uji penerimaan QR dengan bank/e-wallet sebelum memakai alur ini untuk transaksi pelanggan.

## Cara kasir memproses QRIS

1. Tambahkan barang ke keranjang, tekan **Proses**, lalu pilih **QRIS**.
2. Tunjukkan QR beserta nominal di layar ke pelanggan. Di Android, aplikasi meminta layar ke kecerahan maksimum dan mengembalikan tingkat sebelumnya saat layar QR ditutup.
3. Setelah pelanggan membayar, kasir membuka GoBiz dan mencocokkan transaksi masuk serta nominalnya.
4. Hanya setelah dana terlihat di GoBiz, tekan **Konfirmasi dibayar**. Sistem lalu mencatat pembayaran, stok, riwayat barang, dan notifikasi.

Jangan menekan konfirmasi hanya berdasarkan tampilan berhasil di ponsel pelanggan. Jika pembayaran masuk terlambat dan stok sudah berubah, hubungi admin untuk pemeriksaan stok.

## Biaya dan batas teknis

Alur ini menghindari biaya gateway Midtrans karena tidak menggunakan layanan Midtrans. Biaya/MDR QRIS dari acquirer atau penyelenggara yang menerima pembayaran tetap dapat berlaku sesuai ketentuan akun merchant. Format QRIS dinamis dan penerimaannya perlu diuji dengan akun GoBiz serta aplikasi bank/e-wallet yang akan dipakai; pembentukan QR lokal sendiri tidak menyediakan verifikasi settlement atau pembatalan dari penyelenggara.

Notifikasi yang disebut di sini adalah notifikasi lokal pada perangkat kasir ketika aplikasi mencatat konfirmasi. Notifikasi tersebut bukan bukti transfer dari GoBiz.
