/*
# Vehículos operativos, rutas especiales y partes sanitarios

## Resumen
Amplía la base de datos operativa de Protección Civil Huelva con tres nuevas capacidades: seguimiento de vehículos operativos, registro de rutas especiales para eventos y generación de partes de asistencia sanitaria básica vinculados a incidencias.

## Nuevas tablas
1. `vehiculos_operativos`
   - `id`: identificador del vehículo.
   - `nombre`: identificador visible (ej. BUP-1, Vehículo de Coordinación).
   - `tipo`: clase de recurso móvil (bup, coordinacion, ambulancia, logistica, otro).
   - `estado`: situación operativa (en_base, en_ruta, en_incidencia).
   - `latitud`, `longitud`: última posición GPS conocida.
   - `updated_at`: última actualización de posición.
   - `is_active`: permite retirar un vehículo sin borrar su historial.

2. `rutas_especiales`
   - `id`: identificador de la ruta.
   - `nombre`: nombre del evento (ej. Procesión del Domingo de Ramos).
   - `tipo`: tipo de evento (procesion, carrera_popular, manifestacion, otro).
   - `fecha`: día y hora del evento.
   - `descripcion`: detalles operativos.
   - `created_by`: personal que la creó, asignado desde la sesión.
   - `is_active`: permite archivar sin borrar.

3. `ruta_waypoints`
   - `id`: identificador del punto.
   - `ruta_id`: ruta a la que pertenece.
   - `orden`: posición del punto dentro del recorrido.
   - `tipo`: naturaleza del punto (recorrido, pk_critico, corte_trafico, retene).
   - `latitud`, `longitud`: posición del punto.
   - `etiqueta`: nombre visible del punto (ej. Retén PK 3).
   - `created_at`: fecha de creación.

4. `partes_sanitarios`
   - `id`: identificador del parte.
   - `incident_id`: incidencia operativa vinculada.
   - `user_id`: voluntario que lo rellena, asignado desde la sesión.
   - `paciente_nombre`, `paciente_edad`, `paciente_telefono`: datos del paciente.
   - `motivo_asistencia`: anamnesis breve.
   - `fc`: frecuencia cardíaca (lpm).
   - `tas`, `tad`: tensión arterial sistólica y diastólica.
   - `spo2`: saturación de oxígeno (%).
   - `temperatura`: temperatura corporal (°C).
   - `nivel_conciencia`: escala AVPU (alerta, voz, dolor, inconsciente).
   - `tratamiento`: primeros auxilios aplicados.
   - `resolucion`: destino o resolución (alta, derivacion_centro, ambulancia_uvi).
   - `created_at`: fecha del parte.

## Seguridad
1. Activa RLS en todas las tablas.
2. Solo usuarios activos y aprobados pueden consultar y crear registros.
3. La gestión de vehículos y rutas está reservada a coordinadores y administradores técnicos.
4. Cualquier voluntario activo y aprobado puede generar un parte sanitario vinculado a una incidencia.
5. Los waypoints solo pueden modificarse por personal autorizado, pero son visibles para todo el equipo.

## Notas importantes
1. Las posiciones GPS se guardan como `numeric(9,6)`.
2. Los partes sanitarios se vinculan a una incidencia existente mediante clave externa.
3. Los waypoints mantienen un campo `orden` para reconstruir el recorrido completo.
4. No se eliminan registros automáticamente para conservar el historial operativo.
*/

CREATE TABLE IF NOT EXISTS vehiculos_operativos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL CHECK (char_length(trim(nombre)) BETWEEN 2 AND 80),
  tipo text NOT NULL DEFAULT 'otro' CHECK (tipo IN ('bup', 'coordinacion', 'ambulancia', 'logistica', 'otro')),
  estado text NOT NULL DEFAULT 'en_base' CHECK (estado IN ('en_base', 'en_ruta', 'en_incidencia')),
  latitud numeric(9,6),
  longitud numeric(9,6),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE RESTRICT,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE vehiculos_operativos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "operational_vehicles_select_team" ON vehiculos_operativos;
