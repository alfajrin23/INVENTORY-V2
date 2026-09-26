import { Capacitor, registerPlugin } from '@capacitor/core'

import type { CartItem, Product, StoreRecord, TransactionCategory } from '@/lib/types'

export type ThermalPrinterDevice = {
  name: string
  address: string
  bonded?: boolean
}

export type ThermalPrinterStatus = {
  connected: boolean
  name?: string
  address?: string
}

export type ThermalPrinterPreferences = {
  autoReconnect: boolean
  printTransactionBarcode: boolean
  printTransactionQr: boolean
  showPriceOnProductBarcode: boolean
}

type PermissionResult = { granted: boolean }
type BluetoothStateResult = { supported: boolean; enabled: boolean; state: 'unsupported' | 'off' | 'on' }
type DevicesResult = { devices: ThermalPrinterDevice[] }
type SavedPrinterResult = { printer: ThermalPrinterDevice | null }

type ReceiptLine = {
  name: string
  brand: string
  quantity: number
  price: number
  total: number
}

type ReceiptPayload = {
  storeName: string
  address: string
  date: string
  transactionCode: string
  category: TransactionCategory
  total: number
  items: ReceiptLine[]
  printBarcode: boolean
  printQr: boolean
}

type ProductBarcodePayload = {
  name: string
  brand: string
  barcode: string
  price?: number
  symbology: BarcodeSymbology
  copies: number
}

interface ABThermalPrinterPlugin {
  isBluetoothSupported(): Promise<{ supported: boolean }>
  getBluetoothState(): Promise<BluetoothStateResult>
  requestBluetoothPermissions(): Promise<PermissionResult>
  getPairedPrinters(): Promise<DevicesResult>
  discoverPrinters(): Promise<DevicesResult>
  connect(options: { address: string }): Promise<ThermalPrinterStatus>
  disconnect(): Promise<void>
  getConnectionStatus(): Promise<ThermalPrinterStatus>
  getSavedPrinter(): Promise<SavedPrinterResult>
  saveDefaultPrinter(options: ThermalPrinterDevice): Promise<void>
  forgetPrinter(): Promise<void>
  testPrint(): Promise<void>
  printReceipt(options: { receipt: ReceiptPayload }): Promise<void>
  printBarcode(options: { barcode: ProductBarcodePayload }): Promise<void>
  printQr(options: { value: string }): Promise<void>
}

export const ABThermalPrinter = registerPlugin<ABThermalPrinterPlugin>('ABThermalPrinter')

const PREFS_KEY = 'ab:thermal-printer-preferences:v1'
const WEB_SAVED_PRINTER_KEY = 'ab:thermal-printer-web-placeholder:v1'

const defaultPreferences: ThermalPrinterPreferences = {
  autoReconnect: true,
  printTransactionBarcode: true,
  printTransactionQr: true,
  showPriceOnProductBarcode: true,
}

export class ThermalPrinterError extends Error {
  code: 'UNSUPPORTED' | 'BLUETOOTH_OFF' | 'NOT_CONFIGURED' | 'DISCONNECTED' | 'CONNECTION_FAILED' | 'PRINT_FAILED'

  constructor(code: ThermalPrinterError['code'], message: string) {
    super(message)
    this.name = 'ThermalPrinterError'
    this.code = code
  }
}

export function isNativeAndroid() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

export function getThermalPrinterPreferences(): ThermalPrinterPreferences {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return defaultPreferences
    return { ...defaultPreferences, ...(JSON.parse(raw) as Partial<ThermalPrinterPreferences>) }
  } catch {
    return defaultPreferences
  }
}

export function saveThermalPrinterPreferences(next: ThermalPrinterPreferences) {
  localStorage.setItem(PREFS_KEY, JSON.stringify(next))
}

export async function getSavedThermalPrinter() {
  if (!isNativeAndroid()) {
    try {
      return JSON.parse(localStorage.getItem(WEB_SAVED_PRINTER_KEY) ?? 'null') as ThermalPrinterDevice | null
    } catch {
      return null
    }
  }
  const result = await ABThermalPrinter.getSavedPrinter()
  return result.printer
}

export async function saveDefaultThermalPrinter(device: ThermalPrinterDevice) {
  if (!isNativeAndroid()) {
    localStorage.setItem(WEB_SAVED_PRINTER_KEY, JSON.stringify(device))
    return
  }
  await ABThermalPrinter.saveDefaultPrinter(device)
}

export async function forgetThermalPrinter() {
  if (!isNativeAndroid()) {
    localStorage.removeItem(WEB_SAVED_PRINTER_KEY)
    return
  }
  await ABThermalPrinter.forgetPrinter()
}

