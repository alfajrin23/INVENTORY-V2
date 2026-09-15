import type { Product } from '@/lib/types'

export type ProductScanConfidence = 'high' | 'medium' | 'low'
export type ProductScanSource = 'store' | 'barcode-reference' | 'scan-text' | 'brand-reference' | 'barcode-only'

export type ProductScanSuggestion = {
  barcode: string
  namaBarang: string
  brand: string
  harga: number | null
  stok: number | null
  source: ProductScanSource
  confidence: ProductScanConfidence
  reason: string
}

type ProductReference = {
  barcode?: string
  namaBarang: string
  brand: string
  harga?: number
  aliases?: string[]
}

type BrandProfile = {
  brand: string
  aliases: string[]
  defaultName: string
}

const upperCaseWords = /^(usb|tws|led|hdmi|mcb|rca|tv|ac|dc|jbl|acr|cctv|stb)$/i

const brandProfiles: BrandProfile[] = [
  { brand: 'Philips', aliases: ['philips', 'phillips'], defaultName: 'Lampu LED' },
  { brand: 'Jepi', aliases: ['jepi', 'jepie', 'jepy'], defaultName: 'Lampu LED' },
  { brand: 'Panasonic', aliases: ['panasonic'], defaultName: 'Lampu LED' },
  { brand: 'ACR', aliases: ['acr', 'a c r'], defaultName: 'Speaker Aktif' },
  { brand: 'JBL', aliases: ['jbl'], defaultName: 'Speaker Bluetooth' },
  { brand: 'Anker', aliases: ['anker'], defaultName: 'Charger USB-C' },
  { brand: 'Baseus', aliases: ['baseus'], defaultName: 'Powerbank' },
  { brand: 'Vention', aliases: ['vention'], defaultName: 'Kabel HDMI' },
  { brand: 'Eterna', aliases: ['eterna'], defaultName: 'Kabel Listrik' },
  { brand: 'Krisbow', aliases: ['krisbow'], defaultName: 'Stop Kontak' },
  { brand: 'Logitech', aliases: ['logitech'], defaultName: 'Mouse Wireless' },
  { brand: 'Keychron', aliases: ['keychron'], defaultName: 'Keyboard Mechanical' },
  { brand: 'Soundcore', aliases: ['soundcore'], defaultName: 'Earphone TWS' },
  { brand: 'Hannochs', aliases: ['hannochs', 'hanocs'], defaultName: 'Lampu LED' },
  { brand: 'Miyako', aliases: ['miyako'], defaultName: 'Peralatan Elektronik' },
  { brand: 'Sharp', aliases: ['sharp'], defaultName: 'Peralatan Elektronik' },
  { brand: 'Samsung', aliases: ['samsung'], defaultName: 'Peralatan Elektronik' },
]

const productCategories = [
  { name: 'Lampu LED', keywords: ['lampu', 'bohlam', 'bulb', 'led', 'downlight', 'neon', 'emergency'] },
  { name: 'Speaker Bluetooth', keywords: ['speaker', 'audio', 'subwoofer', 'woofer', 'aktif'] },
  { name: 'Charger USB-C', keywords: ['charger', 'cas', 'adapter', 'adaptor', 'kepala charger'] },
  { name: 'Kabel HDMI', keywords: ['hdmi'] },
  { name: 'Kabel USB', keywords: ['kabel usb', 'type c', 'usb c', 'micro usb', 'lightning'] },
  { name: 'Kabel Listrik', keywords: ['kabel listrik', 'nyy', 'nya', 'eterna'] },
  { name: 'Stop Kontak', keywords: ['stop kontak', 'terminal', 'colokan'] },
  { name: 'Powerbank', keywords: ['powerbank', 'power bank'] },
  { name: 'Earphone TWS', keywords: ['earphone', 'headset', 'tws', 'earbud'] },
  { name: 'Mouse Wireless', keywords: ['mouse'] },
  { name: 'Keyboard Mechanical', keywords: ['keyboard'] },
]

const barcodeReferences: ProductReference[] = [
  { barcode: '8991001000011', namaBarang: 'Charger USB-C 33W', brand: 'Anker', harga: 185000 },
  { barcode: '8991001000028', namaBarang: 'Kabel HDMI 2 Meter', brand: 'Vention', harga: 72000 },
  { barcode: '8991001000035', namaBarang: 'Speaker Bluetooth Mini', brand: 'JBL', harga: 325000 },
  { barcode: '8991001000042', namaBarang: 'Powerbank 20000 mAh', brand: 'Baseus', harga: 298000 },
  { barcode: '8991001000059', namaBarang: 'Earphone TWS Air Lite', brand: 'Soundcore', harga: 245000 },
  { barcode: '8991001000066', namaBarang: 'Stop Kontak 6 Lubang', brand: 'Krisbow', harga: 118000 },
  { barcode: '8991001000073', namaBarang: 'Mouse Wireless Silent', brand: 'Logitech', harga: 159000 },
  { barcode: '8991001000080', namaBarang: 'Keyboard Mechanical TKL', brand: 'Keychron', harga: 785000 },
]

