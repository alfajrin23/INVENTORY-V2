import type { Product } from '@/lib/types'

export type VoiceIntent =
  | 'TRANSACTION_IN'
  | 'TRANSACTION_OUT'
  | 'CREATE_PRODUCT'
  | 'PRODUCT_CORRECTION'
  | 'CANCEL'
  | 'RETRY'
  | 'UNKNOWN'

export type VoiceCommand = {
  intent: VoiceIntent
  raw: string
  productQuery?: string
  quantity?: number
  stock?: number
  price?: number
}

export type ProductCandidate = {
  product: Product
  score: number
  confidence: number
  exact: boolean
}

const unitWords: Record<string, number> = {
  nol: 0,
  satu: 1,
  sebuah: 1,
  se: 1,
  dua: 2,
  tiga: 3,
  empat: 4,
  lima: 5,
  enam: 6,
  tujuh: 7,
  delapan: 8,
  sembilan: 9,
  sepuluh: 10,
  sebelas: 11,
}

const intentPhrases = [
  'barang masuk',
  'stok masuk',
  'tambah stok',
  'restock',
  'barang keluar',
  'penjualan',
  'terjual',
  'transaksi',
  'jual',
  'keluar',
]

export function normalizeVoiceText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function wordsToNumber(tokens: string[]) {
  if (!tokens.length) return null
  let total = 0
  let current = 0
  let consumed = 0

  for (const token of tokens) {
    if (/^\d+$/.test(token)) return { value: Number(token), consumed: 1 }
    if (token in unitWords) {
      current += unitWords[token]
      consumed += 1
      continue
    }
    if (token === 'belas') {
      current = (current || 1) + 10
      consumed += 1
      continue
    }
    if (token === 'puluh') {
      current = Math.max(current, 1) * 10
      consumed += 1
      continue
    }
    if (token === 'ratus') {
      current = Math.max(current, 1) * 100
      consumed += 1
      continue
    }
    if (token === 'ribu') {
      total += Math.max(current, 1) * 1000
      current = 0
      consumed += 1
      continue
    }
    break
  }

  return consumed ? { value: total + current, consumed } : null
}

function findNumber(text: string) {
  const tokens = normalizeVoiceText(text).split(' ').filter(Boolean)
  for (let index = 0; index < tokens.length; index += 1) {
    const parsed = wordsToNumber(tokens.slice(index, index + 5))
    if (parsed && Number.isFinite(parsed.value)) {
      return { value: parsed.value, tokens, index, consumed: parsed.consumed }
    }
  }
  return null
}

function numberAfter(text: string, keyword: string) {
  const normalized = normalizeVoiceText(text)
  const position = normalized.indexOf(keyword)
  if (position < 0) return undefined
  return findNumber(normalized.slice(position + keyword.length))?.value
}

function removeQuantityAndIntent(text: string) {
  let normalized = normalizeVoiceText(text)
  for (const phrase of intentPhrases) normalized = normalized.replaceAll(phrase, ' ')
  const found = findNumber(normalized)
  if (found) {
    found.tokens.splice(found.index, found.consumed)
    normalized = found.tokens.join(' ')
  }
  return normalized.replace(/\b(qty|jumlah|unit|buah|pcs)\b/g, ' ').replace(/\s+/g, ' ').trim()
}

export function parseVoiceCommand(raw: string): VoiceCommand {
  const normalized = normalizeVoiceText(raw)
  if (!normalized) return { intent: 'UNKNOWN', raw }
  if (/^(batal|batalkan|cancel)$/.test(normalized)) return { intent: 'CANCEL', raw }
  if (/^(ulangi|ulang|coba lagi|retry)$/.test(normalized)) return { intent: 'RETRY', raw }

  if (normalized.startsWith('tambah barang baru') || normalized.startsWith('buat barang baru')) {
    const stock = numberAfter(normalized, 'stok')
    const price = numberAfter(normalized, 'harga')
    const name = normalized
      .replace(/^(tambah|buat) barang baru\s*/, '')
      .split(/\s+(?:stok|harga)\s+/)[0]
      .trim()
    return { intent: 'CREATE_PRODUCT', raw, productQuery: name, stock, price }
  }

  if (/\b(bukan|maksud saya|qty|jumlah)\b/.test(normalized)) {
    const quantity = /\b(qty|jumlah)\b/.test(normalized) ? findNumber(normalized)?.value : undefined
    const afterMeaning = normalized.split(/maksud saya\s+/)[1]
    const productQuery = afterMeaning
      ? afterMeaning.replace(/\b(qty|jumlah)\b.*$/, '').trim()
      : undefined
    return { intent: 'PRODUCT_CORRECTION', raw, productQuery, quantity }
  }

  const quantity = findNumber(normalized)?.value
  const productQuery = removeQuantityAndIntent(normalized)
  if (/\b(barang masuk|restock|stok masuk|tambah stok)\b/.test(normalized)) {
    return { intent: 'TRANSACTION_IN', raw, productQuery, quantity }
  }
  if (/\b(jual|terjual|barang keluar|keluar|transaksi|penjualan)\b/.test(normalized)) {
    return { intent: 'TRANSACTION_OUT', raw, productQuery, quantity }
  }

  return { intent: 'UNKNOWN', raw, productQuery: normalized }
}

function levenshtein(a: string, b: string) {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0]
    previous[0] = i
    for (let j = 1; j <= b.length; j += 1) {
      const saved = previous[j]
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + cost)
      diagonal = saved
    }
  }
  return previous[b.length]
}

function tokenSimilarity(a: string, b: string) {
  const left = new Set(a.split(' ').filter(Boolean))
  const right = new Set(b.split(' ').filter(Boolean))
  if (!left.size || !right.size) return 0
  const overlap = [...left].filter((token) => right.has(token)).length
  const union = new Set([...left, ...right]).size
  return overlap / union
}

function scoreCandidate(product: Product, query: string) {
  const normalizedQuery = normalizeVoiceText(query)
  const name = normalizeVoiceText(product.namaBarang)
  const brand = normalizeVoiceText(product.brand)
  const combined = normalizeVoiceText(`${product.namaBarang} ${product.brand}`)
  const barcode = normalizeVoiceText(product.barcode)
  const exact = [name, combined, barcode].includes(normalizedQuery)
  if (exact) return { score: 1, exact: true }

  const distance = levenshtein(normalizedQuery, combined)
  const editScore = 1 - distance / Math.max(normalizedQuery.length, combined.length, 1)
  const tokenScore = Math.max(tokenSimilarity(normalizedQuery, name), tokenSimilarity(normalizedQuery, combined))
  const containsScore = combined.includes(normalizedQuery) || normalizedQuery.includes(name) ? 1 : 0
  const brandScore = brand && normalizedQuery.includes(brand) ? 1 : 0
  const score = Math.max(0, Math.min(0.99, tokenScore * 0.52 + editScore * 0.28 + containsScore * 0.12 + brandScore * 0.08))
  return { score, exact: false }
}

export function resolveProducts(products: Product[], query: string): ProductCandidate[] {
  const normalized = normalizeVoiceText(query)
  if (!normalized) return []

  return products
    .map((product) => {
      const result = scoreCandidate(product, normalized)
      return { product, score: result.score, confidence: Math.round(result.score * 100), exact: result.exact }
    })
    .filter((candidate) => candidate.exact || candidate.score >= 0.28)
    .sort((a, b) => b.score - a.score || a.product.namaBarang.localeCompare(b.product.namaBarang))
    .slice(0, 5)
}
