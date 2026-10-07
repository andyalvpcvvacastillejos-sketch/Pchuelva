/*
# Protección Civil Huelva - Esquema inicial

## Resumen
Crea el esquema completo para la aplicación de la Agrupación de Voluntarios
de Protección Civil de Huelva con autenticación, roles, servicios preventivos,
alertas de emergencia y comunicaciones.

## Tablas nuevas
1. `profiles` - Perfiles de usuario extendiendo auth.users con rol, indicativo,
   especialidad y datos personales.
2. `servicios` - Servicios preventivos creados por coordinadores con plazas y reservas.
3. `servicio_inscripciones` - Inscripciones de voluntarios en servicios, con estado
   pendiente/titular/reserva/rechazado.
4. `carta_servicio` - Documento privado del servicio con directrices, vehículos y conductores.
5. `alertas` - Alertas de emergencia con nivel, operativa y punto de encuentro.
6. `reuniones` - Reuniones y comunicaciones del grupo.
7. `reunion_respuestas` - Respuestas de asistencia (Asisto/No asisto) a reuniones.
8. `notificaciones` - Notificaciones en pantalla para cada usuario.

## Seguridad
- RLS habilitado en todas las tablas.
- Políticas separadas por operación CRUD.
- Roles: admin_tecnico, coordinador, voluntario.
- Trigger automático crea perfil al registrar usuario.
- Trigger impide cambio de rol a no-administradores.
- Función helper is_admin_or_coordinador() para políticas.

## Notas
1. Los perfiles se crean automáticamente mediante trigger al registrarse.
2. Las cartas de servicio son privadas: solo titulares y coordinadores pueden verlas.
3. Las notificaciones pueden ser creadas por cualquier usuario autenticado
   (para que el coordinador notifique a voluntarios).
*/

-- ============================================================
-- PROFILES
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  nombre text NOT NULL,
  apellidos text NOT NULL,
  role text NOT NULL DEFAULT 'voluntario' CHECK (role IN ('admin_tecnico', 'coordinador', 'voluntario')),
  indicativo text,
  especialidad text,
  telefono text,
  avatar_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read all profiles (needed for assignments, directory)
DROP POLICY IF EXISTS "select_profiles" ON profiles;
CREATE POLICY "select_profiles" ON profiles FOR SELECT
  TO authenticated USING (true);

-- Users can update their own profile (role change blocked by trigger)
DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Only admin can delete profiles
DROP POLICY IF EXISTS "delete_profile_admin" ON profiles;
CREATE POLICY "delete_profile_admin" ON profiles FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin_tecnico')
  );

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================
CREATE OR REPLACE FUNCTION is_admin_or_coordinador()
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('admin_tecnico', 'coordinador')
  );
END;
$$;

-- ============================================================
-- TRIGGERS FOR PROFILES
-- ============================================================

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO profiles (id, email, nombre, apellidos, role, indicativo, especialidad, telefono)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nombre', ''),
    COALESCE(NEW.raw_user_meta_data->>'apellidos', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'voluntario'),
    NEW.raw_user_meta_data->>'indicativo',
    NEW.raw_user_meta_data->>'especialidad',
    NEW.raw_user_meta_data->>'telefono'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Prevent unauthorized role changes
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
  IF current_user_role != 'admin_tecnico' AND NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'No tienes permiso para cambiar el rol de usuario';
  END IF;
  IF current_user_role != 'admin_tecnico' AND NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    RAISE EXCEPTION 'No tienes permiso para cambiar el estado del usuario';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_role_change ON profiles;
CREATE TRIGGER prevent_role_change
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION prevent_unauthorized_role_change();

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_updated_at ON profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- SERVICIOS
-- ============================================================
CREATE TABLE IF NOT EXISTS servicios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  descripcion text,
  fecha timestamptz NOT NULL,
  fecha_fin timestamptz,
  ubicacion text,
  plazas integer NOT NULL DEFAULT 0 CHECK (plazas >= 0),
  reservas_plazas integer NOT NULL DEFAULT 0 CHECK (reservas_plazas >= 0),
  estado text NOT NULL DEFAULT 'abierto' CHECK (estado IN ('abierto', 'cerrado', 'completado', 'cancelado')),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE servicios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_servicios" ON servicios;
CREATE POLICY "select_servicios" ON servicios FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_servicios" ON servicios;
CREATE POLICY "insert_servicios" ON servicios FOR INSERT
  TO authenticated WITH CHECK (is_admin_or_coordinador());

