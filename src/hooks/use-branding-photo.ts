import { useEffect, useState } from 'react'

import { fetchBrandingPhoto, uploadBrandingPhoto } from '@/lib/media-storage'

const BRANDING_EVENT = 'ab:branding-photo-changed'
let cachedPhoto: string | null = null
let pendingFetch: Promise<string> | null = null

async function loadBrandingPhoto() {
  if (cachedPhoto !== null) return cachedPhoto
  if (!pendingFetch) {
    pendingFetch = fetchBrandingPhoto()
      .then(value => {
        cachedPhoto = value
        return value
      })
      .finally(() => { pendingFetch = null })
  }
  return pendingFetch
}

export function useBrandingPhoto() {
  const [photo, setPhoto] = useState(cachedPhoto ?? '')

  useEffect(() => {
    let active = true
    void loadBrandingPhoto().then(value => {
      if (active) setPhoto(value)
    }).catch(() => undefined)

    const onBrandingChanged = (event: Event) => {
      const nextPhoto = (event as CustomEvent<string>).detail ?? ''
      cachedPhoto = nextPhoto
      setPhoto(nextPhoto)
    }
    window.addEventListener(BRANDING_EVENT, onBrandingChanged)
    return () => {
      active = false
      window.removeEventListener(BRANDING_EVENT, onBrandingChanged)
    }
  }, [])

  const updatePhoto = async (file: File) => {
    const nextPhoto = await uploadBrandingPhoto(file)
    cachedPhoto = nextPhoto
    window.dispatchEvent(new CustomEvent<string>(BRANDING_EVENT, { detail: nextPhoto }))
    return nextPhoto
  }

  const refreshPhoto = async () => {
    cachedPhoto = null
    const nextPhoto = await loadBrandingPhoto()
    window.dispatchEvent(new CustomEvent<string>(BRANDING_EVENT, { detail: nextPhoto }))
    return nextPhoto
  }

  return { photo, updatePhoto, refreshPhoto }
}
