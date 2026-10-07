/*
# Renombrar BUP a VIR, vehículos asignados a servicios y campos ampliados del parte sanitario

## Resumen
1. Cambia el tipo de vehículo 'bup' a 'vir' (Vehículo de Intervención Rápida).
2. Crea la tabla `servicio_vehiculos` para asignar vehículos operativos a servicios preventivos.
3. Añade campos al parte sanitario: glucemia, dirección completa, DNI del paciente, servicio_id y vehículo_id.
4. Crea la tabla `historial_pacientes` para conservar el historial médico de pacientes recurrentes.

## Cambios en tablas existentes
1. `vehiculos_operativos`: actualiza el CHECK de tipo para usar 'vir' en lugar de 'bup'. Los datos existentes con 'bup' se migran a 'vir'.
2. `partes_sanitarios`: añade columnas `glucemia`, `direccion`, `dni`, `servicio_id`, `vehiculo_id`.

## Nuevas tablas
1. `servicio_vehiculos`
   - `servicio_id`: servicio preventivo al que se asigna.
   - `vehiculo_id`: vehículo operativo asignado.
   - Clave primaria compuesta por ambos.

2. `historial_pacientes`
   - `id`: identificador del historial.
   - `paciente_dni`: DNI del paciente (clave de búsqueda).
   - `paciente_nombre`, `paciente_edad`, `paciente_telefono`, `direccion`: últimos datos conocidos.
   - `resumen`: texto libre con resúmenes de asistencias anteriores.
   - `updated_at`: última actualización.

## Seguridad
1. Activa RLS en las nuevas tablas.
2. Solo usuarios activos y aprobados pueden consultar asignaciones de vehículos e historial.
3. Coordinadores y administradores pueden asignar vehículos a servicios y gestionar el historial.
4. Los partes sanitarios pueden vincularse opcionalmente a un servicio y un vehículo.

## Notas importantes
1. La migración de 'bup' a 'vir' usa un DO block para actualizar los registros existentes sin perder datos.
2. Los campos nuevos del parte sanitario son opcionales para no romper los partes existentes.
3. El historial de pacientes se actualiza automáticamente al guardar un parte con DNI.
*/

-- Migrar 'bup' a 'vir' en datos existentes
DO $$
BEGIN
  UPDATE vehiculos_operativos SET tipo = 'vir' WHERE tipo = 'bup';
END $$;

-- Actualizar el constraint de tipo
ALTER TABLE vehiculos_operativos DROP CONSTRAINT IF EXISTS vehiculos_operativos_tipo_check;
ALTER TABLE vehiculos_operativos ADD CONSTRAINT vehiculos_operativos_tipo_check
  CHECK (tipo IN ('vir', 'coordinacion', 'ambulancia', 'logistica', 'otro'));

-- Tabla de asignación de vehículos a servicios
CREATE TABLE IF NOT EXISTS servicio_vehiculos (
  servicio_id uuid NOT NULL REFERENCES servicios(id) ON DELETE CASCADE,
  vehiculo_id uuid NOT NULL REFERENCES vehiculos_operativos(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (servicio_id, vehiculo_id)
);

ALTER TABLE servicio_vehiculos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_vehicles_select_team" ON servicio_vehiculos;
CREATE POLICY "service_vehicles_select_team" ON servicio_vehiculos FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.is_active = true
        AND (p.role <> 'voluntario' OR p.is_approved = true)
    )
  );

DROP POLICY IF EXISTS "service_vehicles_insert_staff" ON servicio_vehiculos;
CREATE POLICY "service_vehicles_insert_staff" ON servicio_vehiculos FOR INSERT
  TO authenticated WITH CHECK (is_admin_or_coordinador());

DROP POLICY IF EXISTS "service_vehicles_delete_staff" ON servicio_vehiculos;
CREATE POLICY "service_vehicles_delete_staff" ON servicio_vehiculos FOR DELETE
  TO authenticated USING (is_admin_or_coordinador());

-- Añadir campos al parte sanitario
ALTER TABLE partes_sanitarios ADD COLUMN IF NOT EXISTS glucemia integer CHECK (glucemia IS NULL OR (glucemia >= 0 AND glucemia <= 999));
ALTER TABLE partes_sanitarios ADD COLUMN IF NOT EXISTS direccion text;
ALTER TABLE partes_sanitarios ADD COLUMN IF NOT EXISTS dni text;
ALTER TABLE partes_sanitarios ADD COLUMN IF NOT EXISTS servicio_id uuid REFERENCES servicios(id) ON DELETE SET NULL;
ALTER TABLE partes_sanitarios ADD COLUMN IF NOT EXISTS vehiculo_id uuid REFERENCES vehiculos_operativos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_medical_reports_servicio ON partes_sanitarios(servicio_id);
CREATE INDEX IF NOT EXISTS idx_medical_reports_dni ON partes_sanitarios(dni) WHERE dni IS NOT NULL;

-- Tabla de historial de pacientes
CREATE TABLE IF NOT EXISTS historial_pacientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_dni text UNIQUE NOT NULL,
  paciente_nombre text,
  paciente_edad integer,
  paciente_telefono text,
  direccion text,
  resumen text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE historial_pacientes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "patient_history_select_team" ON historial_pacientes;
CREATE POLICY "patient_history_select_team" ON historial_pacientes FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.is_active = true
        AND (p.role <> 'voluntario' OR p.is_approved = true)
    )
  );

DROP POLICY IF EXISTS "patient_history_insert_team" ON historial_pacientes;
CREATE POLICY "patient_history_insert_team" ON historial_pacientes FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.is_active = true
        AND (p.role <> 'voluntario' OR p.is_approved = true)
    )
  );

DROP POLICY IF EXISTS "patient_history_update_team" ON historial_pacientes;
CREATE POLICY "patient_history_update_team" ON historial_pacientes FOR UPDATE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.is_active = true
        AND (p.role <> 'voluntario' OR p.is_approved = true)
    )
  );