DROP POLICY IF EXISTS "update_servicios" ON servicios;
CREATE POLICY "update_servicios" ON servicios FOR UPDATE
  TO authenticated USING (is_admin_or_coordinador()) WITH CHECK (is_admin_or_coordinador());

DROP POLICY IF EXISTS "delete_servicios" ON servicios;
CREATE POLICY "delete_servicios" ON servicios FOR DELETE
  TO authenticated USING (is_admin_or_coordinador());

DROP TRIGGER IF EXISTS servicios_updated_at ON servicios;
CREATE TRIGGER servicios_updated_at
  BEFORE UPDATE ON servicios
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_servicios_estado ON servicios(estado);
CREATE INDEX IF NOT EXISTS idx_servicios_fecha ON servicios(fecha);

-- ============================================================
-- SERVICIO_INSCRIPCIONES
-- ============================================================
CREATE TABLE IF NOT EXISTS servicio_inscripciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  servicio_id uuid NOT NULL REFERENCES servicios(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'titular', 'reserva', 'rechazado')),
  assigned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(servicio_id, user_id)
);

ALTER TABLE servicio_inscripciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_inscripciones" ON servicio_inscripciones;
CREATE POLICY "select_inscripciones" ON servicio_inscripciones FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_own_inscripcion" ON servicio_inscripciones;
CREATE POLICY "insert_own_inscripcion" ON servicio_inscripciones FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id AND estado = 'pendiente');

DROP POLICY IF EXISTS "update_inscripciones" ON servicio_inscripciones;
CREATE POLICY "update_inscripciones" ON servicio_inscripciones FOR UPDATE
  TO authenticated USING (is_admin_or_coordinador()) WITH CHECK (is_admin_or_coordinador());

DROP POLICY IF EXISTS "delete_own_inscripcion" ON servicio_inscripciones;
CREATE POLICY "delete_own_inscripcion" ON servicio_inscripciones FOR DELETE
  TO authenticated USING (auth.uid() = user_id OR is_admin_or_coordinador());

CREATE INDEX IF NOT EXISTS idx_inscripciones_servicio ON servicio_inscripciones(servicio_id);
CREATE INDEX IF NOT EXISTS idx_inscripciones_user ON servicio_inscripciones(user_id);

-- ============================================================
-- CARTA_SERVICIO
-- ============================================================
CREATE TABLE IF NOT EXISTS carta_servicio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  servicio_id uuid NOT NULL UNIQUE REFERENCES servicios(id) ON DELETE CASCADE,
  directrices text,
  vehiculos jsonb NOT NULL DEFAULT '[]'::jsonb,
  conductores jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE carta_servicio ENABLE ROW LEVEL SECURITY;

-- Only titulares of the service + coordinadores/admin can read
DROP POLICY IF EXISTS "select_carta_servicio" ON carta_servicio;
CREATE POLICY "select_carta_servicio" ON carta_servicio FOR SELECT
  TO authenticated USING (
    is_admin_or_coordinador()
    OR EXISTS (
      SELECT 1 FROM servicio_inscripciones si
      WHERE si.servicio_id = carta_servicio.servicio_id
        AND si.user_id = auth.uid()
        AND si.estado = 'titular'
    )
  );

DROP POLICY IF EXISTS "insert_carta_servicio" ON carta_servicio;
CREATE POLICY "insert_carta_servicio" ON carta_servicio FOR INSERT
  TO authenticated WITH CHECK (is_admin_or_coordinador());

DROP POLICY IF EXISTS "update_carta_servicio" ON carta_servicio;
CREATE POLICY "update_carta_servicio" ON carta_servicio FOR UPDATE
  TO authenticated USING (is_admin_or_coordinador()) WITH CHECK (is_admin_or_coordinador());

DROP POLICY IF EXISTS "delete_carta_servicio" ON carta_servicio;
CREATE POLICY "delete_carta_servicio" ON carta_servicio FOR DELETE
  TO authenticated USING (is_admin_or_coordinador());

DROP TRIGGER IF EXISTS carta_servicio_updated_at ON carta_servicio;
CREATE TRIGGER carta_servicio_updated_at
  BEFORE UPDATE ON carta_servicio
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- ALERTAS
-- ============================================================
CREATE TABLE IF NOT EXISTS alertas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  descripcion text,
  nivel text NOT NULL DEFAULT 'bajo' CHECK (nivel IN ('bajo', 'medio', 'alto', 'critico')),
  operativa text,
  punto_encuentro text,
  estado text NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa', 'inactiva')),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE alertas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_alertas" ON alertas;
