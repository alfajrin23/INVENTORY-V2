import type { Product, TransactionCategory } from '@/lib/types'

export type VoiceTransactionCommand = {
  intent: 'stock_in' | 'stock_out'
  category: TransactionCategory
  items: { query: string; quantity: number }[]
  confidence: number
}
export type VoiceProductDraft = { name: string; brand: string; stock: number | null; price: number | null; barcode: string }
export type VoiceCreateProductCommand = { intent: 'create_product'; draft: VoiceProductDraft; confidence: number }
export type VoiceCommand = VoiceTransactionCommand | VoiceCreateProductCommand
export type VoiceDraftEdit =
  | { action: 'cancel' }
  | { action: 'retry' }
  | { action: 'quantity'; quantity: number; query?: string }
  | { action: 'product'; from?: string; query: string }

export function normalizeVoice(text: string) {
  return text.toLocaleLowerCase('id-ID').normalize('NFKD').replace(/(\d)\s*(?:watt|w)\b/g, '$1 watt')
    .replace(/\ba\s+c\s+r\b/g, 'acr').replace(/\bj\s+b\s+l\b/g, 'jbl')
    .replace(/[^a-z0-9\s]/g, ' ').replace(/\b(?:bulb|bohlam)\b/g, 'lampu').replace(/\s+/g, ' ').trim()
}
const digits: Record<string, number> = { nol: 0, satu: 1, dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6, tujuh: 7, delapan: 8, sembilan: 9, sepuluh: 10, sebelas: 11, seratus: 100, seribu: 1000 }
const numberMarkers = new Set([...Object.keys(digits), 'belas', 'puluh', 'ratus', 'ribu'])
const createLabels = new Set(['nama', 'merek', 'brand', 'stok', 'stock', 'qty', 'jumlah', 'kuantitas', 'harga', 'barcode', 'kode'])
const voiceAliasGroups = [
  ['lampu', 'lampo', 'lampuh', 'lamphu', 'lamp'],
  ['speaker', 'spiker', 'sepiker', 'speker'],
  ['charger', 'carger', 'cas', 'casan', 'ces'],
  ['kabel', 'cable', 'kable'],
  ['philips', 'filips', 'filip', 'philip', 'pilips', 'pilip', 'phillips'],
  ['jepi', 'cepi', 'jepy', 'jepie', 'jeppy'],
  ['panasonic', 'panasonik', 'panasonek'],
  ['acr', 'acer', 'aser', 'acir'],
  ['jbl', 'jebel', 'jibiel', 'jabel'],
  ['anker', 'angker', 'angkir'],
  ['vention', 'fention', 'vensyen'],
  ['eterna', 'eterne'],
  ['krisbow', 'krisbo', 'krisbou'],
  ['logitech', 'lojitek', 'logitek'],
  ['baseus', 'basius', 'bases'],
  ['soundcore', 'sankor', 'soundkor'],
]
const voiceAliasEntries = voiceAliasGroups.flatMap(group => group.map(alias => ({ alias, group })))
const transactionConnectors = new Set(['dan', 'lalu', 'terus', 'kemudian', 'sama'])
const productNumberUnits = new Set(['watt', 'w', 'meter', 'm', 'mah', 'gb', 'tb', 'mb', 'kg', 'gram', 'gr', 'cm', 'mm', 'inch', 'inci', 'volt', 'v', 'ampere', 'a', 'hz', 'mhz', 'ghz', 'port', 'lubang'])

