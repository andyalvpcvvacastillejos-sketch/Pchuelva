/*
# Corregir política de eliminación de waypoints de ruta

## Resumen
La política de eliminación de waypoints requería que el usuario fuera el creador de la ruta (created_by = auth.uid()),
lo que impedía que otros coordinadores o administradores eliminaran puntos de rutas que no crearon.

## Cambios
1. Elimina la política anterior de DELETE en ruta_waypoints.
2. Crea una nueva política que solo requiere is_admin_or_coordinador(), sin restricción de autoría.
*/

DROP POLICY IF EXISTS "route_waypoints_delete_staff" ON ruta_waypoints;
CREATE POLICY "route_waypoints_delete_staff" ON ruta_waypoints FOR DELETE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM rutas_especiales r
      WHERE r.id = ruta_waypoints.ruta_id
        AND is_admin_or_coordinador()
    )
  );
