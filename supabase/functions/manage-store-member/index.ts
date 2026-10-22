import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { supabasePublicKey, supabaseServiceKey } from '../_shared/supabase-keys.mjs'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Gunakan metode POST.' }, 405)
  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = supabaseServiceKey(Deno.env)
  const publicKey = supabasePublicKey(Deno.env, request.headers.get('apikey'))
  const authorization = request.headers.get('Authorization')
  if (!url || !serviceKey || !publicKey) return json({ error: 'Layanan undangan belum dikonfigurasi.' }, 503)
  if (!authorization?.startsWith('Bearer ')) return json({ error: 'Silakan masuk kembali.' }, 401)

  const userClient = createClient(url, publicKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  })
  const { data: authData, error: authError } = await userClient.auth.getUser()
  if (authError || !authData.user) return json({ error: 'Sesi login tidak valid.' }, 401)

  let body: { action?: unknown; storeId?: unknown; email?: unknown; role?: unknown; userId?: unknown }
  try { body = await request.json() } catch { return json({ error: 'Permintaan tidak valid.' }, 400) }
  if (!isUuid(body.storeId) || !['invite', 'update', 'remove'].includes(String(body.action))) {
    return json({ error: 'Cabang atau tindakan tidak valid.' }, 400)
  }
  const { data: callerRole, error: roleError } = await userClient.rpc('current_store_role', { p_store_id: body.storeId })
  if (roleError || !['owner', 'manager'].includes(String(callerRole))) return json({ error: 'Hanya pemilik atau manager cabang yang dapat mengelola karyawan.' }, 403)

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  if (body.action === 'invite') {
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !['manager', 'cashier'].includes(String(body.role))) {
      return json({ error: 'Email atau jabatan karyawan tidak valid.' }, 400)
    }
    if (email === authData.user.email?.toLowerCase()) return json({ error: 'Gunakan email karyawan yang berbeda dari akun Anda.' }, 400)

    let invitedUser = null
    for (let page = 1; page <= 20 && !invitedUser; page += 1) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
      if (error) return json({ error: 'Akun karyawan tidak dapat diperiksa.' }, 500)
      invitedUser = data.users.find(user => user.email?.toLowerCase() === email) ?? null
      if (data.users.length < 1000) break
    }
    if (!invitedUser) {
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email)
      if (error || !data.user) return json({ error: 'Email undangan gagal dikirim. Periksa konfigurasi email Supabase atau alamat email.' }, 400)
      invitedUser = data.user
    }

    const { error } = await admin.from('store_memberships').upsert({
      store_id: body.storeId,
      user_id: invitedUser.id,
      email,
      role: body.role,
      active: true,
      invited_by: authData.user.id,
    }, { onConflict: 'store_id,user_id' })
    if (error) return json({ error: 'Akun ditemukan, tetapi akses cabang gagal disimpan. Coba lagi.' }, 500)
    return json({ ok: true, message: 'Akses karyawan aktif.' })
  }

  if (!isUuid(body.userId) || body.userId === authData.user.id) return json({ error: 'Karyawan yang dipilih tidak valid.' }, 400)
  const { data: membership, error: memberError } = await admin.from('store_memberships')
    .select('store_id,user_id')
    .eq('store_id', body.storeId)
    .eq('user_id', body.userId)
    .maybeSingle()
  if (memberError || !membership) return json({ error: 'Karyawan tidak terdaftar pada cabang ini.' }, 404)

  if (body.action === 'remove') {
    const { error } = await admin.from('store_memberships').update({ active: false }).eq('store_id', body.storeId).eq('user_id', body.userId)
    if (error) return json({ error: 'Akses karyawan gagal dinonaktifkan.' }, 500)
    return json({ ok: true })
  }
  if (!['manager', 'cashier'].includes(String(body.role))) return json({ error: 'Jabatan karyawan tidak valid.' }, 400)
  const { error } = await admin.from('store_memberships').update({ role: body.role, active: true })
    .eq('store_id', body.storeId).eq('user_id', body.userId)
  if (error) return json({ error: 'Jabatan karyawan gagal diperbarui.' }, 500)
  return json({ ok: true })
})