function numberWords(text: string): number | null {
  if (/^\d+$/.test(text)) return Number(text)
  if (text in digits) return digits[text]
  const words = text.split(' ')
  const underHundred = (part: string[]): number | null => {
    if (!part.length) return 0
    if (part.length === 1 && (digits[part[0]] ?? 99) <= 11) return digits[part[0]]
    const digit = digits[part[0]]
    if (!(digit >= 2 && digit <= 9)) return null
    if (part.length === 2 && part[1] === 'belas') return digit + 10
    if (part[1] === 'puluh' && part.length <= 3) {
      const tail = part.length === 2 ? 0 : digits[part[2]]
      return tail >= 0 && tail <= 9 ? digit * 10 + tail : null
    }
    return null
  }
  const underThousand = (part: string[]): number | null => {
    if (part[0] === 'seratus') { const tail = underHundred(part.slice(1)); return tail === null ? null : 100 + tail }
    if (part[1] === 'ratus' && digits[part[0]] >= 2 && digits[part[0]] <= 9) {
      const tail = underHundred(part.slice(2)); return tail === null ? null : digits[part[0]] * 100 + tail
    }
    return underHundred(part)
  }
  if (words[0] === 'seribu') { const tail = underThousand(words.slice(1)); return tail === null ? null : 1000 + tail }
  const thousandIndex = words.indexOf('ribu')
  if (thousandIndex > 0) {
    const head = underThousand(words.slice(0, thousandIndex)); const tail = underThousand(words.slice(thousandIndex + 1))
    return head && tail !== null ? head * 1000 + tail : null
  }
  return underThousand(words)
}

function splitTrailingQuantity(text: string, allowEmptyQuery = false) {
  const tokens = normalizeVoice(text).split(' ').filter(Boolean)
  let boundary = tokens.length
  while (boundary > (allowEmptyQuery ? 0 : 1) && (/^\d+$/.test(tokens[boundary - 1]) || numberMarkers.has(tokens[boundary - 1]))) boundary--
  if (boundary === tokens.length) return null
  const quantity = numberWords(tokens.slice(boundary).join(' '))
  if (quantity === null || !Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 1000000) return null
  return { query: tokens.slice(0, boundary).join(' ').trim(), quantity }
}

function readLeadingQuantity(tokens: string[], index: number) {
  let end = index
  let result: { quantity: number; end: number } | null = null
  let invalidExtension = false
  while (end < tokens.length && (/^\d+$/.test(tokens[end]) || numberMarkers.has(tokens[end]))) {
    const quantity = numberWords(tokens.slice(index, end + 1).join(' '))
    if (quantity !== null && Number.isSafeInteger(quantity) && quantity > 0 && quantity <= 1000000) result = { quantity, end: end + 1 }
    else invalidExtension = true
    end++
  }
  return invalidExtension && result?.end !== end ? null : result
}

function splitTransactionParts(body: string) {
  const tokens = normalizeVoice(body).split(' ').filter(Boolean)
  const parts: string[] = []
  let start = 0

  for (let index = 1; index < tokens.length; index++) {
    if (transactionConnectors.has(tokens[index])) {
      const part = tokens.slice(start, index).join(' ').trim()
      if (part) parts.push(part)
      start = index + 1
      continue
    }

    const quantity = readLeadingQuantity(tokens, index)
    if (!quantity || productNumberUnits.has(tokens[quantity.end] ?? '')) continue
    const query = tokens.slice(start, index).filter(token => !transactionConnectors.has(token)).join(' ').trim()
    if (!query) continue
    parts.push(tokens.slice(start, quantity.end).filter(token => !transactionConnectors.has(token)).join(' '))
    start = quantity.end
    index = start - 1
  }

  const tail = tokens.slice(start).filter(token => !transactionConnectors.has(token)).join(' ').trim()
  if (tail) parts.push(tail)
  return parts
}

function titleCase(text: string) {
  return text.split(' ').filter(Boolean).map(word => (
    /^(usb|tws|led|hdmi|mcb|ny[a-z]*|rca|tv|ac)$/i.test(word)
      ? word.toLocaleUpperCase('id-ID')
      : word.charAt(0).toLocaleUpperCase('id-ID') + word.slice(1)
  )).join(' ')
}

function readNumberField(tokens: string[], labels: string[], displayLabel: string) {
  const index = tokens.findIndex(token => labels.includes(token))
  if (index < 0) return { value: null, tokens }
  let start = index + 1
  while (['awal', 'nya', 'barang', 'produk', 'jual', 'sebesar'].includes(tokens[start])) start++
  let end = start
  while (end < tokens.length && !createLabels.has(tokens[end])) end++
  const value = numberWords(tokens.slice(start, end).join(' '))
  if (value === null) throw new Error(`${displayLabel} belum terbaca dengan jelas.`)
  return { value, tokens: [...tokens.slice(0, index), ...tokens.slice(end)] }
}

