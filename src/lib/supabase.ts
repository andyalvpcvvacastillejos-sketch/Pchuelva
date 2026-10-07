import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export type UserRole = 'admin_tecnico' | 'coordinador' | 'voluntario';
export type GroupingRole = 'jefe_agrupacion' | 'subjefe_agrupacion' | 'responsable_logistica' | 'responsable_sanitaria' | 'responsable_parque_movil' | 'responsable_tecnologia_telecomunicaciones' | 'voluntario';

export interface Profile {
  id: string;
  email: string;
  nombre: string;
  apellidos: string;
  role: UserRole;
  indicativo: string | null;
  especialidad: string | null;
  telefono: string | null;
  avatar_url: string | null;
  dni: string | null;
  agrupacion_role: GroupingRole;
  is_active: boolean;
  is_approved: boolean;
  created_at: string;
  updated_at: string;
}

export interface Servicio {
  id: string;
  titulo: string;
  descripcion: string | null;
  fecha: string;
  fecha_fin: string | null;
  fecha_limite_inscripcion: string | null;
  ubicacion: string | null;
  plazas: number;
  reservas_plazas: number;
  estado: 'abierto' | 'cerrado' | 'completado' | 'cancelado';
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ServicioInscripcion {
  id: string;
  servicio_id: string;
  user_id: string;
  estado: 'pendiente' | 'titular' | 'reserva' | 'rechazado';
  assigned_at: string | null;
  created_at: string;
  profile?: Profile;
}

export interface CartaServicio {
  id: string;
  servicio_id: string;
  directrices: string | null;
  vehiculos: { tipo: string; matricula: string; }[];
  conductores: { nombre: string; licencia: string; }[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Alerta {
  id: string;
  titulo: string;
  descripcion: string | null;
  nivel: 'bajo' | 'medio' | 'alto' | 'critico';
  operativa: string | null;
  punto_encuentro: string | null;
  estado: 'activa' | 'inactiva';
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Reunion {
  id: string;
  titulo: string;
  descripcion: string | null;
  fecha: string;
  ubicacion: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AlertaRespuesta {
  id: string;
  alerta_id: string;
  user_id: string;
  created_at: string;
  profile?: Profile;
}

export interface ReunionRespuesta {
  id: string;
  reunion_id: string;
  user_id: string;
  respuesta: 'asisto' | 'no_asisto';
  responded_at: string;
  profile?: Profile;
}

export type IncidentCategory = 'urgente_refuerzos' | 'sanitaria' | 'trafico_via_publica' | 'aviso_general';
export type PoiCategory = 'socorro_encuentro' | 'hidrante' | 'riesgo_evacuacion';
export type VehicleType = 'vir' | 'coordinacion' | 'ambulancia' | 'logistica' | 'otro';
export type VehicleStatus = 'en_base' | 'en_ruta' | 'en_incidencia';
export type RouteType = 'procesion' | 'carrera_popular' | 'manifestacion' | 'otro';
export type WaypointType = 'recorrido' | 'pk_critico' | 'corte_trafico' | 'retene';
export type AvpuLevel = 'alerta' | 'voz' | 'dolor' | 'inconsciente';
export type MedicalResolution = 'alta_lugar' | 'derivacion_centro' | 'ambulancia_uvi';

export interface OperativeIncident {
  id: string;
  user_id: string;
  categoria: IncidentCategory;
  descripcion: string;
  latitud: number | null;
  longitud: number | null;
  foto_path: string | null;
  estado: 'abierta' | 'en_seguimiento' | 'resuelta';
  created_at: string;
}

export interface OperationalPoi {
  id: string;
  nombre: string;
  descripcion: string | null;
  categoria: PoiCategory;
  latitud: number;
  longitud: number;
  created_by: string;
  is_active: boolean;
  created_at: string;
}

export interface Notificacion {
  id: string;
  user_id: string;
  titulo: string;
  mensaje: string | null;
  tipo: 'alerta' | 'servicio' | 'reunion' | 'sistema';
  read: boolean;
  data: Record<string, unknown>;
  created_at: string;
}

export interface OperationalVehicle {
  id: string;
  nombre: string;
  tipo: VehicleType;
  estado: VehicleStatus;
  latitud: number | null;
  longitud: number | null;
  updated_at: string;
  created_by: string;
  is_active: boolean;
  created_at: string;
}

export interface SpecialRoute {
  id: string;
  nombre: string;
  tipo: RouteType;
  fecha: string;
  descripcion: string | null;
  created_by: string;
  is_active: boolean;
  created_at: string;
}

export interface RouteWaypoint {
  id: string;
  ruta_id: string;
  orden: number;
  tipo: WaypointType;
  latitud: number;
  longitud: number;
  etiqueta: string | null;
  created_at: string;
}

export interface MedicalReport {
  id: string;
  incident_id: string;
  user_id: string;
  paciente_nombre: string | null;
  paciente_edad: number | null;
  paciente_telefono: string | null;
  paciente_dni: string | null;
  direccion: string | null;
  motivo_asistencia: string;
  fc: number | null;
  tas: number | null;
  tad: number | null;
  spo2: number | null;
  temperatura: number | null;
  glucemia: number | null;
  nivel_conciencia: AvpuLevel | null;
  tratamiento: string | null;
  resolucion: MedicalResolution;
  servicio_id: string | null;
  vehiculo_id: string | null;
  created_at: string;
}

export interface ServicioVehiculo {
  servicio_id: string;
  vehiculo_id: string;
  assigned_at: string;
}

export interface PatientHistory {
  id: string;
  paciente_dni: string;
  paciente_nombre: string | null;
  paciente_edad: number | null;
  paciente_telefono: string | null;
  direccion: string | null;
  resumen: string | null;
  created_at: string;
  updated_at: string;
}
