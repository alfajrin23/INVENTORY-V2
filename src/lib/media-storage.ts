import { databaseError, requireSupabase } from '@/lib/supabase'

const MEDIA_BUCKET = 'inventory-assets'
const MAX_IMAGE_BYTES = 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

export function validateImageFile(file: File) {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error('Gunakan gambar JPG, PNG, atau WebP.')
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error('Gunakan gambar maksimal 1 MB.')
  }
}

async function uploadPublicImage(path: string, file: File) {
  validateImageFile(file)
  const client = requireSupabase()
  const { error } = await client.storage.from(MEDIA_BUCKET).upload(path, file, {
    cacheControl: '3600',
    contentType: file.type,
    upsert: true,
  })
  if (error) throw databaseError(error)

  const { data } = client.storage.from(MEDIA_BUCKET).getPublicUrl(path)
  return `${data.publicUrl}?v=${Date.now()}`
}

export async function uploadStorePhoto(storeId: string, file: File) {
  return uploadPublicImage(`stores/${storeId}/photo`, file)
}

export async function fetchBrandingPhoto() {
  const { data, error } = await requireSupabase()
    .from('app_branding')
    .select('profile_photo_url')
    .eq('id', 'default')
    .single()

  if (error) throw databaseError(error)
  return typeof data.profile_photo_url === 'string' ? data.profile_photo_url : ''
}

export async function uploadBrandingPhoto(file: File) {
  const client = requireSupabase()
  const publicUrl = await uploadPublicImage('branding/profile', file)
  const { error } = await client
    .from('app_branding')
    .update({ profile_photo_url: publicUrl })
    .eq('id', 'default')
    .select('id')
    .single()

  if (error) throw databaseError(error)
  return publicUrl
}
