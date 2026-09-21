begin;

-- 21/09/2026
-- Normalize ELC product names from:
--   ELC 100uf 160V
-- to:
--   ELC 160V 100uf
-- Only rows that clearly match the old ELC <capacitance> <voltage> order are changed.
update public.products
set nama_barang = regexp_replace(
  nama_barang,
  '^(\s*ELC\s+)([0-9]+(?:\.[0-9]+)?\s*(?:uF|uf|UF|µF))\s+([0-9]+(?:\.[0-9]+)?\s*[Vv])(.*)$',
  '\1\3 \2\4'
)
where nama_barang ~* '^\s*ELC\s+[0-9]+(?:\.[0-9]+)?\s*(?:uf|µf)\s+[0-9]+(?:\.[0-9]+)?\s*v';

-- Read-only duplicate audit. A duplicate means the same store has the same
-- normalized product name AND the exact same price. Barcode may differ.
-- security_invoker keeps the existing products RLS rules in force.
create or replace view public.product_duplicate_audit
with (security_invoker = true)
as
select
  store_id,
  lower(regexp_replace(trim(nama_barang), '\s+', ' ', 'g')) as normalized_name,
  harga,
  count(*)::integer as duplicate_count,
  array_agg(id order by created_at, id) as product_ids,
  array_agg(nama_barang order by created_at, id) as product_names,
  array_agg(barcode order by created_at, id) as barcodes
from public.products
group by
  store_id,
  lower(regexp_replace(trim(nama_barang), '\s+', ' ', 'g')),
  harga
having count(*) > 1;

grant select on public.product_duplicate_audit to authenticated;

commit;
