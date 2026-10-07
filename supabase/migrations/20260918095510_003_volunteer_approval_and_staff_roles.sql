/*
# Aprobación de voluntarios y permisos de roles de personal

## Cambios
1. Añade columna `is_approved` (boolean, default false) a la tabla `profiles`.
   Los nuevos voluntarios quedan pendientes de aprobación hasta que un
   coordinador o administrador técnico los apruebe.
2. Modifica la función `update_profile_as_admin` para que también pueda
   aprobar/rechazar voluntarios (is_approved) y para que coordinadores
   también puedan usarla (no solo admin_tecnico).
3. Crea función `approve_volunteer` que aprueba un voluntario.
4. Crea función `reject_volunteer` que desactiva un voluntario.
5. Crea función `create_staff_account` que permite al coordinador crear un
   administrador técnico y viceversa.
6. Modifica el trigger `handle_new_user` para que los voluntarios se creen con
   is_approved=false (pendientes), pero los coordinadores y admin_tecnico con
   is_approved=true (auto-aprobados).
7. Actualiza voluntarios existentes a is_approved=true para no bloquearlos.
*/

-- ============================================================
-- Add is_approved column
-- ============================================================
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_approved boolean NOT NULL DEFAULT false;

-- ============================================================
-- Update handle_new_user trigger: volunteers pending, staff auto-approved
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_is_approved boolean;
BEGIN
  v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'voluntario');
  IF v_role IN ('admin_tecnico', 'coordinador') THEN
    v_is_approved := true;
  ELSE
    v_is_approved := false;
  END IF;

  INSERT INTO profiles (id, email, nombre, apellidos, role, indicativo, especialidad, telefono, is_approved)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nombre', ''),
    COALESCE(NEW.raw_user_meta_data->>'apellidos', ''),
    v_role,
    NEW.raw_user_meta_data->>'indicativo',
    NEW.raw_user_meta_data->>'especialidad',
    NEW.raw_user_meta_data->>'telefono',
    v_is_approved
  );
  RETURN NEW;
END;
$$;

-- ============================================================
-- Drop old update_profile_as_admin and recreate with new signature
-- ============================================================
DROP FUNCTION IF EXISTS update_profile_as_admin(uuid, text, boolean, text, text, text, text, text) CASCADE;
DROP FUNCTION IF EXISTS update_profile_as_admin(uuid, text, boolean, boolean, text, text, text, text, text, text) CASCADE;

