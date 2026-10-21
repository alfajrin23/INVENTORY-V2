import { createHash } from 'node:crypto'
import test from 'node:test'
import assert from 'node:assert/strict'

import { equalHexDigest, isSuccessfulGopayQrisNotification, midtransSignature } from '../supabase/functions/_shared/midtrans.mjs'
import { supabasePublicKey, supabaseServiceKey } from '../supabase/functions/_shared/supabase-keys.mjs'

const envMap = values => ({ get: key => values[key] })

test('Midtrans notification signature follows the documented SHA-512 field order', async () => {
  const fields = { orderId: 'ABE-ORDER-1', statusCode: '200', grossAmount: '30000.00', serverKey: 'test-secret' }
  const expected = createHash('sha512')
    .update(`${fields.orderId}${fields.statusCode}${fields.grossAmount}${fields.serverKey}`)
    .digest('hex')
  assert.equal(await midtransSignature(fields), expected)
})

test('signature comparison accepts only exact fixed-length digests', () => {
  assert.equal(equalHexDigest('a'.repeat(128), 'a'.repeat(128)), true)
  assert.equal(equalHexDigest('a'.repeat(128), 'b'.repeat(128)), false)
  assert.equal(equalHexDigest('a'.repeat(127), 'a'.repeat(128)), false)
})

test('only settlement for the expected GoPay QRIS merchant is successful', () => {
  const notification = {
    transaction_status: 'settlement', fraud_status: 'accept', payment_type: 'qris',
    acquirer: 'gopay', merchant_id: 'G123', transaction_id: 'midtrans-123',
  }
  assert.equal(isSuccessfulGopayQrisNotification(notification, 'G123'), true)
  assert.equal(isSuccessfulGopayQrisNotification({ ...notification, merchant_id: 'G999' }, 'G123'), false)
  assert.equal(isSuccessfulGopayQrisNotification({ ...notification, acquirer: 'other' }, 'G123'), false)
  assert.equal(isSuccessfulGopayQrisNotification({ ...notification, transaction_status: 'pending' }, 'G123'), false)
  assert.equal(isSuccessfulGopayQrisNotification({ ...notification, fraud_status: 'challenge' }, 'G123'), false)
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
