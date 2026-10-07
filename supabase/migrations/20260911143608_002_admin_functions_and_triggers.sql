/*
# Funciones de administrador y triggers de notificaciones

## Cambios
1. Crea función `update_profile_as_admin` que permite al administrador técnico
   actualizar el rol y estado de cualquier usuario (evitando el trigger que
   bloquea cambios de rol a no-administradores).
2. Crea función `notify_all_volunteers` que inserta notificaciones para todos
   los voluntarios activos.
3. Crea triggers que generan notificaciones automáticas cuando:
   - Se crea una alerta de emergencia
   - Se crea una reunión
   - Un coordinador asigna titulares/reservas en un servicio

## Seguridad
- `update_profile_as_admin` es SECURITY DEFINER, solo ejecutable por admin_tecnico.
- `notify_all_volunteers` es SECURITY DEFINER, ejecutable por coordinadores/admin.
*/

-- ============================================================
-- Admin profile update function
-- ============================================================
CREATE OR REPLACE FUNCTION update_profile_as_admin(
  p_user_id uuid,
  p_role text DEFAULT NULL,
  p_is_active boolean DEFAULT NULL,
  p_nombre text DEFAULT NULL,
  p_apellidos text DEFAULT NULL,
  p_indicativo text DEFAULT NULL,
  p_especialidad text DEFAULT NULL,
  p_telefono text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role text;
BEGIN
  SELECT role INTO caller_role FROM profiles WHERE id = auth.uid();
  IF caller_role IS NULL OR caller_role != 'admin_tecnico' THEN
    RAISE EXCEPTION 'Solo el administrador técnico puede usar esta función';
  END IF;

  UPDATE profiles SET
    role = COALESCE(p_role, role),
    is_active = COALESCE(p_is_active, is_active),
    nombre = COALESCE(p_nombre, nombre),
    apellidos = COALESCE(p_apellidos, apellidos),
    indicativo = COALESCE(p_indicativo, indicativo),
    especialidad = COALESCE(p_especialidad, especialidad),
    telefono = COALESCE(p_telefono, telefono),
    updated_at = now()
  WHERE id = p_user_id;
END;
$$;

-- ============================================================
-- Notify all volunteers function
-- ============================================================
CREATE OR REPLACE FUNCTION notify_all_volunteers(
  p_titulo text,
  p_mensaje text,
  p_tipo text DEFAULT 'sistema',
  p_data jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin_or_coordinador() THEN
    RAISE EXCEPTION 'Solo coordinadores y administradores pueden enviar notificaciones';
  END IF;

  INSERT INTO notificaciones (user_id, titulo, mensaje, tipo, data)
  SELECT id, p_titulo, p_mensaje, p_tipo, p_data
  FROM profiles
  WHERE is_active = true AND id != auth.uid();
END;
$$;

-- ============================================================
-- Notify specific user function
-- ============================================================
CREATE OR REPLACE FUNCTION notify_user(
  p_user_id uuid,
  p_titulo text,
  p_mensaje text,
  p_tipo text DEFAULT 'sistema',
  p_data jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin_or_coordinador() THEN
    RAISE EXCEPTION 'Solo coordinadores y administradores pueden enviar notificaciones';
  END IF;

  INSERT INTO notificaciones (user_id, titulo, mensaje, tipo, data)
  VALUES (p_user_id, p_titulo, p_mensaje, p_tipo, p_data);
END;
$$;

-- ============================================================
-- Trigger: notify on new alerta
-- ============================================================
CREATE OR REPLACE FUNCTION notify_on_alerta()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM notify_all_volunteers(
    'Alerta de emergencia: ' || NEW.titulo,
    NEW.descripcion,
    'alerta',
    jsonb_build_object('alerta_id', NEW.id, 'nivel', NEW.nivel)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_alerta_created ON alertas;
CREATE TRIGGER on_alerta_created
  AFTER INSERT ON alertas
  FOR EACH ROW EXECUTE FUNCTION notify_on_alerta();

-- ============================================================
-- Trigger: notify on new reunion
-- ============================================================
CREATE OR REPLACE FUNCTION notify_on_reunion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM notify_all_volunteers(
    'Nueva reunión: ' || NEW.titulo,
    'Fecha: ' || to_char(NEW.fecha AT TIME ZONE 'Europe/Madrid', 'DD/MM/YYYY HH24:MI') ||
    COALESCE(' - Ubicación: ' || NEW.ubicacion, ''),
    'reunion',
    jsonb_build_object('reunion_id', NEW.id)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_reunion_created ON reuniones;
CREATE TRIGGER on_reunion_created
  AFTER INSERT ON reuniones
  FOR EACH ROW EXECUTE FUNCTION notify_on_reunion();

-- ============================================================
-- Trigger: notify on inscripcion assignment change
-- ============================================================
CREATE OR REPLACE FUNCTION notify_on_assignment_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.estado IS DISTINCT FROM OLD.estado AND NEW.estado IN ('titular', 'reserva', 'rechazado') THEN
    PERFORM notify_user(
      NEW.user_id,
      'Actualización de servicio',
      'Tu inscripción ha sido actualizada a: ' ||
      CASE NEW.estado WHEN 'titular' THEN 'Titular' WHEN 'reserva' THEN 'Reserva' WHEN 'rechazado' THEN 'Rechazado' END,
      'servicio',
      jsonb_build_object('servicio_id', NEW.servicio_id, 'estado', NEW.estado)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_assignment_change ON servicio_inscripciones;
CREATE TRIGGER on_assignment_change
  AFTER UPDATE ON servicio_inscripciones
  FOR EACH ROW EXECUTE FUNCTION notify_on_assignment_change();

-- ============================================================
-- Trigger: notify on new servicio
-- ============================================================
CREATE OR REPLACE FUNCTION notify_on_servicio()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM notify_all_volunteers(
    'Nuevo servicio: ' || NEW.titulo,
    'Fecha: ' || to_char(NEW.fecha AT TIME ZONE 'Europe/Madrid', 'DD/MM/YYYY HH24:MI') ||
    COALESCE(' - ' || NEW.ubicacion, ''),
    'servicio',
    jsonb_build_object('servicio_id', NEW.id)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_servicio_created ON servicios;
CREATE TRIGGER on_servicio_created
  AFTER INSERT ON servicios
  FOR EACH ROW EXECUTE FUNCTION notify_on_servicio();
