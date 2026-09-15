import { registerPlugin, type PluginListenerHandle } from '@capacitor/core'

export type NativeAppInfo = {
  versionName: string
  versionCode: number
}

export type UpdateProgress = {
  percent: number
  downloadedBytes: number
  totalBytes: number
}

type InstallPermission = {
  granted: boolean
}

interface ABAppUpdatePlugin {
  getAppInfo(): Promise<NativeAppInfo>
  canInstallPackages(): Promise<InstallPermission>
  requestInstallPermission(): Promise<void>
  downloadAndInstall(options: { url: string }): Promise<void>
  exitApp(): Promise<void>
  addListener(eventName: 'updateProgress', listenerFunc: (progress: UpdateProgress) => void): Promise<PluginListenerHandle>
}

export const ABAppUpdate = registerPlugin<ABAppUpdatePlugin>('ABAppUpdate')