CREATE POLICY "operational_vehicles_select_team" ON vehiculos_operativos FOR SELECT
  TO authenticated USING (
    is_active = true
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.is_active = true
        AND (p.role <> 'voluntario' OR p.is_approved = true)
    )
  );

DROP POLICY IF EXISTS "operational_vehicles_insert_staff" ON vehiculos_operativos;
CREATE POLICY "operational_vehicles_insert_staff" ON vehiculos_operativos FOR INSERT
  TO authenticated WITH CHECK (
    created_by = auth.uid()
    AND is_admin_or_coordinador()
  );

DROP POLICY IF EXISTS "operational_vehicles_update_staff" ON vehiculos_operativos;
CREATE POLICY "operational_vehicles_update_staff" ON vehiculos_operativos FOR UPDATE
  TO authenticated USING (is_admin_or_coordinador()) WITH CHECK (is_admin_or_coordinador());

DROP POLICY IF EXISTS "operational_vehicles_delete_staff" ON vehiculos_operativos;
CREATE POLICY "operational_vehicles_delete_staff" ON vehiculos_operativos FOR DELETE
  TO authenticated USING (is_admin_or_coordinador());

CREATE INDEX IF NOT EXISTS idx_operational_vehicles_active ON vehiculos_operativos(is_active) WHERE is_active = true;

CREATE TABLE IF NOT EXISTS rutas_especiales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL CHECK (char_length(trim(nombre)) BETWEEN 3 AND 120),
  tipo text NOT NULL DEFAULT 'otro' CHECK (tipo IN ('procesion', 'carrera_popular', 'manifestacion', 'otro')),
  fecha timestamptz NOT NULL,
  descripcion text,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE RESTRICT,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE rutas_especiales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "operational_routes_select_team" ON rutas_especiales;
CREATE POLICY "operational_routes_select_team" ON rutas_especiales FOR SELECT
  TO authenticated USING (
    is_active = true
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.is_active = true
        AND (p.role <> 'voluntario' OR p.is_approved = true)
    )
  );

DROP POLICY IF EXISTS "operational_routes_insert_staff" ON rutas_especiales;
CREATE POLICY "operational_routes_insert_staff" ON rutas_especiales FOR INSERT
  TO authenticated WITH CHECK (
    created_by = auth.uid()
    AND is_admin_or_coordinador()
  );

DROP POLICY IF EXISTS "operational_routes_update_staff" ON rutas_especiales;
CREATE POLICY "operational_routes_update_staff" ON rutas_especiales FOR UPDATE
  TO authenticated USING (is_admin_or_coordinador()) WITH CHECK (is_admin_or_coordinador());

DROP POLICY IF EXISTS "operational_routes_delete_staff" ON rutas_especiales;
CREATE POLICY "operational_routes_delete_staff" ON rutas_especiales FOR DELETE
  TO authenticated USING (is_admin_or_coordinador());

CREATE TABLE IF NOT EXISTS ruta_waypoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ruta_id uuid NOT NULL REFERENCES rutas_especiales(id) ON DELETE CASCADE,
  orden integer NOT NULL CHECK (orden >= 0),
  tipo text NOT NULL DEFAULT 'recorrido' CHECK (tipo IN ('recorrido', 'pk_critico', 'corte_trafico', 'retene')),
  latitud numeric(9,6) NOT NULL CHECK (latitud BETWEEN -90 AND 90),
  longitud numeric(9,6) NOT NULL CHECK (longitud BETWEEN -180 AND 180),
  etiqueta text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ruta_waypoints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "route_waypoints_select_team" ON ruta_waypoints;
