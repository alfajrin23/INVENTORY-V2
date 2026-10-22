import { registerPlugin } from '@capacitor/core'

export const GOPAY_MERCHANT_PACKAGES = new Set(['com.gojek.gopaymerchant', 'com.gojek.resto'])

export type MerchantPaymentNotification = {
  fingerprint: string
  amount: number
  sourcePackage: string
  notificationAt: number
  paymentSuccess: boolean
}

type QrisNotificationPlugin = {
  checkAccess(): Promise<{ enabled: boolean }>
  openSettings(): Promise<void>
  getPendingNotifications(): Promise<{ notifications: MerchantPaymentNotification[] }>
  consumeNotification(options: { fingerprint: string }): Promise<void>
  addListener(eventName: 'paymentNotification', listener: (notification: MerchantPaymentNotification) => void): Promise<{ remove(): Promise<void> }>
}

export const QrisNotificationAccess = registerPlugin<QrisNotificationPlugin>('ABQrisNotification')

export function isValidMerchantPaymentNotification(notification: MerchantPaymentNotification) {
  return notification.paymentSuccess
    && GOPAY_MERCHANT_PACKAGES.has(notification.sourcePackage)
    && Number.isSafeInteger(notification.amount)
    && notification.amount > 0
    && Number.isSafeInteger(notification.notificationAt)
    && /^[0-9a-f]{64}$/.test(notification.fingerprint)
}
