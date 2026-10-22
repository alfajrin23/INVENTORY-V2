import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { buildDynamicQris, MAX_QRIS_AMOUNT, validateStaticQris } from '../_shared/qris-payload.mjs'
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

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = supabaseServiceKey(Deno.env)
  const publicKey = supabasePublicKey(Deno.env, request.headers.get('apikey'))
  if (!supabaseUrl || !serviceRoleKey || !publicKey) {
    return serverError('Koneksi pembayaran QRIS belum dikonfigurasi oleh admin.', 503)
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
      || Number(body.expectedAmount) > MAX_QRIS_AMOUNT
      || !Array.isArray(body.items) || body.items.length < 1 || body.items.length > 100) {
    return serverError('Toko, total, atau isi keranjang tidak valid. QRIS mendukung nominal sampai Rp10.000.000.')
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

  const { data: branding, error: brandingError } = await admin
    .from('app_branding')
    .select('qris_payload')
    .eq('id', 'default')
    .single()
  if (brandingError || typeof branding?.qris_payload !== 'string' || !branding.qris_payload) {
    return serverError('Data QRIS statis belum tersedia. Atur gambar QRIS di menu Pengaturan.', 503)
  }
  let merchantName: string
  try { merchantName = validateStaticQris(branding.qris_payload).merchantName }
  catch { return serverError('QRIS statis di Pengaturan tidak valid. Unggah ulang gambar QRIS merchant.', 409) }

  const { data: previous, error: previousError } = await admin
    .from('qris_payments')
    .select('id, store_id, created_by, order_id, gross_amount, status, qris_string, provider_status, created_at, expires_at')
    .eq('client_request_id', body.clientRequestId)
    .maybeSingle()
  if (previousError) return serverError('Riwayat permintaan QRIS gagal dibaca.', 500)
  if (previous) {
    if (previous.created_by !== userData.user.id || previous.store_id !== body.storeId) {
      return serverError('Permintaan pembayaran QRIS tidak dapat digunakan.', 409)
    }
    if (previous.status === 'pending' && previous.qris_string && previous.provider_status === 'manual_local') {
      return json({ id: previous.id, orderId: previous.order_id, amount: Number(previous.gross_amount),
        qrString: previous.qris_string, merchantName, createdAt: previous.created_at, expiresAt: previous.expires_at })
    }
    return serverError('Permintaan QRIS ini sudah pernah diproses. Periksa Riwayat QRIS sebelum mencoba lagi.', 409)
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

  let qrString: string
  try {
    qrString = buildDynamicQris(branding.qris_payload, Number(createdData.gross_amount), orderId)
  } catch {
    await admin.from('qris_payments').update({ status: 'failed', provider_status: 'invalid_base_qris',
      failure_reason: 'QRIS statis di Pengaturan tidak valid. Unggah ulang QRIS merchant.' }).eq('id', createdData.id)
    return serverError('QRIS statis di Pengaturan tidak valid. Unggah ulang gambar QRIS merchant.', 409)
  }

  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()
  const { data: saved, error: saveError } = await admin.from('qris_payments').update({
    qris_string: qrString,
    status: 'pending',
    provider_status: 'manual_local',
    expires_at: expiresAt,
  }).eq('id', createdData.id).select('id, order_id, gross_amount, created_at, expires_at').single()
  if (saveError || !saved) {
    return serverError('QRIS berhasil disiapkan tetapi gagal disimpan. Periksa Riwayat QRIS sebelum mencoba ulang.', 500)
  }

  return json({ id: saved.id, orderId: saved.order_id, amount: Number(saved.gross_amount),
    qrString, merchantName, createdAt: saved.created_at, expiresAt: saved.expires_at })
})
