BEGIN;

ALTER TABLE public.productos
  DROP CONSTRAINT IF EXISTS uq_productos_variante;

CREATE UNIQUE INDEX IF NOT EXISTS uq_productos_variante_sin_peso
  ON public.productos (id_categoria, tipo_producto, presentacion, unidad_medida)
  WHERE peso_unidad_kg IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_productos_variante_con_peso
  ON public.productos (id_categoria, tipo_producto, presentacion, unidad_medida, peso_unidad_kg)
  WHERE peso_unidad_kg IS NOT NULL;

COMMIT;