CREATE OR REPLACE FUNCTION update_profile_as_admin(
  p_user_id uuid,
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
    RAISE EXCEPTION 'Solo coordinadores y administradores técnicos pueden usar esta función';
  END IF;

  -- Coordinadores no pueden cambiar roles a admin_tecnico
  IF p_role IS NOT NULL AND caller_role = 'coordinador' AND p_role = 'admin_tecnico' THEN
    RAISE EXCEPTION 'Los coordinadores no pueden asignar el rol de administrador técnico';
  END IF;

  -- Coordinadores no pueden desactivar a admin_tecnico
  SELECT role INTO target_role FROM profiles WHERE id = p_user_id;
  IF caller_role = 'coordinador' AND target_role = 'admin_tecnico' AND p_is_active IS NOT NULL THEN
    RAISE EXCEPTION 'Los coordinadores no pueden modificar el estado de un administrador técnico';
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

-- ============================================================
-- Approve volunteer function
-- ============================================================
CREATE OR REPLACE FUNCTION approve_volunteer(p_user_id uuid)
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
    RAISE EXCEPTION 'Solo coordinadores y administradores técnicos pueden aprobar voluntarios';
  END IF;

  UPDATE profiles SET is_approved = true, is_active = true, updated_at = now()
  WHERE id = p_user_id AND role = 'voluntario';

  INSERT INTO notificaciones (user_id, titulo, mensaje, tipo, data)
  VALUES (p_user_id, 'Cuenta aprobada', 'Tu cuenta ha sido aprobada. Ya puedes acceder a la aplicación.', 'sistema', '{}'::jsonb);
END;
$$;

-- ============================================================
-- Reject volunteer function
-- ============================================================
CREATE OR REPLACE FUNCTION reject_volunteer(p_user_id uuid)
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
    RAISE EXCEPTION 'Solo coordinadores y administradores técnicos pueden rechazar voluntarios';
  END IF;

  UPDATE profiles SET is_approved = false, is_active = false, updated_at = now()
  WHERE id = p_user_id AND role = 'voluntario';

  INSERT INTO notificaciones (user_id, titulo, mensaje, tipo, data)
  VALUES (p_user_id, 'Cuenta rechazada', 'Tu solicitud de registro ha sido rechazada. Contacta con el coordinador.', 'sistema', '{}'::jsonb);
END;
$$;

-- ============================================================
-- Create staff account function
-- Allows coordinador to create admin_tecnico and viceversa
-- ============================================================
CREATE OR REPLACE FUNCTION create_staff_account(
  p_email text,
  p_password text,
  p_nombre text,
  p_apellidos text,
  p_role text,
  p_telefono text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role text;
  new_user_id uuid;
BEGIN
  SELECT role INTO caller_role FROM profiles WHERE id = auth.uid();
  IF caller_role IS NULL OR caller_role NOT IN ('admin_tecnico', 'coordinador') THEN
    RAISE EXCEPTION 'Solo coordinadores y administradores técnicos pueden crear cuentas de personal';
  END IF;

  -- Coordinador can only create admin_tecnico; admin_tecnico can only create coordinador
  IF caller_role = 'coordinador' AND p_role != 'admin_tecnico' THEN
    RAISE EXCEPTION 'Los coordinadores solo pueden crear cuentas de administrador técnico';
  END IF;
  IF caller_role = 'admin_tecnico' AND p_role != 'coordinador' THEN
    RAISE EXCEPTION 'Los administradores técnicos solo pueden crear cuentas de coordinador';
  END IF;

  -- Insert into auth.users with encrypted password
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    raw_app_meta_data,
    raw_user_meta_data
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    p_email,
    crypt(p_password, gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object(
      'nombre', p_nombre,
      'apellidos', p_apellidos,
      'role', p_role,
      'telefono', p_telefono
    )
  ) RETURNING id INTO new_user_id;

  -- The handle_new_user trigger will create the profile automatically
  -- But we need to set is_approved=true for staff
  UPDATE profiles SET is_approved = true, is_active = true, telefono = COALESCE(p_telefono, telefono)
  WHERE id = new_user_id;

  RETURN new_user_id;
END;
$$;

-- ============================================================
-- Grant execute permissions
-- ============================================================
GRANT EXECUTE ON FUNCTION approve_volunteer(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION reject_volunteer(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION update_profile_as_admin TO authenticated;
GRANT EXECUTE ON FUNCTION create_staff_account TO authenticated;

-- ============================================================
-- Update prevent_unauthorized_role_change to allow coordinador
-- to manage volunteer approval (is_approved and is_active)
-- ============================================================
CREATE OR REPLACE FUNCTION prevent_unauthorized_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_role text;
BEGIN
  SELECT role INTO current_user_role FROM profiles WHERE id = auth.uid();
  IF current_user_role IS NULL THEN
    RETURN NEW;
  END IF;

  -- Only admin_tecnico can change roles
  IF current_user_role != 'admin_tecnico' AND NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'No tienes permiso para cambiar el rol de usuario';
  END IF;

  -- Only admin_tecnico and coordinador can change is_active
  IF current_user_role NOT IN ('admin_tecnico', 'coordinador') AND NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    RAISE EXCEPTION 'No tienes permiso para cambiar el estado del usuario';
  END IF;

  -- Only admin_tecnico and coordinador can change is_approved
  IF current_user_role NOT IN ('admin_tecnico', 'coordinador') AND NEW.is_approved IS DISTINCT FROM OLD.is_approved THEN
    RAISE EXCEPTION 'No tienes permiso para aprobar usuarios';
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================
-- Update existing volunteer profiles to is_approved=true
-- (so current volunteers are not locked out)
-- ============================================================
UPDATE profiles SET is_approved = true WHERE role = 'voluntario' AND is_active = true;