function readTextField(tokens: string[], labels: string[], compact = false) {
  const index = tokens.findIndex(token => labels.includes(token))
  if (index < 0) return { value: '', tokens }
  let start = index + 1
  while (['barang', 'produk', 'nya'].includes(tokens[start])) start++
  let end = start
  while (end < tokens.length && !createLabels.has(tokens[end])) end++
  return { value: tokens.slice(start, end).join(compact ? '' : ' ').trim(), tokens: [...tokens.slice(0, index), ...tokens.slice(end)] }
}

function parseCreateProduct(normalized: string): VoiceCreateProductCommand | null {
  const match = normalized.match(/^(?:(?:tambah|buat|input|masukkan)\s+(?:barang|produk)(?:\s+baru)?|(?:barang|produk)\s+baru)(?:\s+(.+))?$/)
  if (!match) return null
  let tokens = (match[1] ?? '').split(' ').filter(Boolean)
  const name = readTextField(tokens, ['nama'])
  tokens = name.tokens
  const brand = readTextField(tokens, ['merek', 'brand'])
  tokens = brand.tokens
  const stock = readNumberField(tokens, ['stok', 'stock', 'qty', 'jumlah', 'kuantitas'], 'Stok/qty')
  tokens = stock.tokens
  const price = readNumberField(tokens, ['harga'], 'Harga')
  tokens = price.tokens
  const barcode = readTextField(tokens, ['barcode', 'kode'], true)
  tokens = barcode.tokens
  const nameText = (name.value || tokens.filter(token => !['dengan', 'dan'].includes(token)).join(' ')).trim()
  const words = nameText.split(' ').filter(Boolean)
  return {
    intent: 'create_product',
    draft: {
      name: titleCase(nameText),
      brand: titleCase(brand.value || (words.length > 1 ? words.at(-1) ?? '' : '')),
      stock: stock.value,
      price: price.value,
      barcode: barcode.value,
    },
    confidence: stock.value !== null ? 0.9 : 0.65,
  }
}

export function parseVoiceCommand(text: string): VoiceCommand {
  if (/(?:^|\s)-\d|\d[.,]\d|\bminus\b/i.test(text)) throw new Error('Jumlah harus bilangan bulat positif. Perbaiki perintah Anda.')
  const normalized = normalizeVoice(text)
  if (!normalized || normalized.length > 1000) throw new Error('Saya belum memahami perintah tersebut. Sebutkan jenis transaksi, produk, dan jumlah.')
  const create = parseCreateProduct(normalized)
  if (create) return create
  const incoming = /\b(?:barang masuk|stok masuk|masukkan stok|tambahkan stok|tambah stok|restok|masuk)\b/g
  const outgoing = /\b(?:barang keluar|transaksi|penjualan|jual|keluar)\b/g
  const hasIn = incoming.test(normalized); const hasOut = outgoing.test(normalized)
  if (hasIn === hasOut) throw new Error('Sebutkan satu jenis transaksi: barang masuk, restok, transaksi, atau jual.')
  const body = normalized.replace(incoming, '').replace(outgoing, '').trim()
  const parts = splitTransactionParts(body)
  if (parts.length > 10) throw new Error('Maksimal 10 barang untuk satu perintah suara.')
  const items = parts.map(part => {
    const parsed = splitTrailingQuantity(part.trim().replace(/\bsebanyak\b/g, ''), false)
    if (!parsed?.query) throw new Error('Jumlah belum terbaca. Contoh: transaksi lampu Philips dua.')
    const { query, quantity } = parsed
    if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 1000000) throw new Error('Jumlah harus bilangan bulat 1 sampai 1000000.')
    return { query, quantity }
  })
  return { intent: hasIn ? 'stock_in' : 'stock_out', category: hasIn ? 'masuk' : 'keluar', items, confidence: 1 }
}

