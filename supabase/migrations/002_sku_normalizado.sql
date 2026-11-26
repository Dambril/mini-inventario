-- Issue #16: el SKU solo se guarda normalizado. Con eso, el índice único
-- productos_user_sku_unico ya detecta los duplicados que se ven iguales.
-- Los caracteres van escapados (\x....) para no dejar invisibles en el archivo.
-- La misma regla está en public/js/esquemas.js (normalizarSku).
alter table public.productos
  add constraint productos_sku_normalizado check (
    sku = btrim(
      regexp_replace(
        normalize(
          regexp_replace(sku,
            '[\x00AD\x180E\x200B-\x200F\x202A-\x202E\x2060-\x2064\x2066-\x2069\xFEFF]',
            '', 'g'),
          NFC),
        '[\x0009-\x000D\x0020\x0085\x00A0\x1680\x2000-\x200A\x2028\x2029\x202F\x205F\x3000]+',
        ' ', 'g'),
      ' ')
  );
