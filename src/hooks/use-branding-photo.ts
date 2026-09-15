import { useEffect, useState } from 'react'

import { fetchBrandingPhoto, uploadBrandingPhoto } from '@/lib/media-storage'

const BRANDING_EVENT = 'ab:branding-photo-changed'
let cachedPhoto: string | null = null
let pendingFetch: Promise<string> | null = null

async function loadBrandingPhoto(force = false) {
  if (!force && cachedPhoto !== null) return cachedPhoto
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
    const syncFromServer = (force = false) => {
      void loadBrandingPhoto(force).then(value => {
        if (active) setPhoto(value)
      }).catch(() => undefined)
    }

    syncFromServer()

    const onBrandingChanged = (event: Event) => {
      const nextPhoto = (event as CustomEvent<string>).detail ?? ''
      cachedPhoto = nextPhoto
      setPhoto(nextPhoto)
    }
    const onFocus = () => syncFromServer(true)
    const onVisibilityChange = () => {
      if (!document.hidden) syncFromServer(true)
    }

    window.addEventListener(BRANDING_EVENT, onBrandingChanged)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      active = false
      window.removeEventListener(BRANDING_EVENT, onBrandingChanged)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])

  const updatePhoto = async (file: File) => {
    const nextPhoto = await uploadBrandingPhoto(file)
    cachedPhoto = nextPhoto
    window.dispatchEvent(new CustomEvent<string>(BRANDING_EVENT, { detail: nextPhoto }))
    return nextPhoto
  }

  const refreshPhoto = async () => {
    const nextPhoto = await loadBrandingPhoto(true)
    window.dispatchEvent(new CustomEvent<string>(BRANDING_EVENT, { detail: nextPhoto }))
    return nextPhoto
  }

  return { photo, updatePhoto, refreshPhoto }
}
