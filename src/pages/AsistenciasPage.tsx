import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, Calendar, FileText, MapPin, RefreshCw, Stethoscope, Trash2, User } from 'lucide-react';
import { supabase, type MedicalReport } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Badge } from '@/components/ui/Badge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Spinner } from '@/components/ui/Spinner';

interface ReportWithRelations extends MedicalReport {
  servicio_titulo?: string;
  vehiculo_nombre?: string;
  incident_descripcion?: string;
  incident_latitud?: number | null;
  incident_longitud?: number | null;
}

const resolutionLabels: Record<string, string> = {
  alta_lugar: 'Alta en el lugar',
  derivacion_centro: 'Derivación a centro',
  ambulancia_uvi: 'Ambulancia UVI',
};

const resolutionVariants: Record<string, 'success' | 'warning' | 'error'> = {
  alta_lugar: 'success',
  derivacion_centro: 'warning',
  ambulancia_uvi: 'error',
};

export function AsistenciasPage() {
  const { profile } = useAuth();
  const isStaff = profile?.role === 'admin_tecnico' || profile?.role === 'coordinador';
  const [reports, setReports] = useState<ReportWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterServicio, setFilterServicio] = useState<string>('all');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('partes_sanitarios')
      .select(`
        *,
        incidencias_operativas (descripcion, latitud, longitud),
        servicios (titulo),
        vehiculos_operativos (nombre)
      `)
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      setReports([]);
      setLoading(false);
      return;
    }

    const enriched = (data ?? []).map((r: Record<string, unknown>) => ({
      ...(r as unknown as MedicalReport),
      servicio_titulo: (r.servicios as { titulo?: string } | null)?.titulo,
      vehiculo_nombre: (r.vehiculos_operativos as { nombre?: string } | null)?.nombre,
      incident_descripcion: (r.incidencias_operativas as { descripcion?: string } | null)?.descripcion,
      incident_latitud: (r.incidencias_operativas as { latitud?: number } | null)?.latitud ?? null,
      incident_longitud: (r.incidencias_operativas as { longitud?: number } | null)?.longitud ?? null,
    }));

    setReports(enriched);
    setLoading(false);
  }, []);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await supabase.from('partes_sanitarios').delete().eq('id', deleteTarget);
    setDeleteTarget(null);
    fetchReports();
  };

  const groupedByServicio = useMemo(() => {
    const groups: Record<string, { serviceName: string; reports: ReportWithRelations[] }> = {};
    for (const r of reports) {
      const key = r.servicio_id ?? 'sin_servicio';
      const name = r.servicio_titulo ?? 'Sin servicio asociado';
      if (!groups[key]) groups[key] = { serviceName: name, reports: [] };
      groups[key].reports.push(r);
    }
    return groups;
  }, [reports]);

  const filteredKeys = filterServicio === 'all' ? Object.keys(groupedByServicio) : [filterServicio];
  const totalReports = filterServicio === 'all' ? reports.length : (groupedByServicio[filterServicio]?.reports.length ?? 0);

  return (
    <div className="px-4 py-4 max-w-3xl mx-auto space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-600">Gestión sanitaria</p>
          <h1 className="text-xl font-bold text-gray-900">Historial de asistencias</h1>
          <p className="text-sm text-gray-500 mt-1">Partes de asistencia sanitaria ordenados por servicio.</p>
        </div>
        <div className="w-10 h-10 rounded-xl bg-yellow-100 text-yellow-700 flex items-center justify-center"><Stethoscope size={22} /></div>
      </div>

      <div className="card p-3 flex items-center gap-2 flex-wrap">
        <p className="text-xs font-semibold text-gray-700 flex-shrink-0">Filtrar:</p>
        <button onClick={() => setFilterServicio('all')} className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${filterServicio === 'all' ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'}`}>Todos</button>
        {Object.entries(groupedByServicio).map(([key, group]) => (
          <button key={key} onClick={() => setFilterServicio(key)} className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${filterServicio === key ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'}`}>{group.serviceName} ({group.reports.length})</button>
        ))}
        <button onClick={fetchReports} className="p-2 rounded-lg text-primary-600 hover:bg-primary-50 ml-auto" aria-label="Actualizar"><RefreshCw size={16} /></button>
      </div>

      <div className="flex items-center gap-2 text-xs text-gray-400">
        <FileText size={14} /> {loading ? 'Cargando…' : `${totalReports} partes de asistencia`}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size={28} /></div>
      ) : reports.length === 0 ? (
        <div className="card p-8 text-center">
          <Stethoscope size={36} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-gray-400">No hay partes de asistencia sanitaria registrados.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {filteredKeys.map((key) => {
            const group = groupedByServicio[key];
            if (!group) return null;
            return (
              <div key={key} className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-primary-100 text-primary-700 flex items-center justify-center"><Activity size={16} /></div>
                  <div>
                    <h2 className="text-sm font-bold text-gray-900">{group.serviceName}</h2>
                    <p className="text-[11px] text-gray-400">{group.reports.length} asistencia(s)</p>
                  </div>
                </div>
                <div className="space-y-2">
                  {group.reports.map((r) => (
                    <div key={r.id} className="card p-3.5 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-yellow-700 bg-yellow-50 rounded-lg px-2 py-0.5 flex items-center gap-1"><Calendar size={12} /> {new Date(r.created_at).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={resolutionVariants[r.resolucion] ?? 'gray'}>{resolutionLabels[r.resolucion] ?? r.resolucion}</Badge>
                          {isStaff && <button onClick={() => setDeleteTarget(r.id)} className="p-1.5 rounded-lg text-error-500 hover:bg-error-50 transition-colors" title="Eliminar parte"><Trash2 size={15} /></button>}
                        </div>
                      </div>
                      <p className="text-sm text-gray-800">{r.motivo_asistencia}</p>
                      {r.paciente_nombre && <p className="text-xs text-gray-500 flex items-center gap-1"><User size={12} /> {r.paciente_nombre}{r.paciente_edad ? `, ${r.paciente_edad} años` : ''}{r.paciente_dni ? ` · DNI: ${r.paciente_dni}` : ''}</p>}
                      {r.direccion && <p className="text-xs text-gray-500 flex items-center gap-1"><MapPin size={12} /> {r.direccion}</p>}
                      {r.incident_latitud != null && r.incident_longitud != null && <p className="text-[11px] text-gray-400 flex items-center gap-1"><MapPin size={11} /> {r.incident_latitud.toFixed(5)}, {r.incident_longitud.toFixed(5)}</p>}
                      {(r.fc || r.tas || r.spo2 || r.temperatura || r.glucemia) && (
                        <div className="flex flex-wrap gap-1.5">
                          {r.fc && <span className="text-[10px] bg-gray-100 rounded px-1.5 py-0.5 text-gray-600">FC: {r.fc}</span>}
                          {r.tas && r.tad && <span className="text-[10px] bg-gray-100 rounded px-1.5 py-0.5 text-gray-600">TA: {r.tas}/{r.tad}</span>}
                          {r.spo2 && <span className="text-[10px] bg-gray-100 rounded px-1.5 py-0.5 text-gray-600">SpO2: {r.spo2}%</span>}
                          {r.temperatura && <span className="text-[10px] bg-gray-100 rounded px-1.5 py-0.5 text-gray-600">Temp: {r.temperatura}°C</span>}
                          {r.glucemia && <span className="text-[10px] bg-gray-100 rounded px-1.5 py-0.5 text-gray-600">Glu: {r.glucemia}</span>}
                          {r.nivel_conciencia && <span className="text-[10px] bg-gray-100 rounded px-1.5 py-0.5 text-gray-600 uppercase">AVPU: {r.nivel_conciencia}</span>}
                        </div>
                      )}
                      {r.tratamiento && <p className="text-xs text-gray-600 bg-gray-50 rounded-lg p-2">{r.tratamiento}</p>}
                      {r.vehiculo_nombre && <p className="text-xs text-primary-600 flex items-center gap-1"><FileText size={12} /> {r.vehiculo_nombre}</p>}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Eliminar parte de asistencia"
        message="¿Seguro que quieres eliminar este parte de asistencia sanitaria? Esta acción no se puede deshacer."
        confirmText="Eliminar"
        danger
      />
    </div>
  );
}
