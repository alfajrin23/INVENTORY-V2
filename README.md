# ABElektronik Web Stock Management

React + Tailwind CSS + shadcn/ui inventory app for multi-store stock management.

## Stack

- React, Vite, TypeScript
- Tailwind CSS v4
- shadcn/ui + Radix primitives
- Framer Motion
- Lucide React
- Recharts
- Firebase Firestore, Storage, Authentication SDK
- html5-qrcode barcode scanner
- JsBarcode barcode generator
- jsPDF receipt and report export

## Run

```bash
npm install
npm run dev
```

## Firebase

Copy `.env.example` to `.env` and fill the Firebase values. If the required values are empty, the app runs in demo mode with localStorage seed data.

Main collections used by the app:

- `stores`
- `products`
- `history`

The React routes keep the old page names, for example `/databarang.html`, `/history.html`, and `/laporanpendapatan.html`.
