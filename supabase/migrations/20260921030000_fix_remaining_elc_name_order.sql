begin;

-- 21/09/2026 follow-up
-- Handle ELC names that were missed by the first migration because they use:
-- - comma decimals, e.g. 4,7uf
-- - dotted numeric formatting, e.g. 10.000 uf
-- - mixed ELC casing, e.g. Elc
-- - optional spaces before the capacitance unit / voltage suffix
--
-- Examples:
--   ELC 4,7uf 160V   -> ELC 160V 4,7uf
--   Elc 220uf 450V   -> Elc 450V 220uf
--   Elc 10.000 uf 50v -> Elc 50v 10.000 uf

update public.products
set nama_barang = regexp_replace(
  nama_barang,
  '^(\s*ELC\s+)([0-9][0-9.,]*\s*(?:uF|µF))\s+([0-9][0-9.,]*\s*V)(.*)$',
  '\1\3 \2\4',
  'i'
)
where nama_barang ~* '^\s*ELC\s+[0-9][0-9.,]*\s*(?:uf|µf)\s+[0-9][0-9.,]*\s*v';

commit;