const fieldTokens = new Set([
  'barcode', 'bar-code', 'kode', 'sku', 'ean', 'upc', 'nama', 'name', 'produk', 'product', 'item', 'barang',
  'brand', 'merek', 'merk', 'harga', 'price', 'stok', 'stock', 'qty', 'jumlah',
])

const referenceNames = productCategories.map((item) => item.name)
const referenceBrands = brandProfiles.map((item) => item.brand)

export const productReferenceNames = Array.from(new Set([
  ...barcodeReferences.map((item) => item.namaBarang),
  ...referenceNames,
]))

export const productReferenceBrands = referenceBrands

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('id-ID')
    .replace(/[_:;=,|]+/g, ' ')
    .replace(/\s+/g, ' ')
}

export function normalizeBarcodeValue(value: string) {
  return value.trim().replace(/\s+/g, '')
}

export function isSafeCustomBarcodeValue(value: string) {
  return /^[A-Za-z0-9]{1,32}$/.test(normalizeBarcodeValue(value))
}

function titleCase(text: string) {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => upperCaseWords.test(word) || /^\d+[a-z]+$/i.test(word) ? word.toLocaleUpperCase('id-ID') : word.charAt(0).toLocaleUpperCase('id-ID') + word.slice(1).toLocaleLowerCase('id-ID'))
    .join(' ')
}

function readJson(raw: string) {
  try {
    const value = JSON.parse(raw) as Record<string, unknown>
    return typeof value === 'object' && value ? value : null
  } catch {
    return null
  }
}

function pickField(source: Record<string, unknown> | null, keys: string[]) {
  if (!source) return ''
  for (const [key, value] of Object.entries(source)) {
    if (keys.includes(normalizeText(key).replace(/\s+/g, '_')) && value !== null && value !== undefined) {
      return String(value).trim()
    }
  }
  return ''
}

function paramsFromRaw(raw: string) {
  try {
    return new URL(raw).searchParams
  } catch {
    if (!/[=&]/.test(raw)) return null
    return new URLSearchParams(raw.replace(/[;|]/g, '&'))
  }
}

function pickParam(params: URLSearchParams | null, keys: string[]) {
  if (!params) return ''
  for (const key of keys) {
    const value = params.get(key)
    if (value?.trim()) return value.trim()
  }
  return ''
}

