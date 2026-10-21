export const MAX_QRIS_AMOUNT: number

export function qrisCrc16(payload: string): string

export function validateStaticQris(payload: string): {
  merchantName: string
  fields: Array<{ tag: string; value: string }>
}

export function buildDynamicQris(staticPayload: string, amount: number, reference: string): string