export function parseVoiceDraftEdit(text: string): VoiceDraftEdit | null {
  const normalized = normalizeVoice(text)
  if (!normalized) return null
  if (/^(?:batal|batalkan|cancel)$/.test(normalized)) return { action: 'cancel' }
  if (/^(?:ulang|ulangi|coba lagi|retry)$/.test(normalized)) return { action: 'retry' }
  const qty = normalized.match(/^(?:qty|jumlah|kuantitas)(?:\s*nya)?\s+(.+)$/)
  if (qty) {
    const parsed = splitTrailingQuantity(qty[1], true)
    if (!parsed) throw new Error('Jumlah koreksi belum terbaca.')
    return { action: 'quantity', quantity: parsed.quantity, query: parsed.query || undefined }
  }
  const correction = normalized.match(/^bukan\s+(.+?)\s+(?:maksud(?:nya| saya)?|yang benar|jadi)\s+(.+)$/)
  if (correction) return { action: 'product', from: correction[1].trim(), query: correction[2].trim() }
  const direct = normalized.match(/^(?:maksud(?:nya| saya)?|ganti ke|pilih)\s+(.+)$/)
  if (direct) return { action: 'product', query: direct[1].trim() }
  return null
}

function aliasGroupFor(token: string) {
  return voiceAliasEntries.find(entry => entry.alias === token)?.group ?? null
}

function sameAliasGroup(a: string, b: string) {
  const groupA = aliasGroupFor(a)
  if (groupA?.includes(b)) return true
  const groupB = aliasGroupFor(b)
  return Boolean(groupB?.includes(a))
}

function editDistanceAtMost(a: string, b: string, limit: number) {
  if (Math.abs(a.length - b.length) > limit) return false
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    let best = current[0]
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      const value = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost)
      current[j] = value
      best = Math.min(best, value)
    }
    if (best > limit) return false
    for (let j = 0; j < current.length; j++) previous[j] = current[j]
  }
  return previous[b.length] <= limit
}

function closeWord(a: string, b: string) {
  if (a === b) return true
  if (sameAliasGroup(a, b)) return true
  if (Math.min(a.length, b.length) < 3 || /\d/.test(a + b)) return false
  const maxLength = Math.max(a.length, b.length)
  const limit = maxLength <= 4 ? 1 : maxLength <= 8 ? 2 : Math.ceil(maxLength * 0.25)
  return editDistanceAtMost(a, b, limit)
}

function relatedVoiceWords(product: Product) {
  return [...new Set(normalizeVoice(`${product.namaBarang} ${product.brand} ${product.barcode}`).split(' ').filter(Boolean))]
}

function tokenScore(token: string, word: string) {
  if (token === word) return 1
  if (sameAliasGroup(token, word)) return 0.94
  if (closeWord(token, word)) return 0.82
  if (token.length >= 4 && word.length >= 4 && (token.includes(word) || word.includes(token))) return 0.68
  return 0
}

export function matchVoiceProducts(query: string, products: Product[]) {
  const tokens = [...new Set(normalizeVoice(query).split(' ').filter(Boolean))]
  if (!tokens.length) return []
  return products.map(product => {
    const words = relatedVoiceWords(product)
    const incompatibleNumber = tokens.some(t => /^\d+$/.test(t) && !words.includes(t))
    const tokenScores = incompatibleNumber ? [] : tokens.map(token => Math.max(...words.map(word => tokenScore(token, word))))
    const strongMatches = tokenScores.filter(score => score >= 0.62).length
    const score = incompatibleNumber ? 0 : tokenScores.reduce((sum, value) => sum + value, 0) / tokens.length
    const minimumStrongMatches = tokens.length === 1 ? 1 : Math.max(1, Math.floor(tokens.length / 2))
    return { product, score, strongMatches, minimumStrongMatches }
  }).filter(item => item.score >= (tokens.length === 1 ? 0.55 : 0.38) && item.strongMatches >= item.minimumStrongMatches)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map(({ product, score }) => ({ product, score }))
}
