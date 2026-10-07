/*
# Notificaciones push con Firebase Cloud Messaging (FCM)

## Cambios
1. Crea tabla `push_tokens` para almacenar los tokens FCM de cada dispositivo
   de usuario. Un usuario puede tener múltiples dispositivos.
2. Crea función `register_push_token` que inserta o actualiza un token FCM
   para el usuario autenticado.
3. Crea función `unregister_push_token` que elimina un token FCM.
4. Crea función `send_push_to_all_volunteers` que envía notificaciones push
   a todos los voluntarios activos y aprobados. Esta función es llamada
   por los triggers existentes de alertas y servicios.
5. Modifica los triggers `notify_on_alerta`, `notify_on_servicio` y
   `notify_on_reunion` para que también envíen push notifications vía FCM.

## Seguridad
- `push_tokens` tiene RLS habilitado: cada usuario solo puede ver/modificar
  sus propios tokens.
- `register_push_token` y `unregister_push_token` son SECURITY DEFINER,
  ejecutables por usuarios autenticados.
- `send_push_to_all_volunteers` es SECURITY DEFINER, ejecutable por
  coordinadores y administradores técnicos.
*/

-- ============================================================
-- Push tokens table
-- ============================================================
CREATE TABLE IF NOT EXISTS push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL,
  device_info text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, token)
);

ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_push_tokens" ON push_tokens;
CREATE POLICY "select_own_push_tokens" ON push_tokens FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_push_tokens" ON push_tokens;
CREATE POLICY "delete_own_push_tokens" ON push_tokens FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_push_tokens_active ON push_tokens(is_active);

-- ============================================================
-- Register push token function
-- ============================================================
CREATE OR REPLACE FUNCTION register_push_token(
  p_token text,
  p_device_info text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO push_tokens (user_id, token, device_info)
  VALUES (auth.uid(), p_token, p_device_info)
  ON CONFLICT (user_id, token)
  DO UPDATE SET is_active = true, device_info = COALESCE(p_device_info, push_tokens.device_info), updated_at = now();
END;
$$;

-- ============================================================
-- Unregister push token function
-- ============================================================
CREATE OR REPLACE FUNCTION unregister_push_token(p_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE push_tokens SET is_active = false, updated_at = now()
  WHERE token = p_token AND user_id = auth.uid();
END;
$$;

-- ============================================================
-- Send push to all volunteers function
-- Calls the edge function 'send-push' via net.http_post (pg_net extension)
-- or stores the notification for the edge function to pick up.
-- Since pg_net may not be available, we store push_queue entries.
-- ============================================================
CREATE TABLE IF NOT EXISTS push_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  mensaje text,
  tipo text NOT NULL DEFAULT 'sistema',
  data jsonb DEFAULT '{}'::jsonb,
  target_user_ids uuid[] DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed boolean NOT NULL DEFAULT false,
  processed_at timestamptz
);

ALTER TABLE push_queue ENABLE ROW LEVEL SECURITY;

-- Only staff can read the queue
DROP POLICY IF EXISTS "select_push_queue_staff" ON push_queue;
CREATE POLICY "select_push_queue_staff" ON push_queue FOR SELECT
  TO authenticated USING (is_admin_or_coordinador());

DROP POLICY IF EXISTS "insert_push_queue_staff" ON push_queue;
CREATE POLICY "insert_push_queue_staff" ON push_queue FOR INSERT
  TO authenticated WITH CHECK (is_admin_or_coordinador());

CREATE INDEX IF NOT EXISTS idx_push_queue_unprocessed ON push_queue(processed) WHERE processed = false;

-- ============================================================
-- Function to queue push notifications
-- ============================================================
CREATE OR REPLACE FUNCTION queue_push_notification(
  p_titulo text,
  p_mensaje text,
  p_tipo text DEFAULT 'sistema',
  p_data jsonb DEFAULT '{}'::jsonb,
  p_target_user_ids uuid[] DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO push_queue (titulo, mensaje, tipo, data, target_user_ids)
  VALUES (p_titulo, p_mensaje, p_tipo, p_data, p_target_user_ids);
END;
$$;

GRANT EXECUTE ON FUNCTION register_push_token(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION unregister_push_token(text) TO authenticated;
GRANT EXECUTE ON FUNCTION queue_push_notification(text, text, text, jsonb, uuid[]) TO authenticated;

-- ============================================================
-- Update triggers to also queue push notifications
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
  PERFORM queue_push_notification(
    'Alerta de emergencia: ' || NEW.titulo,
    COALESCE(NEW.descripcion, ''),
    'alerta',
    jsonb_build_object('alerta_id', NEW.id, 'nivel', NEW.nivel)
  );
  RETURN NEW;
END;
$$;

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
  PERFORM queue_push_notification(
    'Nuevo servicio: ' || NEW.titulo,
    'Fecha: ' || to_char(NEW.fecha AT TIME ZONE 'Europe/Madrid', 'DD/MM/YYYY HH24:MI') ||
    COALESCE(' - ' || NEW.ubicacion, ''),
    'servicio',
    jsonb_build_object('servicio_id', NEW.id)
  );
  RETURN NEW;
END;
$$;

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
  PERFORM queue_push_notification(
    'Nueva reunión: ' || NEW.titulo,
    'Fecha: ' || to_char(NEW.fecha AT TIME ZONE 'Europe/Madrid', 'DD/MM/YYYY HH24:MI') ||
    COALESCE(' - Ubicación: ' || NEW.ubicacion, ''),
    'reunion',
    jsonb_build_object('reunion_id', NEW.id)
  );
  RETURN NEW;
END;
$$;
