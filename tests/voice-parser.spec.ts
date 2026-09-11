import { expect, test } from '@playwright/test'

import type { Product } from '../src/lib/types'
import { parseVoiceCommand, resolveProducts } from '../src/lib/voice'

const products: Product[] = [
  { id: '1', namaBarang: 'Lampu Provi', brand: 'Provi', harga: 25000, stok: 15, barcode: '001', storeId: 'store', createdAt: new Date().toISOString() },
  { id: '2', namaBarang: 'Lampu Panasonic', brand: 'Panasonic', harga: 35000, stok: 9, barcode: '002', storeId: 'store', createdAt: new Date().toISOString() },
  { id: '3', namaBarang: 'Kabel Eterna', brand: 'Eterna', harga: 18000, stok: 30, barcode: '003', storeId: 'store', createdAt: new Date().toISOString() },
]

test.describe('Voice parser Bahasa Indonesia', () => {
  test('barang masuk 10 lampu panasonic', () => {
    expect(parseVoiceCommand('barang masuk 10 lampu panasonic')).toMatchObject({
      intent: 'TRANSACTION_IN', quantity: 10, productQuery: 'lampu panasonic',
    })
  })

  test('jual dua lampu provi', () => {
    expect(parseVoiceCommand('jual dua lampu provi')).toMatchObject({
      intent: 'TRANSACTION_OUT', quantity: 2, productQuery: 'lampu provi',
    })
  })

  test('transaksi 3 lampu panasonic berarti keluar', () => {
    expect(parseVoiceCommand('transaksi 3 lampu panasonic')).toMatchObject({
      intent: 'TRANSACTION_OUT', quantity: 3, productQuery: 'lampu panasonic',
    })
  })

  test('restock lima kabel eterna', () => {
    expect(parseVoiceCommand('restock lima kabel eterna')).toMatchObject({
      intent: 'TRANSACTION_IN', quantity: 5, productQuery: 'kabel eterna',
    })
  })

  test('exact product resolution', () => {
    const result = resolveProducts(products, 'lampu panasonic')
    expect(result[0].product.namaBarang).toBe('Lampu Panasonic')
    expect(result[0].exact).toBe(true)
  })

  test('ambiguous product does not become exact', () => {
    const result = resolveProducts(products, 'lampu philips')
    expect(result.length).toBeGreaterThanOrEqual(2)
    expect(result[0].exact).toBe(false)
  })

  test('product correction changes candidate query', () => {
    expect(parseVoiceCommand('bukan provi maksud saya panasonic')).toMatchObject({
      intent: 'PRODUCT_CORRECTION', productQuery: 'panasonic',
    })
  })

  test('qty correction', () => {
    expect(parseVoiceCommand('qty tiga')).toMatchObject({ intent: 'PRODUCT_CORRECTION', quantity: 3 })
  })

  test('cancel and retry', () => {
    expect(parseVoiceCommand('batal').intent).toBe('CANCEL')
    expect(parseVoiceCommand('ulangi').intent).toBe('RETRY')
  })

  test('create product draft parses known fields', () => {
    expect(parseVoiceCommand('Tambah barang baru lampu LED Panasonic stok 20 harga 35000')).toMatchObject({
      intent: 'CREATE_PRODUCT', productQuery: 'lampu led panasonic', stock: 20, price: 35000,
    })
  })
})
