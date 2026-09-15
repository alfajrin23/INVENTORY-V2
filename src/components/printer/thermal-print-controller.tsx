import { useEffect, useRef, useState } from 'react'

import { PrinterSetupDialog } from '@/components/printer/printer-setup-dialog'
import { useToast } from '@/hooks/use-toast'
import {
  isNativeAndroid,
  printReceiptDirect,
  THERMAL_RECEIPT_EVENT,
  ThermalPrinterError,
  type ThermalPrinterDevice,
  type ThermalReceiptPrintRequest,
} from '@/lib/thermal-printer'

export function ThermalPrintController() {
  const { showToast } = useToast()
  const pending = useRef<ThermalReceiptPrintRequest | null>(null)
  const busy = useRef(false)
  const [setupOpen, setSetupOpen] = useState(false)

  const printPending = async () => {
    const request = pending.current
    if (!request || busy.current) return false
    busy.current = true
    try {
      await printReceiptDirect(request.store, request.items, request.category)
      pending.current = null
      if (navigator.vibrate) navigator.vibrate([30, 25, 30])
      showToast('Resi berhasil dikirim ke printer', 'success')
      setSetupOpen(false)
      return true
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error('Printer gagal mencetak')
      showToast(error.message, 'error')
      if (cause instanceof ThermalPrinterError && ['NOT_CONFIGURED', 'DISCONNECTED', 'CONNECTION_FAILED', 'BLUETOOTH_OFF'].includes(cause.code)) {
        setSetupOpen(true)
      }
      return false
    } finally {
      busy.current = false
    }
  }

  useEffect(() => {
    if (!isNativeAndroid()) return

    const handlePrint = (event: Event) => {
      const request = (event as CustomEvent<ThermalReceiptPrintRequest>).detail
      if (!request?.items?.length) {
        showToast('Resi tidak memiliki barang untuk dicetak', 'error')
        return
      }
      pending.current = request
      void printPending()
    }

    window.addEventListener(THERMAL_RECEIPT_EVENT, handlePrint)
    return () => window.removeEventListener(THERMAL_RECEIPT_EVENT, handlePrint)
    // The event handler reads the latest refs; re-registering it is unnecessary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showToast])

  const connected = async (_device: ThermalPrinterDevice) => {
    await printPending()
  }

  return (
    <PrinterSetupDialog
      open={setupOpen}
      onOpenChange={(open) => {
        setSetupOpen(open)
        if (!open && pending.current) {
          showToast('Cetak dibatalkan. Resi tetap dapat dicetak kembali dari transaksi.', 'info')
          pending.current = null
        }
      }}
      onConnected={connected}
      pendingPrint={Boolean(pending.current)}
    />
  )
}
