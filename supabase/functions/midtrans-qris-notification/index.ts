import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { equalHexDigest, isSuccessfulGopayQrisNotification, midtransSignature } from '../_shared/midtrans.mjs'
import { supabaseServiceKey } from '../_shared/supabase-keys.mjs'

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

Deno.serve(async request => {
  if (request.method !== 'POST') return reply({ error: 'Method not allowed' }, 405)
  const serverKey = Deno.env.get('MIDTRANS_SERVER_KEY')
  const merchantId = Deno.env.get('MIDTRANS_EXPECTED_MERCHANT_ID')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = supabaseServiceKey(Deno.env)
  if (!serverKey || !merchantId || !supabaseUrl || !serviceRoleKey) {
    return reply({ error: 'Payment provider is not configured' }, 503)
  }

  let notification: Record<string, unknown>
  try {
    notification = await request.json()
  } catch {
    return reply({ error: 'Invalid JSON' }, 400)
  }
  const orderId = notification.order_id
  const grossAmount = notification.gross_amount
  const statusCode = notification.status_code
  const actualSignature = notification.signature_key
  if (typeof orderId !== 'string' || typeof grossAmount !== 'string'
      || typeof statusCode !== 'string' || typeof actualSignature !== 'string') {
    return reply({ error: 'Invalid notification fields' }, 400)
  }

  const expectedSignature = await midtransSignature({ orderId, statusCode, grossAmount, serverKey })
  if (!equalHexDigest(actualSignature.toLowerCase(), expectedSignature)) {
    return reply({ error: 'Invalid signature' }, 401)
  }
  if (notification.payment_type !== 'qris'
      || String(notification.acquirer ?? '').toLowerCase() !== 'gopay'
      || notification.merchant_id !== merchantId
      || (notification.currency !== undefined && notification.currency !== 'IDR')) {
    return reply({ error: 'Unexpected merchant or payment channel' }, 403)
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: payment, error: lookupError } = await admin.from('qris_payments')
    .select('id, gross_amount, status')
    .eq('order_id', orderId)
    .maybeSingle()
  if (lookupError) return reply({ error: 'Payment lookup failed' }, 500)
  if (!payment) return reply({ error: 'Unknown order' }, 404)
  if (Number(grossAmount) !== Number(payment.gross_amount)) return reply({ error: 'Amount mismatch' }, 400)

  if (isSuccessfulGopayQrisNotification(notification, merchantId)) {
    const { error: settlementError } = await admin.rpc('settle_qris_payment', {
      p_order_id: orderId,
      p_transaction_id: notification.transaction_id,
      p_amount: Number(grossAmount),
    })
    if (settlementError) {
      if (settlementError.code === 'P0001') {
        const { error: updateError } = await admin.from('qris_payments').update({
          status: 'inventory_error',
          provider_status: 'settlement',
          transaction_id: notification.transaction_id,
          failure_reason: settlementError.message.slice(0, 240),
        }).eq('id', payment.id).neq('status', 'paid')
        if (updateError) return reply({ error: 'Payment recorded, inventory update needs retry' }, 500)
        return reply({ ok: true, inventoryError: true })
      }
      return reply({ error: 'Could not settle payment' }, 500)
    }
    return reply({ ok: true })
  }

  const status = notification.transaction_status
  if (status === 'expire' || status === 'deny' || status === 'cancel') {
    const { error: updateError } = await admin.from('qris_payments').update({
      status: status === 'expire' ? 'expired' : 'failed',
      provider_status: String(status),
      failure_reason: status === 'expire' ? 'QRIS kedaluwarsa sebelum dibayar.' : 'Transaksi QRIS ditolak atau dibatalkan.',
    }).eq('id', payment.id).in('status', ['creating', 'pending'])
    if (updateError) return reply({ error: 'Could not update payment status' }, 500)
  }
  return reply({ ok: true })
})