export async function ensureThermalPrinterReady() {
  if (!isNativeAndroid()) {
    throw new ThermalPrinterError('UNSUPPORTED', 'Direct print Bluetooth hanya tersedia di APK Android.')
  }

  const bluetooth = await ABThermalPrinter.getBluetoothState()
  if (!bluetooth.supported) throw new ThermalPrinterError('UNSUPPORTED', 'Bluetooth tidak tersedia di perangkat ini.')
  if (!bluetooth.enabled) throw new ThermalPrinterError('BLUETOOTH_OFF', 'Bluetooth HP belum aktif.')

  const saved = await getSavedThermalPrinter()
  if (!saved) throw new ThermalPrinterError('NOT_CONFIGURED', 'Hubungkan printer thermal terlebih dahulu.')

  const status = await ABThermalPrinter.getConnectionStatus()
  if (status.connected && status.address === saved.address) return status

  const preferences = getThermalPrinterPreferences()
  if (!preferences.autoReconnect) {
    throw new ThermalPrinterError('DISCONNECTED', 'Printer sedang tidak terhubung.')
  }

  try {
    return await ABThermalPrinter.connect({ address: saved.address })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new ThermalPrinterError('CONNECTION_FAILED', message || 'Printer tidak ditemukan. Pastikan printer menyala dan berada di dekat HP.')
  }
}

function receiptTransactionCode() {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `TRX-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
}

export async function printReceiptDirect(
  store: StoreRecord | null,
  items: CartItem[],
  category: TransactionCategory,
  transactionCode = receiptTransactionCode(),
) {
  await ensureThermalPrinterReady()
  const preferences = getThermalPrinterPreferences()
  const total = items.reduce((sum, item) => sum + item.product.harga * item.quantity, 0)

  try {
    await ABThermalPrinter.printReceipt({
      receipt: {
        storeName: store?.name?.trim() || 'ABELEKTRONIK',
        address: store?.address?.trim() || '',
        date: new Intl.DateTimeFormat('id-ID', { dateStyle: 'short', timeStyle: 'short' }).format(new Date()),
        transactionCode,
        category,
        total,
        items: items.map(item => ({
          name: item.product.namaBarang,
          brand: item.product.brand?.trim() ?? '',
          quantity: item.quantity,
          price: item.product.harga,
          total: item.product.harga * item.quantity,
        })),
        printBarcode: preferences.printTransactionBarcode,
        printQr: preferences.printTransactionQr,
      },
    })
    return { transactionCode }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new ThermalPrinterError('PRINT_FAILED', message || 'Resi gagal dicetak.')
  }
}

export type BarcodeSymbology = 'EAN13' | 'EAN8' | 'UPCA' | 'CODE128'

function validMod10(value: string) {
  if (!/^\d+$/.test(value) || value.length < 2) return false
  const body = value.slice(0, -1)
  const check = Number(value.at(-1))
  let sum = 0
  for (let index = body.length - 1, position = 0; index >= 0; index -= 1, position += 1) {
    sum += Number(body[index]) * (position % 2 === 0 ? 3 : 1)
  }
  return (10 - (sum % 10)) % 10 === check
}

export function detectBarcodeSymbology(value: string): BarcodeSymbology {
  if (/^\d{13}$/.test(value) && validMod10(value)) return 'EAN13'
  if (/^\d{8}$/.test(value) && validMod10(value)) return 'EAN8'
  if (/^\d{12}$/.test(value) && validMod10(value)) return 'UPCA'
  return 'CODE128'
}

export function isValidCustomBarcode(value: string) {
  return /^[A-Za-z0-9]{1,32}$/.test(value)
}

export function inferBarcodeMode(value: string): 'factory' | 'custom' {
  return detectBarcodeSymbology(value) === 'CODE128' ? 'custom' : 'factory'
}

export async function printProductBarcodes(products: Product[], copies = 1) {
  await ensureThermalPrinterReady()
  const preferences = getThermalPrinterPreferences()
  const safeCopies = Math.max(1, Math.min(99, Math.trunc(copies || 1)))

  for (const product of products) {
    await ABThermalPrinter.printBarcode({
      barcode: {
        name: product.namaBarang,
        brand: product.brand,
        barcode: product.barcode,
        price: preferences.showPriceOnProductBarcode ? product.harga : undefined,
        symbology: detectBarcodeSymbology(product.barcode),
        copies: safeCopies,
      },
    })
  }
}

export type ThermalReceiptPrintRequest = {
  store: StoreRecord | null
  items: CartItem[]
  category: TransactionCategory
}

export const THERMAL_RECEIPT_EVENT = 'ab:thermal-receipt-print'

export function requestThermalReceiptPrint(detail: ThermalReceiptPrintRequest) {
  window.dispatchEvent(new CustomEvent<ThermalReceiptPrintRequest>(THERMAL_RECEIPT_EVENT, { detail }))
}