CREATE POLICY "route_waypoints_select_team" ON ruta_waypoints FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM rutas_especiales r
      WHERE r.id = ruta_waypoints.ruta_id
        AND r.is_active = true
        AND EXISTS (
          SELECT 1 FROM profiles p
          WHERE p.id = auth.uid()
            AND p.is_active = true
            AND (p.role <> 'voluntario' OR p.is_approved = true)
        )
    )
  );

DROP POLICY IF EXISTS "route_waypoints_insert_staff" ON ruta_waypoints;
CREATE POLICY "route_waypoints_insert_staff" ON ruta_waypoints FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM rutas_especiales r
      WHERE r.id = ruta_waypoints.ruta_id
        AND r.created_by = auth.uid()
        AND is_admin_or_coordinador()
    )
  );

DROP POLICY IF EXISTS "route_waypoints_delete_staff" ON ruta_waypoints;
CREATE POLICY "route_waypoints_delete_staff" ON ruta_waypoints FOR DELETE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM rutas_especiales r
      WHERE r.id = ruta_waypoints.ruta_id
        AND r.created_by = auth.uid()
        AND is_admin_or_coordinador()
    )
  );

CREATE INDEX IF NOT EXISTS idx_route_waypoints_route_orden ON ruta_waypoints(ruta_id, orden);

CREATE TABLE IF NOT EXISTS partes_sanitarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES incidencias_operativas(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  paciente_nombre text,
  paciente_edad integer CHECK (paciente_edad IS NULL OR (paciente_edad >= 0 AND paciente_edad <= 130)),
  paciente_telefono text,
  motivo_asistencia text NOT NULL,
  fc integer CHECK (fc IS NULL OR (fc >= 0 AND fc <= 250)),
  tas integer CHECK (tas IS NULL OR (tas >= 0 AND tas <= 300)),
  tad integer CHECK (tad IS NULL OR (tad >= 0 AND tad <= 200)),
  spo2 integer CHECK (spo2 IS NULL OR (spo2 >= 0 AND spo2 <= 100)),
  temperatura numeric(4,1) CHECK (temperatura IS NULL OR (temperatura >= 25 AND temperatura <= 45)),
  nivel_conciencia text CHECK (nivel_conciencia IS NULL OR nivel_conciencia IN ('alerta', 'voz', 'dolor', 'inconsciente')),
  tratamiento text,
  resolucion text NOT NULL DEFAULT 'alta_lugar' CHECK (resolucion IN ('alta_lugar', 'derivacion_centro', 'ambulancia_uvi')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE partes_sanitarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "medical_reports_select_team" ON partes_sanitarios;
CREATE POLICY "medical_reports_select_team" ON partes_sanitarios FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM incidencias_operativas i
      WHERE i.id = partes_sanitarios.incident_id
        AND EXISTS (
          SELECT 1 FROM profiles p
          WHERE p.id = auth.uid()
            AND p.is_active = true
            AND (p.role <> 'voluntario' OR p.is_approved = true)
        )
    )
  );

DROP POLICY IF EXISTS "medical_reports_insert_own" ON partes_sanitarios;
CREATE POLICY "medical_reports_insert_own" ON partes_sanitarios FOR INSERT
  TO authenticated WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM incidencias_operativas i
      WHERE i.id = partes_sanitarios.incident_id
        AND EXISTS (
          SELECT 1 FROM profiles p
          WHERE p.id = auth.uid()
            AND p.is_active = true
            AND (p.role <> 'voluntario' OR p.is_approved = true)
        )
    )
  );

DROP POLICY IF EXISTS "medical_reports_update_own" ON partes_sanitarios;
CREATE POLICY "medical_reports_update_own" ON partes_sanitarios FOR UPDATE
  TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "medical_reports_delete_staff" ON partes_sanitarios;
CREATE POLICY "medical_reports_delete_staff" ON partes_sanitarios FOR DELETE
  TO authenticated USING (user_id = auth.uid() OR is_admin_or_coordinador());

CREATE INDEX IF NOT EXISTS idx_medical_reports_incident ON partes_sanitarios(incident_id);