CREATE POLICY "select_alertas" ON alertas FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_alertas" ON alertas;
CREATE POLICY "insert_alertas" ON alertas FOR INSERT
  TO authenticated WITH CHECK (is_admin_or_coordinador());

DROP POLICY IF EXISTS "update_alertas" ON alertas;
CREATE POLICY "update_alertas" ON alertas FOR UPDATE
  TO authenticated USING (is_admin_or_coordinador()) WITH CHECK (is_admin_or_coordinador());

DROP POLICY IF EXISTS "delete_alertas" ON alertas;
CREATE POLICY "delete_alertas" ON alertas FOR DELETE
  TO authenticated USING (is_admin_or_coordinador());

DROP TRIGGER IF EXISTS alertas_updated_at ON alertas;
CREATE TRIGGER alertas_updated_at
  BEFORE UPDATE ON alertas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_alertas_estado ON alertas(estado);
CREATE INDEX IF NOT EXISTS idx_alertas_nivel ON alertas(nivel);

-- ============================================================
-- REUNIONES
-- ============================================================
CREATE TABLE IF NOT EXISTS reuniones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  descripcion text,
  fecha timestamptz NOT NULL,
  ubicacion text,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE reuniones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_reuniones" ON reuniones;
CREATE POLICY "select_reuniones" ON reuniones FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_reuniones" ON reuniones;
CREATE POLICY "insert_reuniones" ON reuniones FOR INSERT
  TO authenticated WITH CHECK (is_admin_or_coordinador());

DROP POLICY IF EXISTS "update_reuniones" ON reuniones;
CREATE POLICY "update_reuniones" ON reuniones FOR UPDATE
  TO authenticated USING (is_admin_or_coordinador()) WITH CHECK (is_admin_or_coordinador());

DROP POLICY IF EXISTS "delete_reuniones" ON reuniones;
CREATE POLICY "delete_reuniones" ON reuniones FOR DELETE
  TO authenticated USING (is_admin_or_coordinador());

DROP TRIGGER IF EXISTS reuniones_updated_at ON reuniones;
CREATE TRIGGER reuniones_updated_at
  BEFORE UPDATE ON reuniones
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_reuniones_fecha ON reuniones(fecha);

-- ============================================================
-- REUNION_RESPUESTAS
-- ============================================================
CREATE TABLE IF NOT EXISTS reunion_respuestas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reunion_id uuid NOT NULL REFERENCES reuniones(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  respuesta text NOT NULL CHECK (respuesta IN ('asisto', 'no_asisto')),
  responded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(reunion_id, user_id)
);

ALTER TABLE reunion_respuestas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_respuestas" ON reunion_respuestas;
CREATE POLICY "select_respuestas" ON reunion_respuestas FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_own_respuesta" ON reunion_respuestas;
CREATE POLICY "insert_own_respuesta" ON reunion_respuestas FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_respuesta" ON reunion_respuestas;
CREATE POLICY "update_own_respuesta" ON reunion_respuestas FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_respuesta" ON reunion_respuestas;
CREATE POLICY "delete_own_respuesta" ON reunion_respuestas FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_respuestas_reunion ON reunion_respuestas(reunion_id);

-- ============================================================
-- NOTIFICACIONES
-- ============================================================
CREATE TABLE IF NOT EXISTS notificaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  mensaje text,
  tipo text NOT NULL DEFAULT 'sistema' CHECK (tipo IN ('alerta', 'servicio', 'reunion', 'sistema')),
  read boolean NOT NULL DEFAULT false,
  data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notificaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_notificaciones" ON notificaciones;
CREATE POLICY "select_own_notificaciones" ON notificaciones FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_notificaciones" ON notificaciones;
CREATE POLICY "insert_notificaciones" ON notificaciones FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_own_notificaciones" ON notificaciones;
CREATE POLICY "update_own_notificaciones" ON notificaciones FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_notificaciones" ON notificaciones;
CREATE POLICY "delete_own_notificaciones" ON notificaciones FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_notificaciones_user ON notificaciones(user_id);
CREATE INDEX IF NOT EXISTS idx_notificaciones_read ON notificaciones(read);
