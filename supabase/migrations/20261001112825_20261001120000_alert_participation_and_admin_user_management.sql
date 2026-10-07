/*
# Participación en alertas y gestión administrativa segura de usuarios

## Resumen
Añade la posibilidad de que los voluntarios indiquen que participan en una alerta y permite que coordinadores y administradores técnicos vean esas participaciones.
También prepara permisos de lectura para mostrar participantes y refuerza la gestión administrativa mediante una función de base de datos que valida el rol del usuario que realiza la acción.

## Nuevas tablas
1. `alerta_respuestas`
   - `id`: identificador único.
   - `alerta_id`: alerta a la que responde el voluntario.
   - `user_id`: usuario que participa.
   - `created_at`: momento de la inscripción.
   - Una persona solo puede aparecer una vez por alerta.

## Cambios de seguridad
1. Se activa RLS en `alerta_respuestas`.
2. Todos los usuarios autenticados pueden consultar las respuestas para que el personal pueda ver los participantes.
3. Cada voluntario solo puede crear, modificar o borrar su propia respuesta.
4. Solo se pueden registrar respuestas en alertas activas.
5. Se crea `admin_manage_user`, una función SECURITY DEFINER que solo acepta acciones de coordinadores o administradores técnicos y comprueba las restricciones de rol antes de editar o eliminar un usuario.

## Notas importantes
1. La contraseña nunca se almacena ni se devuelve desde la base de datos; el cambio de contraseña se realiza en el servidor usando la API administrativa de Supabase.
2. El borrado de usuario elimina también sus datos relacionados mediante las relaciones existentes con `auth.users`.
3. La interfaz mostrará mensajes genéricos ante errores administrativos y no expondrá detalles internos de la base de datos.
*/

CREATE TABLE IF NOT EXISTS alerta_respuestas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alerta_id uuid NOT NULL REFERENCES alertas(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (alerta_id, user_id)
);

ALTER TABLE alerta_respuestas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_alerta_respuestas" ON alerta_respuestas;
CREATE POLICY "select_alerta_respuestas" ON alerta_respuestas FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_own_alerta_respuesta" ON alerta_respuestas;
CREATE POLICY "insert_own_alerta_respuesta" ON alerta_respuestas FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM alertas a
      WHERE a.id = alerta_id AND a.estado = 'activa'
    )
  );

DROP POLICY IF EXISTS "update_own_alerta_respuesta" ON alerta_respuestas;
CREATE POLICY "update_own_alerta_respuesta" ON alerta_respuestas FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_alerta_respuesta" ON alerta_respuestas;
CREATE POLICY "delete_own_alerta_respuesta" ON alerta_respuestas FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_alerta_respuestas_alerta ON alerta_respuestas(alerta_id);
CREATE INDEX IF NOT EXISTS idx_alerta_respuestas_user ON alerta_respuestas(user_id);

CREATE OR REPLACE FUNCTION admin_manage_user(
  p_user_id uuid,
  p_action text,
  p_role text DEFAULT NULL,
  p_is_active boolean DEFAULT NULL,
  p_is_approved boolean DEFAULT NULL,
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
  target_role text;
BEGIN
  SELECT role INTO caller_role FROM profiles WHERE id = auth.uid();
  IF caller_role IS NULL OR caller_role NOT IN ('admin_tecnico', 'coordinador') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_action NOT IN ('update', 'delete') THEN
    RAISE EXCEPTION 'Invalid action';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot manage own account';
  END IF;

  SELECT role INTO target_role FROM profiles WHERE id = p_user_id;
  IF target_role IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  IF caller_role = 'coordinador' AND target_role = 'admin_tecnico' THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_action = 'delete' THEN
    DELETE FROM auth.users WHERE id = p_user_id;
    RETURN;
  END IF;

  IF p_role IS NOT NULL AND p_role NOT IN ('admin_tecnico', 'coordinador', 'voluntario') THEN
    RAISE EXCEPTION 'Invalid role';
  END IF;

  IF caller_role = 'coordinador' AND p_role = 'admin_tecnico' THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE profiles SET
    role = COALESCE(p_role, role),
    is_active = COALESCE(p_is_active, is_active),
    is_approved = COALESCE(p_is_approved, is_approved),
    nombre = COALESCE(p_nombre, nombre),
    apellidos = COALESCE(p_apellidos, apellidos),
    indicativo = COALESCE(p_indicativo, indicativo),
    especialidad = COALESCE(p_especialidad, especialidad),
    telefono = COALESCE(p_telefono, telefono),
    updated_at = now()
  WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION admin_manage_user(uuid, text, text, boolean, boolean, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_manage_user(uuid, text, text, boolean, boolean, text, text, text, text, text) TO authenticated;
