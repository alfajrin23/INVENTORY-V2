import { LocalNotifications } from '@capacitor/local-notifications'

import type { Product } from '@/lib/types'

export const INVENTORY_NOTIFICATION_ID = 2201
export const INVENTORY_NOTIFICATION_CHANNEL = 'inventory_status_v2'
export const INVENTORY_NOTIFICATION_ACTIONS = 'inventory_actions'
export const SHOPPING_NOTIFICATION_ID = 2202
export const SHOPPING_NOTIFICATION_CHANNEL = 'shopping_mode_v1'
export const SHOPPING_NOTIFICATION_ACTIONS = 'shopping_actions'

export type ShoppingNotificationItem = {
  name: string
  stock: number
  suggestedQty: number
}

export function inventoryNotificationContent(storeName: string, products: Product[]) {
  const lowStock = products.filter(product => product.stok <= 5)
  const body = products.length
    ? `${products.length} produk | ${lowStock.length} stok menipis. Ketuk Voice untuk transaksi.`
    : 'Notifikasi aktif. Ketuk Voice AI untuk membuka transaksi.'
  return {
    title: `${storeName} - Inventory`,
    body,
    inboxList: lowStock.length ? lowStock.slice(0, 4).map(product => `${product.namaBarang}: ${product.stok} tersisa`) : undefined,
  }
}

export function shoppingNotificationContent(items: ShoppingNotificationItem[]) {
  const visible = items.slice(0, 3).map(item => `${item.name} · beli ${item.suggestedQty}`)
  if (items.length > 3) visible.push(`+${items.length - 3} lainnya`)
  return {
    title: '🛒 Mode Belanja',
    body: `${items.length} barang belum dibeli`,
    inboxList: visible,
  }
}

export async function registerInventoryNotification() {
  await LocalNotifications.createChannel({
    id: INVENTORY_NOTIFICATION_CHANNEL,
    name: 'Status Inventory',
    description: 'Ringkasan stok dan akses cepat Voice AI',
    importance: 3,
    visibility: 0,
  })
  await LocalNotifications.registerActionTypes({
    types: [{ id: INVENTORY_NOTIFICATION_ACTIONS, actions: [
      { id: 'voice', title: 'Voice AI' },
      { id: 'dashboard', title: 'Lihat stok' },
    ] }],
  })
}

export async function registerShoppingNotification() {
  await LocalNotifications.createChannel({
    id: SHOPPING_NOTIFICATION_CHANNEL,
    name: 'Mode Belanja',
    description: 'Daftar restock yang sedang dibeli',
    importance: 3,
    visibility: 0,
  })
  await LocalNotifications.registerActionTypes({
    types: [{ id: SHOPPING_NOTIFICATION_ACTIONS, actions: [
      { id: 'open-shopping', title: 'Buka Belanja' },
    ] }],
  })
}

/**
 * Menyiapkan notifikasi tanpa mengganggu user saat aplikasi baru dibuka.
 * Permission prompt hanya boleh muncul setelah aksi eksplisit user (tombol lonceng).
 */
export async function prepareInventoryNotification(requestPermission = false) {
  let permission = await LocalNotifications.checkPermissions()

  if (permission.display !== 'granted') {
    if (!requestPermission) return false
    permission = await LocalNotifications.requestPermissions()
  }

  if (permission.display !== 'granted') {
    throw new Error('Izin notifikasi belum aktif. Izinkan notifikasi aplikasi di Pengaturan Android, lalu ketuk lonceng.')
  }

  const enabled = await LocalNotifications.areEnabled()
  if (!enabled.value) {
    if (!requestPermission) return false
    throw new Error('Notifikasi aplikasi dimatikan di Pengaturan Android. Aktifkan lalu ketuk lonceng.')
  }

  await registerInventoryNotification()
  const channels = await LocalNotifications.listChannels().catch(() => ({ channels: [] }))
  if (channels.channels.some(channel => channel.id === INVENTORY_NOTIFICATION_CHANNEL && channel.importance === 0)) {
    if (!requestPermission) return false
    throw new Error('Channel Status Inventory dimatikan di Pengaturan Android. Aktifkan lalu ketuk lonceng.')
  }

  return true
}

export async function showInventoryNotification(storeName: string, products: Product[]) {
  const permission = await LocalNotifications.checkPermissions()
  if (permission.display !== 'granted') return false

  const enabled = await LocalNotifications.areEnabled()
  if (!enabled.value) return false

  const content = inventoryNotificationContent(storeName, products)
  await LocalNotifications.schedule({ notifications: [{
    id: INVENTORY_NOTIFICATION_ID,
    ...content,
    channelId: INVENTORY_NOTIFICATION_CHANNEL,
    actionTypeId: INVENTORY_NOTIFICATION_ACTIONS,
    isExactNotification: false,
    isExactMandatory: false,
    ongoing: true,
    autoCancel: false,
    smallIcon: 'ic_stat_inventory',
    largeIcon: 'ic_inventory_gradient',
    iconColor: '#0D9488',
  }] })
  const delivered = await LocalNotifications.getDeliveredNotifications()
  if (!delivered.notifications.some(notification => notification.id === INVENTORY_NOTIFICATION_ID)) {
    throw new Error('Notifikasi belum muncul di panel Android. Periksa izin aplikasi dan channel Status Inventory.')
  }

  return true
}

export async function showShoppingNotification(items: ShoppingNotificationItem[]) {
  if (!items.length) {
    await clearShoppingNotification()
    return false
  }

  const permission = await LocalNotifications.checkPermissions()
  if (permission.display !== 'granted') return false
  const enabled = await LocalNotifications.areEnabled()
  if (!enabled.value) return false

  await registerShoppingNotification()
  const content = shoppingNotificationContent(items)
  await LocalNotifications.schedule({ notifications: [{
    id: SHOPPING_NOTIFICATION_ID,
    ...content,
    channelId: SHOPPING_NOTIFICATION_CHANNEL,
    actionTypeId: SHOPPING_NOTIFICATION_ACTIONS,
    isExactNotification: false,
    isExactMandatory: false,
    ongoing: true,
    autoCancel: false,
    smallIcon: 'ic_stat_inventory',
    largeIcon: 'ic_inventory_gradient',
    iconColor: '#0D9488',
    extra: { destination: 'shopping' },
  }] })
  return true
}

export async function clearInventoryNotification() {
  await LocalNotifications.cancel({ notifications: [{ id: INVENTORY_NOTIFICATION_ID }] })
  await LocalNotifications.removeDeliveredNotificationsById({ ids: [INVENTORY_NOTIFICATION_ID] })
}

export async function clearShoppingNotification() {
  await LocalNotifications.cancel({ notifications: [{ id: SHOPPING_NOTIFICATION_ID }] })
  await LocalNotifications.removeDeliveredNotificationsById({ ids: [SHOPPING_NOTIFICATION_ID] })
}
