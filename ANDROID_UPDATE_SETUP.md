# Android In-App Update Setup

Aplikasi mengecek GitHub Releases `alfajrin23/INVENTORY-V2`, menampilkan popup jika ada versi APK yang lebih baru, mengunduh APK dari dalam aplikasi, lalu membuka installer Android.

## Syarat utama: signing certificate harus tetap sama

Android hanya mengizinkan APK baru menggantikan aplikasi lama jika:

1. `applicationId` tetap `com.abelektronik.inventory`.
2. `versionCode` APK baru lebih tinggi.
3. APK baru ditandatangani dengan certificate/keystore yang sama dengan APK yang sudah terpasang.

Project sebelumnya membuat `assembleDebug`. Karena itu, bila APK yang sudah dipakai user dibuat dari PC developer yang sama, cara tanpa uninstall adalah memakai **keystore yang menandatangani APK lama tersebut** sebagai signing key permanen untuk update selanjutnya.

> Jangan membuat keystore baru jika targetnya adalah update tanpa uninstall untuk instalasi yang sudah ada. Keystore baru dianggap signature berbeda oleh Android.

Untuk memastikan certificate APK lama, jalankan `apksigner verify --print-certs nama-apk-lama.apk`. Cocokkan dengan certificate keystore yang akan dipakai.

## GitHub Actions secrets

Tambahkan repository secrets berikut:

- `AB_RELEASE_KEYSTORE_BASE64`: isi file keystore dalam Base64.
- `AB_RELEASE_STORE_PASSWORD`: password keystore.
- `AB_RELEASE_KEY_ALIAS`: alias key.
- `AB_RELEASE_KEY_PASSWORD`: password key.

Jika instalasi lama memang menggunakan debug keystore standar dari PC developer, file biasanya ada di `%USERPROFILE%\.android\debug.keystore`. Pastikan certificate-nya benar terlebih dahulu sebelum menjadikannya key permanen.

PowerShell untuk membuat isi Base64:

```powershell
$path = "$env:USERPROFILE\.android\debug.keystore"
[Convert]::ToBase64String([IO.File]::ReadAllBytes($path)) | Set-Content .\keystore-base64.txt
```

Salin isi `keystore-base64.txt` ke secret `AB_RELEASE_KEYSTORE_BASE64`. Jangan commit file keystore atau file Base64 ke repository.

## Membuat release update

Setelah perubahan sudah ada di `main`, buat tag versi baru:

```powershell
git checkout main
git pull
git tag v1.2.0
git push origin v1.2.0
```

Workflow `.github/workflows/android-release.yml` akan:

- membangun web + Capacitor,
- membuat APK release yang signed,
- memberi `versionCode` yang terus naik,
- membuat SHA-256,
- membuat GitHub Release,
- mengunggah `ABElektronik-Inventory.apk`.

Aplikasi Android mengecek release tersebut otomatis. Release beta seperti `v1.2.1-beta.1` juga didukung.

## Instalasi pertama yang membawa updater

APK yang sekarang terpasang sebelum fitur ini belum mempunyai kode updater, sehingga **satu kali** versi yang berisi fitur updater tetap harus dipasang ke perangkat. Jika signing certificate-nya sama, APK bootstrap tersebut dapat dipasang sebagai update tanpa uninstall.

Setelah versi updater sudah terpasang, release berikutnya akan muncul sebagai popup di aplikasi dan user tidak perlu mencari file APK secara manual.

## Izin Android

Untuk distribusi APK di luar Play Store, Android 8+ meminta user mengaktifkan `Izinkan dari sumber ini` untuk ABElektronik Inventory. Aplikasi membuka halaman pengaturan tersebut otomatis ketika diperlukan. Setelah izin diberikan, download dilanjutkan dari aplikasi.

## Build update manual di Windows

Selain GitHub Actions, tersedia:

```powershell
$env:AB_RELEASE_STORE_FILE="C:\path\keystore.jks"
$env:AB_RELEASE_STORE_PASSWORD="..."
$env:AB_RELEASE_KEY_ALIAS="..."
$env:AB_RELEASE_KEY_PASSWORD="..."
$env:AB_VERSION_CODE="1001"
$env:AB_VERSION_NAME="1.2.0"
npm run android:update-apk
```

Hasilnya berada di `release/ABElektronik-Inventory.apk` dan file SHA-256 di folder yang sama.
