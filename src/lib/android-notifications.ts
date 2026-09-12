import { LocalNotifications } from '@capacitor/local-notifications'
import type { Product } from '@/lib/types'

export const INVENTORY_NOTIFICATION_ID = 2201
export const INVENTORY_NOTIFICATION_CHANNEL = 'inventory_status'
export const INVENTORY_NOTIFICATION_ACTIONS = 'inventory_actions'

export function inventoryNotificationContent(storeName: string, products: Product[]) {
  const lowStock = products.filter(product => product.stok <= 5)
  const body = `${products.length} produk | ${lowStock.length} stok menipis. Ketuk Voice untuk transaksi.`
  return {
    title: `${storeName} - Inventory`,
    body,
    inboxList: lowStock.slice(0, 4).map(product => `${product.namaBarang}: ${product.stok} tersisa`),
  }
}

export async function registerInventoryNotification() {
  await LocalNotifications.createChannel({
    id: INVENTORY_NOTIFICATION_CHANNEL,
    name: 'Status Inventory',
    description: 'Ringkasan stok dan akses cepat Voice AI',
    importance: 2,
    visibility: 0,
  })
  await LocalNotifications.registerActionTypes({
    types: [{ id: INVENTORY_NOTIFICATION_ACTIONS, actions: [
      { id: 'voice', title: 'Voice AI' },
      { id: 'dashboard', title: 'Lihat stok' },
    ] }],
  })
}

export async function showInventoryNotification(storeName: string, products: Product[]) {
  const content = inventoryNotificationContent(storeName, products)
  await LocalNotifications.schedule({ notifications: [{
    id: INVENTORY_NOTIFICATION_ID,
    ...content,
    channelId: INVENTORY_NOTIFICATION_CHANNEL,
    actionTypeId: INVENTORY_NOTIFICATION_ACTIONS,
    ongoing: true,
    autoCancel: false,
    smallIcon: 'ic_stat_inventory',
    largeIcon: 'ic_inventory_gradient',
    iconColor: '#0D9488',
  }] })
}

export async function clearInventoryNotification() {
  await LocalNotifications.cancel({ notifications: [{ id: INVENTORY_NOTIFICATION_ID }] })
  await LocalNotifications.removeDeliveredNotificationsById({ ids: [INVENTORY_NOTIFICATION_ID] })
}
