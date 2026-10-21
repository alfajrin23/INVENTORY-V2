import test from 'node:test'
import assert from 'node:assert/strict'

import { buildDynamicQris, MAX_QRIS_AMOUNT, qrisCrc16, validateStaticQris } from '../supabase/functions/_shared/qris-payload.mjs'
import { supabasePublicKey, supabaseServiceKey } from '../supabase/functions/_shared/supabase-keys.mjs'

const envMap = values => ({ get: key => values[key] })
const abeStaticQris = '00020101021126610014COM.GO-JEK.WWW01189360091435013108460210G5013108460303UMI51440014ID.CO.QRIS.WWW0215ID10266191687470303UMI5204549953033605802ID5912ABElektronik6010MAJALENGKA61054545862070703A0163043E9A'

function parseTlv(payload) {
  const fields = []
  for (let offset = 0; offset < payload.length;) {
    const tag = payload.slice(offset, offset + 2)
    const length = Number(payload.slice(offset + 2, offset + 4))
    offset += 4
    fields.push({ tag, value: payload.slice(offset, offset + length) })
    offset += length
  }
  return fields
}

function find(fields, tag) {
  return fields.find(field => field.tag === tag)?.value
}

test('provided ABElektronik base QRIS is a valid static merchant payload', () => {
  const decoded = validateStaticQris(abeStaticQris)
  assert.equal(decoded.merchantName, 'ABElektronik')
})

test('dynamic QRIS embeds the transaction amount and unique reference while preserving merchant account data', () => {
  const dynamic = buildDynamicQris(abeStaticQris, 275000, 'ABE-2A6FC681-8E7D-4F1D')
  const fields = parseTlv(dynamic)
  const baseFields = parseTlv(abeStaticQris)

  assert.equal(find(fields, '01'), '12')
  assert.equal(find(fields, '54'), '275000')
  assert.equal(find(fields, '59'), 'ABElektronik')
  assert.equal(find(fields, '26'), find(baseFields, '26'))
  assert.equal(find(fields, '63'), qrisCrc16(dynamic.slice(0, -4)))
  const extra = parseTlv(find(fields, '62'))
  assert.equal(find(extra, '05'), 'ABE-2A6FC681-8E7D-4F1D')
  assert.ok(extra.findIndex(field => field.tag === '05') < extra.findIndex(field => field.tag === '07'))
})

test('dynamic QRIS rejects malformed source payloads and out-of-range amounts', () => {
  assert.throws(() => validateStaticQris(abeStaticQris.slice(0, -1) + '0'), /Checksum/)
  const otherMerchant = abeStaticQris.replace('ABElektronik', 'LainElektrik').slice(0, -4)
  assert.throws(() => validateStaticQris(`${otherMerchant}${qrisCrc16(otherMerchant)}`), /ABElektronik/)
  assert.throws(() => buildDynamicQris(abeStaticQris, 0, 'ABE-ORDER'), /Nominal/)
  assert.throws(() => buildDynamicQris(abeStaticQris, MAX_QRIS_AMOUNT + 1, 'ABE-ORDER'), /Nominal/)
  assert.throws(() => buildDynamicQris(abeStaticQris, 1000.5, 'ABE-ORDER'), /Nominal/)
})

test('Supabase functions use platform legacy keys or the current publishable/secret key maps', () => {
  const env = envMap({
    SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: 'sb_publishable_app' }),
    SUPABASE_SECRET_KEYS: JSON.stringify({ default: 'sb_secret_server' }),
  })
  assert.equal(supabasePublicKey(env), 'sb_publishable_app')
  assert.equal(supabasePublicKey(env, 'sb_publishable_from_request'), 'sb_publishable_app')
  assert.equal(supabaseServiceKey(env), 'sb_secret_server')
  assert.equal(supabaseServiceKey(envMap({ SUPABASE_SERVICE_ROLE_KEY: 'legacy-service-role' })), 'legacy-service-role')
  assert.equal(supabasePublicKey(envMap({}), 'sb_publishable_from_request'), 'sb_publishable_from_request')
})
