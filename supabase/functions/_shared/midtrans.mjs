export async function midtransSignature({ orderId, statusCode, grossAmount, serverKey }) {
  const message = `${orderId}${statusCode}${grossAmount}${serverKey}`
  const bytes = new TextEncoder().encode(message)
  const digest = await crypto.subtle.digest('SHA-512', bytes)
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('')
}

export function equalHexDigest(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return difference === 0
}

export function isSuccessfulGopayQrisNotification(payload, merchantId) {
  return payload?.transaction_status === 'settlement'
    && payload?.fraud_status === 'accept'
    && payload?.payment_type === 'qris'
    && String(payload?.acquirer ?? '').toLowerCase() === 'gopay'
    && payload?.merchant_id === merchantId
    && typeof payload?.transaction_id === 'string'
    && payload.transaction_id.length > 0
}
