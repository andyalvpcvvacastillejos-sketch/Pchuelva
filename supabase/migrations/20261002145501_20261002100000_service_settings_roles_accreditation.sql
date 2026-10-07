/*
# Servicios ampliados, cargos de agrupación y acreditaciones

## Resumen
Añade la hora de finalización y la fecha límite de inscripción a los servicios, permite configurar el enlace público de la aplicación y añade la información necesaria para las acreditaciones de Protección Civil Huelva.

## Cambios en tablas existentes
1. `servicios`
   - `fecha_limite_inscripcion`: fecha y hora hasta la que se permite solicitar plaza.
   - Se mantiene `fecha_fin` como hora de finalización y se valida que sea posterior al inicio.
2. `profiles`
   - `dni`: documento que aparecerá en la acreditación.
   - `agrupacion_role`: cargo operativo de agrupación, separado del rol de acceso a la aplicación.

## Nuevas tablas
1. `app_settings`
   - Guarda el enlace público que se incluye al compartir servicios.
   - Solo el administrador técnico puede modificarlo.

## Almacenamiento
1. Crea el bucket privado `accreditation-photos`.
2. Cada usuario solo puede subir, leer, sustituir o eliminar archivos dentro de su propia carpeta.
3. El personal autorizado puede leer las fotos para labores de gestión.

## Seguridad
1. Se mantienen las políticas RLS existentes.
2. Los cargos operativos solo se pueden cambiar mediante `set_agrupacion_role`, que comprueba que quien llama sea coordinador o administrador técnico.
3. El enlace de aplicación solo se puede cambiar mediante `update_app_url`, que comprueba que quien llama sea administrador técnico.
4. La contraseña y los datos sensibles no se almacenan en el navegador ni en una tabla pública.

## Notas importantes
1. Los campos nuevos son opcionales para no afectar a servicios ni perfiles existentes.
2. Si todavía no se ha configurado un enlace, la interfaz usará el dominio actual de la aplicación al compartir.
3. Las fotos se guardan como archivos privados y la pantalla genera accesos temporales para mostrarlas.
*/

ALTER TABLE servicios
  ADD COLUMN IF NOT EXISTS fecha_limite_inscripcion timestamptz;

ALTER TABLE servicios
  DROP CONSTRAINT IF EXISTS servicios_fechas_validas;

ALTER TABLE servicios
  ADD CONSTRAINT servicios_fechas_validas CHECK (
    (fecha_fin IS NULL OR fecha_fin > fecha)
    AND (fecha_limite_inscripcion IS NULL OR fecha_limite_inscripcion <= fecha)
  );

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS dni text,
  ADD COLUMN IF NOT EXISTS agrupacion_role text NOT NULL DEFAULT 'voluntario';

ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_agrupacion_role_check;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_agrupacion_role_check CHECK (
    agrupacion_role IN (
      'jefe_agrupacion',
      'subjefe_agrupacion',
      'responsable_logistica',
      'responsable_sanitaria',
      'responsable_parque_movil',
      'responsable_tecnologia_telecomunicaciones',
      'voluntario'
    )
  );

CREATE TABLE IF NOT EXISTS app_settings (
  setting_key text PRIMARY KEY,
  app_url text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_app_settings_authenticated" ON app_settings;
CREATE POLICY "select_app_settings_authenticated" ON app_settings FOR SELECT
  TO authenticated USING (true);

REVOKE INSERT, UPDATE, DELETE ON app_settings FROM anon, authenticated;
GRANT SELECT ON app_settings TO authenticated;

INSERT INTO app_settings (setting_key, app_url)
VALUES ('public_app', '')
ON CONFLICT (setting_key) DO NOTHING;

CREATE OR REPLACE FUNCTION update_app_url(p_app_url text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role text;
BEGIN
  SELECT role INTO caller_role FROM profiles WHERE id = auth.uid();
  IF caller_role IS DISTINCT FROM 'admin_tecnico' THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF length(trim(p_app_url)) > 500 THEN
    RAISE EXCEPTION 'Invalid URL';
  END IF;

  IF trim(p_app_url) <> '' AND trim(p_app_url) !~* '^https?://' THEN
    RAISE EXCEPTION 'Invalid URL';
  END IF;

  UPDATE app_settings
  SET app_url = trim(p_app_url), updated_at = now(), updated_by = auth.uid()
  WHERE setting_key = 'public_app';
END;
$$;

REVOKE ALL ON FUNCTION update_app_url(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_app_url(text) TO authenticated;

CREATE OR REPLACE FUNCTION set_agrupacion_role(p_user_id uuid, p_agrupacion_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role text;
BEGIN
  SELECT role INTO caller_role FROM profiles WHERE id = auth.uid();
  IF caller_role IS NULL OR caller_role NOT IN ('admin_tecnico', 'coordinador') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_agrupacion_role NOT IN (
    'jefe_agrupacion',
    'subjefe_agrupacion',
    'responsable_logistica',
    'responsable_sanitaria',
    'responsable_parque_movil',
    'responsable_tecnologia_telecomunicaciones',
    'voluntario'
  ) THEN
    RAISE EXCEPTION 'Invalid grouping role';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  UPDATE profiles
  SET agrupacion_role = p_agrupacion_role, updated_at = now()
  WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION set_agrupacion_role(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_agrupacion_role(uuid, text) TO authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'accreditation-photos',
  'accreditation-photos',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

DROP POLICY IF EXISTS "accreditation_photos_select_own_or_staff" ON storage.objects;
CREATE POLICY "accreditation_photos_select_own_or_staff" ON storage.objects FOR SELECT
  TO authenticated USING (
    bucket_id = 'accreditation-photos'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR is_admin_or_coordinador()
    )
  );

DROP POLICY IF EXISTS "accreditation_photos_insert_own" ON storage.objects;
CREATE POLICY "accreditation_photos_insert_own" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (
    bucket_id = 'accreditation-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "accreditation_photos_update_own" ON storage.objects;
CREATE POLICY "accreditation_photos_update_own" ON storage.objects FOR UPDATE
  TO authenticated USING (
    bucket_id = 'accreditation-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  ) WITH CHECK (
    bucket_id = 'accreditation-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "accreditation_photos_delete_own" ON storage.objects;
CREATE POLICY "accreditation_photos_delete_own" ON storage.objects FOR DELETE
  TO authenticated USING (
    bucket_id = 'accreditation-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
