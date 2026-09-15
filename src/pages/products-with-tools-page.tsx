import { ProductBarcodeTools } from '@/components/products/product-barcode-tools'
import { ProductsPage } from '@/pages/products-page'

export function ProductsWithToolsPage() {
  return (
    <>
      <ProductBarcodeTools />
      <ProductsPage />
    </>
  )
}
