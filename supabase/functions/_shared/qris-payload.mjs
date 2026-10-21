const MAX_QRIS_PAYLOAD_LENGTH = 512

export const MAX_QRIS_AMOUNT = 10_000_000

function parseTlv(payload) {
  if (typeof payload !== 'string' || !payload || payload.length > MAX_QRIS_PAYLOAD_LENGTH) {
    throw new Error('Data QRIS kosong atau terlalu panjang.')
  }

  const fields = []
  const seen = new Set()
  let offset = 0
  while (offset < payload.length) {
    if (offset + 4 > payload.length) throw new Error('Format data QRIS tidak lengkap.')
    const tag = payload.slice(offset, offset + 2)
    const lengthText = payload.slice(offset + 2, offset + 4)
    if (!/^\d{2}$/.test(tag) || !/^\d{2}$/.test(lengthText)) {
      throw new Error('Format data QRIS tidak valid.')
    }
    const length = Number(lengthText)
    offset += 4
    if (offset + length > payload.length) throw new Error('Panjang data QRIS tidak sesuai.')
    if (seen.has(tag)) throw new Error(`Field QRIS ${tag} muncul lebih dari satu kali.`)
    seen.add(tag)
    fields.push({ tag, value: payload.slice(offset, offset + length) })
    offset += length
  }
  return fields
}

function encodeTlv(fields) {
  return fields.map(({ tag, value }) => {
    if (!/^\d{2}$/.test(tag) || typeof value !== 'string' || value.length > 99) {
      throw new Error('Data QRIS melebihi batas format.')
    }
    return `${tag}${String(value.length).padStart(2, '0')}${value}`
  }).join('')
}

export function qrisCrc16(payload) {
  let crc = 0xffff
  for (let index = 0; index < payload.length; index += 1) {
    crc ^= payload.charCodeAt(index) << 8
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

function verifyCrc(payload, fields) {
  const crcIndex = fields.findIndex(field => field.tag === '63')
  const crcField = fields[crcIndex]
  if (crcIndex !== fields.length - 1 || !crcField || crcField.value.length !== 4) {
    throw new Error('QRIS tidak memiliki checksum yang valid.')
  }
  const checksumInput = payload.slice(0, -4)
  if (qrisCrc16(checksumInput) !== crcField.value.toUpperCase()) {
    throw new Error('Checksum QRIS tidak cocok.')
  }
}

export function validateStaticQris(payload) {
  const fields = parseTlv(payload)
  verifyCrc(payload, fields)
  const valueFor = tag => fields.find(field => field.tag === tag)?.value
  const merchantAccount = fields.some(({ tag, value }) => {
    const tagNumber = Number(tag)
    if (tagNumber < 26 || tagNumber > 51) return false
    try {
      return parseTlv(value).some(field => field.tag === '00')
    } catch {
      return false
    }
  })
  const merchantAccountByTag = tag => fields.find(field => field.tag === tag)?.value
  const expectedMerchantAccounts = {
    '26': '0014COM.GO-JEK.WWW01189360091435013108460210G5013108460303UMI',
    '51': '0014ID.CO.QRIS.WWW0215ID10266191687470303UMI',
  }

  if (valueFor('00') !== '01' || valueFor('01') !== '11' || valueFor('53') !== '360'
      || valueFor('58') !== 'ID' || valueFor('59') !== 'ABElektronik'
      || valueFor('60') !== 'MAJALENGKA' || !merchantAccount || valueFor('54')
      || merchantAccountByTag('26') !== expectedMerchantAccounts['26']
      || merchantAccountByTag('51') !== expectedMerchantAccounts['51']) {
    throw new Error('QRIS harus QRIS statis ABElektronik Majalengka yang terdaftar di aplikasi.')
  }

  const additionalData = valueFor('62')
  if (additionalData) parseTlv(additionalData)
  return {
    merchantName: valueFor('59'),
    fields,
  }
}

export function buildDynamicQris(staticPayload, amount, reference) {
  const { fields: originalFields } = validateStaticQris(staticPayload)
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > MAX_QRIS_AMOUNT) {
    throw new Error('Nominal QRIS harus Rp1 sampai Rp10.000.000.')
  }
  if (typeof reference !== 'string' || !reference.trim()) {
    throw new Error('Nomor referensi QRIS tidak valid.')
  }

  const fields = originalFields
    .filter(field => field.tag !== '63')
    .map(field => field.tag === '01' ? { tag: '01', value: '12' } : { ...field })
  const currencyIndex = fields.findIndex(field => field.tag === '53')
  fields.splice(currencyIndex + 1, 0, { tag: '54', value: String(amount) })

  const additionalIndex = fields.findIndex(field => field.tag === '62')
  const additionalFields = additionalIndex >= 0 ? parseTlv(fields[additionalIndex].value) : []
  const safeReference = reference.replace(/[^A-Za-z0-9-]/g, '').slice(0, 25)
  if (!safeReference) throw new Error('Nomor referensi QRIS tidak valid.')
  const referenceIndex = additionalFields.findIndex(field => field.tag === '05')
  if (referenceIndex >= 0) additionalFields[referenceIndex] = { tag: '05', value: safeReference }
  else additionalFields.push({ tag: '05', value: safeReference })
  additionalFields.sort((left, right) => Number(left.tag) - Number(right.tag))
  const encodedAdditional = encodeTlv(additionalFields)
  if (additionalIndex >= 0) fields[additionalIndex] = { tag: '62', value: encodedAdditional }
  else fields.push({ tag: '62', value: encodedAdditional })

  const withoutCrc = encodeTlv(fields) + '6304'
  const dynamicPayload = `${withoutCrc}${qrisCrc16(withoutCrc)}`
  if (dynamicPayload.length > MAX_QRIS_PAYLOAD_LENGTH) throw new Error('QRIS dinamis melebihi batas format.')
  return dynamicPayload
}
