/*
# Canal operativo de incidencias y puntos de interés

## Resumen
Crea la base de datos para registrar incidencias de campo y mantener una cartografía operativa compartida para Protección Civil Huelva.

## Nuevas tablas
1. `incidencias_operativas`
   - `id`: identificador de la incidencia.
   - `user_id`: usuario autenticado que la registra, asignado automáticamente por la sesión.
   - `categoria`: urgente/refuerzos, sanitaria, tráfico/vía pública o aviso general.
   - `descripcion`: texto breve de la incidencia.
   - `latitud` y `longitud`: coordenadas GPS opcionales.
   - `foto_path`: ruta privada de la fotografía opcional.
   - `estado`: abierta, en seguimiento o resuelta.
   - `created_at`: fecha de creación.
2. `puntos_interes`
   - `id`: identificador del punto.
   - `nombre` y `descripcion`: información operativa visible en el mapa.
   - `categoria`: socorro/encuentro, hidrante o zona de riesgo/evacuación.
   - `latitud` y `longitud`: posición del punto.
   - `created_by`: personal que lo creó, asignado desde la sesión.
   - `is_active`: permite ocultar un punto sin borrar su historial.

## Almacenamiento
1. Crea el bucket privado `incident-photos`.
2. Limita las fotos a JPG, PNG o WebP y 5 MB.
3. La ruta de cada foto empieza por el identificador del usuario y las políticas impiden escribir en carpetas ajenas.

## Seguridad
1. Activa RLS en las dos tablas.
2. Solo usuarios activos y aprobados pueden consultar incidencias y puntos operativos.
3. Cada usuario puede crear incidencias en su propio nombre.
4. Los coordinadores y administradores técnicos pueden crear, modificar y desactivar puntos de interés.
5. Las fotos solo se pueden leer cuando pertenecen a una incidencia visible para el equipo.

## Notas importantes
1. Las coordenadas se guardan como `numeric` para conservar precisión suficiente en el terreno.
2. No se eliminan registros automáticamente; una incidencia puede conservarse para seguimiento.
3. La interfaz mantiene una cola local temporal si no hay conexión y reintenta sincronizarla cuando vuelve a abrirse.
*/

CREATE TABLE IF NOT EXISTS incidencias_operativas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  categoria text NOT NULL CHECK (categoria IN ('urgente_refuerzos', 'sanitaria', 'trafico_via_publica', 'aviso_general')),
  descripcion text NOT NULL CHECK (char_length(trim(descripcion)) BETWEEN 3 AND 500),
  latitud numeric(9,6),
  longitud numeric(9,6),
  foto_path text,
  estado text NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta', 'en_seguimiento', 'resuelta')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE incidencias_operativas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "operational_incidents_select_team" ON incidencias_operativas;
CREATE POLICY "operational_incidents_select_team" ON incidencias_operativas FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.is_active = true
        AND (p.role <> 'voluntario' OR p.is_approved = true)
    )
  );

DROP POLICY IF EXISTS "operational_incidents_insert_own" ON incidencias_operativas;
CREATE POLICY "operational_incidents_insert_own" ON incidencias_operativas FOR INSERT
  TO authenticated WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.is_active = true
        AND (p.role <> 'voluntario' OR p.is_approved = true)
    )
  );

DROP POLICY IF EXISTS "operational_incidents_update_own" ON incidencias_operativas;
CREATE POLICY "operational_incidents_update_own" ON incidencias_operativas FOR UPDATE
  TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "operational_incidents_delete_own_or_staff" ON incidencias_operativas;
CREATE POLICY "operational_incidents_delete_own_or_staff" ON incidencias_operativas FOR DELETE
  TO authenticated USING (user_id = auth.uid() OR is_admin_or_coordinador());

CREATE INDEX IF NOT EXISTS idx_operational_incidents_created_at ON incidencias_operativas(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_operational_incidents_category ON incidencias_operativas(categoria);

CREATE TABLE IF NOT EXISTS puntos_interes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL CHECK (char_length(trim(nombre)) BETWEEN 2 AND 120),
  descripcion text,
  categoria text NOT NULL CHECK (categoria IN ('socorro_encuentro', 'hidrante', 'riesgo_evacuacion')),
  latitud numeric(9,6) NOT NULL CHECK (latitud BETWEEN -90 AND 90),
  longitud numeric(9,6) NOT NULL CHECK (longitud BETWEEN -180 AND 180),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE RESTRICT,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE puntos_interes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "operational_poi_select_team" ON puntos_interes;
CREATE POLICY "operational_poi_select_team" ON puntos_interes FOR SELECT
  TO authenticated USING (
    is_active = true
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.is_active = true
        AND (p.role <> 'voluntario' OR p.is_approved = true)
    )
  );

DROP POLICY IF EXISTS "operational_poi_insert_staff" ON puntos_interes;
CREATE POLICY "operational_poi_insert_staff" ON puntos_interes FOR INSERT
  TO authenticated WITH CHECK (
    created_by = auth.uid()
    AND is_admin_or_coordinador()
  );

DROP POLICY IF EXISTS "operational_poi_update_staff" ON puntos_interes;
CREATE POLICY "operational_poi_update_staff" ON puntos_interes FOR UPDATE
  TO authenticated USING (is_admin_or_coordinador()) WITH CHECK (is_admin_or_coordinador());

DROP POLICY IF EXISTS "operational_poi_delete_staff" ON puntos_interes;
CREATE POLICY "operational_poi_delete_staff" ON puntos_interes FOR DELETE
  TO authenticated USING (is_admin_or_coordinador());

CREATE INDEX IF NOT EXISTS idx_operational_poi_category ON puntos_interes(categoria);
CREATE INDEX IF NOT EXISTS idx_operational_poi_active ON puntos_interes(is_active) WHERE is_active = true;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'incident-photos',
  'incident-photos',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

DROP POLICY IF EXISTS "incident_photos_select_team" ON storage.objects;
CREATE POLICY "incident_photos_select_team" ON storage.objects FOR SELECT
  TO authenticated USING (
    bucket_id = 'incident-photos'
    AND EXISTS (
      SELECT 1 FROM incidencias_operativas i
      WHERE i.foto_path = name
        AND EXISTS (
          SELECT 1 FROM profiles p
          WHERE p.id = auth.uid()
            AND p.is_active = true
            AND (p.role <> 'voluntario' OR p.is_approved = true)
        )
    )
  );

DROP POLICY IF EXISTS "incident_photos_insert_own" ON storage.objects;
CREATE POLICY "incident_photos_insert_own" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (
    bucket_id = 'incident-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "incident_photos_update_own" ON storage.objects;
CREATE POLICY "incident_photos_update_own" ON storage.objects FOR UPDATE
  TO authenticated USING (
    bucket_id = 'incident-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  ) WITH CHECK (
    bucket_id = 'incident-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "incident_photos_delete_own" ON storage.objects;
CREATE POLICY "incident_photos_delete_own" ON storage.objects FOR DELETE
  TO authenticated USING (
    bucket_id = 'incident-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
