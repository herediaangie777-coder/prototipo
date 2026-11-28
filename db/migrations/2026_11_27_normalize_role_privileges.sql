BEGIN;

DELETE FROM public.roles_x_permisos rxp
USING public.privilegios v
WHERE rxp.id_privilegio = v.id_privilegio
  AND lower(btrim(v.nombre_privilegio)) = 'finalizar';

DELETE FROM public.permisos_privilegios pp
USING public.privilegios v
WHERE pp.id_privilegio = v.id_privilegio
  AND lower(btrim(v.nombre_privilegio)) = 'finalizar';

DELETE FROM public.privilegios
WHERE lower(btrim(nombre_privilegio)) = 'finalizar';

INSERT INTO public.privilegios (nombre_privilegio)
VALUES ('Consultar'), ('Filtrar'), ('Registrar'), ('Ver detalle'), ('Editar'), ('Anular'), ('Eliminar'), ('Exportar'), ('Asociar lote')
ON CONFLICT (nombre_privilegio) DO NOTHING;

INSERT INTO public.permisos_privilegios (id_permiso, id_privilegio)
SELECT p.id_permiso, v.id_privilegio
FROM public.permisos p
CROSS JOIN public.privilegios v
WHERE p.nombre_permiso = 'Compras'
  AND v.nombre_privilegio IN ('Consultar', 'Filtrar', 'Registrar', 'Ver detalle', 'Editar', 'Anular', 'Eliminar', 'Exportar', 'Asociar lote')
ON CONFLICT (id_permiso, id_privilegio) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ck_privilegios_no_finalizar'
      AND conrelid = 'public.privilegios'::regclass
  ) THEN
    ALTER TABLE public.privilegios
      ADD CONSTRAINT ck_privilegios_no_finalizar
      CHECK (lower(btrim(nombre_privilegio)) <> 'finalizar');
  END IF;
END;
$$;

INSERT INTO public.roles_x_permisos (id_rol, id_permiso, id_privilegio)
SELECT r.id_rol, pp.id_permiso, pp.id_privilegio
FROM public.roles r
CROSS JOIN public.permisos_privilegios pp
WHERE r.nombre_rol = 'Super Administrador'
ON CONFLICT (id_rol, id_permiso, id_privilegio) DO NOTHING;

COMMIT;
