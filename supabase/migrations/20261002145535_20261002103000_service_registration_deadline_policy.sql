/*
# Validación de fecha límite de inscripción

## Resumen
Hace que la fecha límite de inscripción de un servicio se cumpla en el servidor y no solo en la pantalla.

## Cambios
1. Actualiza la política de INSERT de `servicio_inscripciones`.
2. Solo permite nuevas inscripciones cuando el servicio está abierto.
3. Si existe una fecha límite, bloquea la inscripción cuando ya ha pasado.
4. Mantiene la exigencia de que cada persona solo pueda inscribirse en su propio nombre y con estado pendiente.

## Seguridad
La validación está en RLS, por lo que también se aplica a llamadas directas a Supabase que no pasen por la interfaz.
*/

DROP POLICY IF EXISTS "insert_own_inscripcion" ON servicio_inscripciones;
CREATE POLICY "insert_own_inscripcion" ON servicio_inscripciones FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND estado = 'pendiente'
    AND EXISTS (
      SELECT 1
      FROM servicios s
      WHERE s.id = servicio_id
        AND s.estado = 'abierto'
        AND (
          s.fecha_limite_inscripcion IS NULL
          OR now() <= s.fecha_limite_inscripcion
        )
    )
  );
