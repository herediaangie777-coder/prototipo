BEGIN;

ALTER TABLE public.produccion
  ADD COLUMN IF NOT EXISTS merma_estimada numeric(12,2) NOT NULL DEFAULT 0;

ALTER TABLE public.produccion
  ALTER COLUMN merma TYPE numeric(12,3)
  USING merma::numeric(12,3);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ck_produccion_merma_estimada'
      AND conrelid = 'public.produccion'::regclass
  ) THEN
    ALTER TABLE public.produccion
      ADD CONSTRAINT ck_produccion_merma_estimada
      CHECK (merma_estimada >= 0 AND merma_estimada <= cantidad_a_procesar);
  END IF;
END
$$;

COMMIT;
