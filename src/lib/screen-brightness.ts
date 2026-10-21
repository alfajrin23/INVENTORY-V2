import { Capacitor, registerPlugin } from '@capacitor/core'

type ScreenBrightnessPlugin = {
  maximize(): Promise<void>
  restore(): Promise<void>
}

const screenBrightness = registerPlugin<ScreenBrightnessPlugin>('ABScreenBrightness')

export function maximizeQrBrightness() {
  if (!Capacitor.isNativePlatform()) return Promise.resolve()
  return screenBrightness.maximize()
}

export function restoreQrBrightness() {
  if (!Capacitor.isNativePlatform()) return Promise.resolve()
  return screenBrightness.restore()
}