function scanTokens(raw: string) {
  return raw
    .replace(/([=:;|,])/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

function readTokenField(raw: string, labels: string[], compact = false) {
  const tokens = scanTokens(raw)
  const normalized = tokens.map((token) => normalizeText(token).replace(/\s+/g, '-'))
  const index = normalized.findIndex((token) => labels.includes(token))
  if (index < 0) return ''

  let start = index + 1
  while (['barang', 'produk', 'nya'].includes(normalized[start] ?? '')) start++

  let end = start
  while (end < tokens.length && !fieldTokens.has(normalized[end])) end++

  return tokens.slice(start, end).join(compact ? '' : ' ').trim()
}

function toNumber(value: string) {
  const clean = value.replace(/\D/g, '')
  if (!clean) return null
  const number = Number(clean)
  return Number.isSafeInteger(number) ? number : null
}

function fieldsFromScan(raw: string) {
  const json = readJson(raw)
  const params = paramsFromRaw(raw)
  const barcode =
    pickField(json, ['barcode', 'kode', 'sku', 'ean', 'upc']) ||
    pickParam(params, ['barcode', 'kode', 'sku', 'ean', 'upc']) ||
    readTokenField(raw, ['barcode', 'bar-code', 'kode', 'sku', 'ean', 'upc'], true)
  const name =
    pickField(json, ['nama_barang', 'nama', 'name', 'produk', 'product', 'item']) ||
    pickParam(params, ['nama_barang', 'nama', 'name', 'produk', 'product', 'item']) ||
    readTokenField(raw, ['nama', 'name', 'produk', 'product', 'item', 'barang'])
  const brand =
    pickField(json, ['brand', 'merek', 'merk']) ||
    pickParam(params, ['brand', 'merek', 'merk']) ||
    readTokenField(raw, ['brand', 'merek', 'merk'])
  const price =
    pickField(json, ['harga', 'price']) ||
    pickParam(params, ['harga', 'price']) ||
    readTokenField(raw, ['harga', 'price'], true)
  const stock =
    pickField(json, ['stok', 'stock', 'qty', 'jumlah']) ||
    pickParam(params, ['stok', 'stock', 'qty', 'jumlah']) ||
    readTokenField(raw, ['stok', 'stock', 'qty', 'jumlah'], true)

  return {
    barcode: barcode ? normalizeBarcodeValue(barcode) : '',
    name: name.trim(),
    brand: brand.trim(),
    price: toNumber(price),
    stock: toNumber(stock),
  }
}

export function extractBarcodeValue(raw: string) {
  const text = raw.trim()
  if (!text) return ''

  const fields = fieldsFromScan(text)
  if (fields.barcode) return fields.barcode

  const numeric = text.match(/\b\d{1,18}\b/)
  if (numeric && numeric[0] === text) return numeric[0]

  if (/^[A-Za-z0-9._-]{1,80}$/.test(text)) {
    return normalizeBarcodeValue(text)
  }

  return ''
}

function findProfile(value: string) {
  const normalized = normalizeText(value)
  return brandProfiles.find((profile) =>
    profile.aliases.some((alias) => normalized.includes(normalizeText(alias))),
  ) ?? null
}

function displayBrand(value: string) {
  const profile = findProfile(value)
  if (profile) return profile.brand
  return titleCase(value)
}

function detectCategory(raw: string) {
  const normalized = normalizeText(raw)
  return productCategories.find((category) =>
    category.keywords.some((keyword) => normalized.includes(normalizeText(keyword))),
  )?.name ?? ''
}

function findKnownBrand(raw: string, products: Product[]) {
  const fromReference = findProfile(raw)?.brand
  if (fromReference) return fromReference

  const normalized = normalizeText(raw)
  return products
    .map((product) => product.brand)
    .find((brand) => brand.trim() && normalized.includes(normalizeText(brand))) ?? ''
}

function findBarcodeReference(barcode: string) {
  return barcodeReferences.find((item) => item.barcode && normalizeBarcodeValue(item.barcode) === barcode) ?? null
}

function suggestion(input: Omit<ProductScanSuggestion, 'reason'> & { reason?: string }): ProductScanSuggestion {
  return { ...input, reason: input.reason ?? '' }
}

export function lookupScannedProduct(raw: string, products: Product[] = []): ProductScanSuggestion {
  const fields = fieldsFromScan(raw)
  const barcode = fields.barcode || extractBarcodeValue(raw)
  const normalizedBarcode = normalizeBarcodeValue(barcode)
  const existing = products.find((product) => normalizeBarcodeValue(product.barcode) === normalizedBarcode)

  if (existing) {
    return suggestion({
      barcode: existing.barcode,
      namaBarang: existing.namaBarang,
      brand: existing.brand,
      harga: existing.harga,
      stok: existing.stok,
      source: 'store',
      confidence: 'high',
      reason: 'Barcode sama dengan produk di toko aktif.',
    })
  }

  const known = normalizedBarcode ? findBarcodeReference(normalizedBarcode) : null
  if (known) {
    return suggestion({
      barcode: normalizedBarcode,
      namaBarang: known.namaBarang,
      brand: known.brand,
      harga: known.harga ?? null,
      stok: fields.stock,
      source: 'barcode-reference',
      confidence: 'high',
      reason: 'Barcode cocok dengan referensi bawaan aplikasi.',
    })
  }

  const brand = fields.brand ? displayBrand(fields.brand) : findKnownBrand(raw, products)
  const category = fields.name ? titleCase(fields.name) : detectCategory(raw)
  const profile = brand ? findProfile(brand) : findProfile(raw)
  const namaBarang = category || profile?.defaultName || ''

  if (fields.name || fields.brand || category || brand) {
    return suggestion({
      barcode: normalizedBarcode,
      namaBarang,
      brand,
      harga: fields.price,
      stok: fields.stock,
      source: fields.name || fields.brand ? 'scan-text' : 'brand-reference',
      confidence: namaBarang && brand ? 'medium' : 'low',
      reason: fields.name || fields.brand
        ? 'Data nama barang atau brand terbaca dari hasil scan.'
        : 'Brand atau jenis barang cocok dengan referensi bawaan aplikasi.',
    })
  }

  return suggestion({
    barcode: normalizedBarcode,
    namaBarang: '',
    brand: '',
    harga: fields.price,
    stok: fields.stock,
    source: 'barcode-only',
    confidence: 'low',
    reason: 'Barcode terbaca, tetapi nama barang dan brand belum ada di referensi.',
  })
}
