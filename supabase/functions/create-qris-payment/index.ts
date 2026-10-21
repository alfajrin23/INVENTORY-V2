import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { supabasePublicKey, supabaseServiceKey } from '../_shared/supabase-keys.mjs'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function validUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function serverError(message: string, status = 400) {
  return json({ error: message }, status)
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return serverError('Gunakan metode POST.', 405)

  const serverKey = Deno.env.get('MIDTRANS_SERVER_KEY')
  const merchantId = Deno.env.get('MIDTRANS_EXPECTED_MERCHANT_ID')
  const isProduction = Deno.env.get('MIDTRANS_IS_PRODUCTION') === 'true'
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = supabaseServiceKey(Deno.env)
  const publicKey = supabasePublicKey(Deno.env, request.headers.get('apikey'))
  if (!serverKey || !merchantId || !supabaseUrl || !serviceRoleKey || !publicKey) {
    return serverError('Pembayaran QRIS belum dikonfigurasi oleh admin.', 503)
  }
  if (isProduction && serverKey.startsWith('SB-')) {
    return serverError('Konfigurasi Midtrans live tidak sesuai.', 503)
  }
  if (!isProduction && serverKey.startsWith('Mid-server-')) {
    return serverError('Konfigurasi Midtrans Sandbox tidak sesuai.', 503)
  }

  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) return serverError('Silakan masuk kembali.', 401)

  const userClient = createClient(supabaseUrl, publicKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  })
  const { data: userData, error: userError } = await userClient.auth.getUser()
  if (userError || !userData.user) return serverError('Sesi login tidak valid.', 401)

  let body: { storeId?: unknown; clientRequestId?: unknown; expectedAmount?: unknown; items?: unknown }
  try {
    body = await request.json()
  } catch {
    return serverError('Data keranjang tidak valid.')
  }
  if (!validUuid(body.storeId) || !validUuid(body.clientRequestId)
      || !Number.isSafeInteger(body.expectedAmount) || Number(body.expectedAmount) < 1
      || !Array.isArray(body.items) || body.items.length < 1 || body.items.length > 100) {
    return serverError('Toko, total, atau isi keranjang tidak valid.')
  }

  const requestedItems: Array<{ productId: string; quantity: number }> = []
  for (const item of body.items) {
    if (!item || typeof item !== 'object' || !validUuid((item as { productId?: unknown }).productId)
        || !Number.isSafeInteger((item as { quantity?: unknown }).quantity)
        || Number((item as { quantity: number }).quantity) < 1
        || Number((item as { quantity: number }).quantity) > 1000000) {
      return serverError('Jumlah atau produk di keranjang tidak valid.')
    }
    requestedItems.push({
      productId: (item as { productId: string }).productId,
      quantity: Number((item as { quantity: number }).quantity),
    })
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: previous, error: previousError } = await admin
    .from('qris_payments')
    .select('id, store_id, created_by, order_id, gross_amount, status, qris_string, expires_at')
    .eq('client_request_id', body.clientRequestId)
    .maybeSingle()
  if (previousError) return serverError('Riwayat permintaan QRIS gagal dibaca.', 500)
  if (previous) {
    if (previous.created_by !== userData.user.id || previous.store_id !== body.storeId) {
      return serverError('Permintaan pembayaran QRIS tidak dapat digunakan.', 409)
    }
    if (previous.status === 'pending' && previous.qris_string) {
      return json({ id: previous.id, orderId: previous.order_id, amount: Number(previous.gross_amount),
        qrString: previous.qris_string, expiresAt: previous.expires_at })
    }
    return serverError('Permintaan QRIS ini sudah pernah diproses. Buat permintaan baru.', 409)
  }

  const orderId = `ABE-${crypto.randomUUID().replaceAll('-', '').toUpperCase()}`
  const { data: createdData, error: createError } = await admin.rpc('create_qris_payment_record', {
    p_store_id: body.storeId,
    p_created_by: userData.user.id,
    p_client_request_id: body.clientRequestId,
    p_order_id: orderId,
    p_expected_amount: Number(body.expectedAmount),
    p_items: requestedItems,
  })
  if (createError || !createdData?.id) {
    const reason = createError?.message ?? ''
    return serverError(reason.includes('tidak cukup') || reason.includes('berubah') || reason.includes('tidak ditemukan')
      ? reason : 'Keranjang tidak dapat diverifikasi. Muat ulang stok lalu coba lagi.', 409)
  }

  const apiBase = isProduction ? 'https://api.midtrans.com' : 'https://api.sandbox.midtrans.com'
  const notificationUrl = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/midtrans-qris-notification`
  let chargeResponse: Response
  try {
    chargeResponse = await fetch(`${apiBase}/v2/charge`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${serverKey}:`)}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Override-Notification': notificationUrl,
      },
      body: JSON.stringify({
        payment_type: 'qris',
        transaction_details: { order_id: orderId, gross_amount: Number(createdData.gross_amount) },
      }),
    })
  } catch {
    await admin.from('qris_payments').update({ status: 'failed', provider_status: 'unreachable',
      failure_reason: 'Midtrans tidak dapat dihubungi. Buat QRIS baru setelah koneksi pulih.' }).eq('id', createdData.id)
    return serverError('Midtrans tidak dapat dihubungi. Periksa koneksi lalu buat QRIS baru.', 502)
  }

  const charge = await chargeResponse.json().catch(() => null)
  const validResponse = chargeResponse.ok
    && charge?.payment_type === 'qris'
    && String(charge?.acquirer ?? '').toLowerCase() === 'gopay'
    && charge?.merchant_id === merchantId
    && Number(charge?.gross_amount) === Number(createdData.gross_amount)
    && typeof charge?.transaction_id === 'string'
    && typeof charge?.qr_string === 'string'
    && charge.qr_string.length > 20
    && charge?.transaction_status === 'pending'
  if (!validResponse) {
    const safeReason = typeof charge?.status_message === 'string' ? charge.status_message.slice(0, 180) : 'Respons Midtrans tidak sesuai.'
    await admin.from('qris_payments').update({ status: 'failed', provider_status: String(charge?.transaction_status ?? 'error'),
      failure_reason: safeReason }).eq('id', createdData.id)
    return serverError('Midtrans menolak pembuatan QRIS. Periksa aktivasi QRIS/GoPay dan kredensial merchant.', 502)
  }

  const { data: saved, error: saveError } = await admin.from('qris_payments').update({
    transaction_id: charge.transaction_id,
    qris_string: charge.qr_string,
    status: 'pending',
    provider_status: charge.transaction_status,
    expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  }).eq('id', createdData.id).select('id, order_id, gross_amount, expires_at').single()
  if (saveError || !saved) {
    return serverError('QRIS sudah dibuat Midtrans tetapi gagal disiapkan di aplikasi. Jangan buat pembayaran baru sebelum admin memeriksa transaksi Midtrans.', 500)
  }

  return json({ id: saved.id, orderId: saved.order_id, amount: Number(saved.gross_amount),
    qrString: charge.qr_string, expiresAt: saved.expires_at })
})
