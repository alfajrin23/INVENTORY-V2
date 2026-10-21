const headers = { 'Content-Type': 'application/json' }

Deno.serve(() => new Response(JSON.stringify({
  error: 'Konfirmasi QRIS otomatis dinonaktifkan. Konfirmasi pembayaran melalui aplikasi kasir setelah mengecek GoBiz.',
}), { status: 410, headers }))
