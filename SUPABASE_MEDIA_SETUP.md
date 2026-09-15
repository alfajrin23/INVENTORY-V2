# Supabase Media Setup

Target project: `pwcvpafxrxywpcwxhrzi`.

Foto profil/branding tidak lagi disimpan hanya di `localStorage`, dan foto toko tidak lagi disimpan sebagai Base64 di row database. File gambar disimpan di Supabase Storage dan database hanya menyimpan public URL.

## Migration

Migration yang harus terpasang:

`supabase/migrations/20260915143000_app_media_and_branding.sql`

Migration tersebut membuat:

- bucket public `inventory-assets` untuk delivery gambar,
- batas file 1 MB,
- MIME type hanya JPG/PNG/WebP,
- tabel singleton `public.app_branding`,
- RLS read branding untuk user authenticated,
- update branding hanya untuk user dengan role `admin`,
- write foto toko hanya jika store tersebut dimiliki user login,
- policy Storage yang diperlukan untuk upload/upsert.

Bucket dibuat public hanya untuk **membaca file gambar melalui URL**. Upload/update/delete tetap dilindungi RLS dan membutuhkan session Supabase yang valid.

## Apply dengan Supabase CLI

```powershell
npx supabase login
npx supabase link --project-ref pwcvpafxrxywpcwxhrzi
npx supabase db push
```

Atau jalankan isi migration yang sama melalui SQL Editor project Supabase.

## Environment frontend

Production tetap membutuhkan:

```env
VITE_SUPABASE_URL=https://pwcvpafxrxywpcwxhrzi.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable-key-project>
```

Jangan memasukkan `service_role` atau secret key ke frontend/Vercel public environment.

## Perilaku setelah migration

- Foto profil yang diubah dari halaman Profil diupload ke `inventory-assets/branding/profile`, lalu URL disimpan di `app_branding`.
- Header aplikasi dan halaman Profil membaca URL global yang sama, sehingga foto tidak lagi bergantung pada browser/perangkat tertentu.
- Foto toko diupload ke `inventory-assets/stores/<store-id>/photo`.
- Row `stores.photo` hanya menyimpan URL Storage.
- RLS inventory lama tidak dibuka ke semua akun; data produk/history tetap mengikuti ownership store.
