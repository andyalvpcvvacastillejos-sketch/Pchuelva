import { useCallback, useEffect, useState, type ChangeEvent } from 'react';
import { Camera, CheckCircle2, Crosshair, FileText, MapPin, RefreshCw, Send, Stethoscope, TriangleAlert, WifiOff } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { supabase, type IncidentCategory, type OperativeIncident } from '@/lib/supabase';
import { ParteSanitarioModal } from '@/components/ParteSanitarioModal';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';

const pendingKey = 'pc-huelva-pending-incidents';

const categoryConfig: Record<IncidentCategory, { label: string; shortLabel: string; dot: string; active: string }> = {
  urgente_refuerzos: { label: 'Urgente / Refuerzos', shortLabel: 'Urgente', dot: 'bg-red-500', active: 'border-red-500 bg-red-50 text-red-800' },
  sanitaria: { label: 'Sanitaria', shortLabel: 'Sanitaria', dot: 'bg-yellow-400', active: 'border-yellow-400 bg-yellow-50 text-yellow-900' },
  trafico_via_publica: { label: 'Tráfico / Vía Pública', shortLabel: 'Tráfico', dot: 'bg-blue-500', active: 'border-blue-500 bg-blue-50 text-blue-800' },
  aviso_general: { label: 'Aviso General', shortLabel: 'Aviso', dot: 'bg-green-500', active: 'border-green-500 bg-green-50 text-green-800' },
};

interface PendingIncident {
  id: string;
  categoria: IncidentCategory;
  descripcion: string;
  latitud: number | null;
  longitud: number | null;
  created_at: string;
  sync_state: 'pending';
}

interface IncidentWithReports extends OperativeIncident {
  report_count?: number;
}

function readPendingIncidents(): PendingIncident[] {
  try {
    const saved = JSON.parse(localStorage.getItem(pendingKey) ?? '[]') as PendingIncident[];
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function savePendingIncident(incident: PendingIncident) {
  localStorage.setItem(pendingKey, JSON.stringify([incident, ...readPendingIncidents()].slice(0, 20)));
}

export function IncidenciasPage() {
  const { user } = useAuth();
  const [category, setCategory] = useState<IncidentCategory>('urgente_refuerzos');
  const [description, setDescription] = useState('');
  const [coordinates, setCoordinates] = useState<{ latitud: number; longitud: number } | null>(null);
  const [locationStatus, setLocationStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [incidents, setIncidents] = useState<IncidentWithReports[]>([]);
  const [pending, setPending] = useState<PendingIncident[]>(readPendingIncidents);
  const [loading, setLoading] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedIncidentId, setSavedIncidentId] = useState<string | null>(null);

  const fetchIncidents = useCallback(async () => {
    setLoadingList(true);
    const { data } = await supabase.from('incidencias_operativas').select('*').order('created_at', { ascending: false }).limit(20);
    const incidentList = (data ?? []) as OperativeIncident[];
    const withCounts: IncidentWithReports[] = [];
    for (const incident of incidentList) {
      const { count } = await supabase.from('partes_sanitarios').select('*', { count: 'exact', head: true }).eq('incident_id', incident.id);
      withCounts.push({ ...incident, report_count: count ?? 0 });
    }
    setIncidents(withCounts);
    setLoadingList(false);
  }, []);

  useEffect(() => { fetchIncidents(); }, [fetchIncidents]);

  useEffect(() => {
    if (!photo) { setPhotoPreview(null); return; }
    const url = URL.createObjectURL(photo);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const captureLocation = () => {
    if (!navigator.geolocation) { setLocationStatus('error'); return; }
    setLocationStatus('loading');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoordinates({ latitud: Number(position.coords.latitude.toFixed(6)), longitud: Number(position.coords.longitude.toFixed(6)) });
        setLocationStatus('ready');
      },
      () => setLocationStatus('error'),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  };

  useEffect(() => { captureLocation(); }, []);

  const handlePhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (!selected) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(selected.type) || selected.size > 5 * 1024 * 1024) {
      setError('La foto debe ser JPG, PNG o WebP y pesar menos de 5 MB.');
      return;
    }
    setError(null);
    setPhoto(selected);
  };

  const queueLocally = () => {
    const queued: PendingIncident = {
      id: crypto.randomUUID(), categoria: category, descripcion: description.trim(),
      latitud: coordinates?.latitud ?? null, longitud: coordinates?.longitud ?? null,
      created_at: new Date().toISOString(), sync_state: 'pending',
    };
    savePendingIncident(queued);
    setPending(readPendingIncidents());
  };

  const handleSubmit = async () => {
    if (!user || description.trim().length < 3) {
      setError('Escribe una descripción breve de al menos 3 caracteres.');
      return;
    }
    setLoading(true);
    setError(null);
    setMessage(null);
    if (!navigator.onLine) {
      queueLocally();
      setMessage('Sin conexión: incidencia guardada en el dispositivo para sincronizarla después.');
      setDescription('');
      setPhoto(null);
      setLoading(false);
      return;
    }

    let uploadedPath: string | null = null;
    try {
      if (photo) {
        const extension = photo.type.split('/')[1].replace('jpeg', 'jpg');
        uploadedPath = `${user.id}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage.from('incident-photos').upload(uploadedPath, photo, { contentType: photo.type, upsert: false });
        if (uploadError) throw uploadError;
      }
      const { data: insertData, error: insertError } = await supabase.from('incidencias_operativas').insert({
        categoria: category,
        descripcion: description.trim(),
        latitud: coordinates?.latitud ?? null,
        longitud: coordinates?.longitud ?? null,
        foto_path: uploadedPath,
      }).select().single();
      if (insertError) throw insertError;
      setMessage('Incidencia registrada y compartida con el equipo.');
      setDescription('');
      setPhoto(null);
      if (category === 'sanitaria' && insertData) {
        setSavedIncidentId(insertData.id);
      }
      await fetchIncidents();
    } catch {
      if (uploadedPath) await supabase.storage.from('incident-photos').remove([uploadedPath]);
      queueLocally();
      setMessage('No hay conexión con el servidor: incidencia guardada en el dispositivo para sincronizarla después.');
    }
    setLoading(false);
  };

  const locationText = locationStatus === 'loading' ? 'Obteniendo ubicación…' : locationStatus === 'ready' && coordinates ? `${coordinates.latitud.toFixed(5)}, ${coordinates.longitud.toFixed(5)}` : locationStatus === 'error' ? 'Ubicación no disponible' : 'Sin ubicación';

  return (
    <div className="px-4 py-4 max-w-2xl mx-auto space-y-4">
      <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-600">Canal operativo</p><h1 className="text-xl font-bold text-gray-900">Registro rápido de incidencias</h1><p className="text-sm text-gray-500 mt-1">Comunica lo que ocurre sobre el terreno en pocos segundos.</p></div><div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center"><TriangleAlert size={22} /></div></div>

      <div className="card p-4 space-y-4">
        <div><p className="label">Tipo de incidencia</p><div className="grid grid-cols-2 gap-2">{(Object.keys(categoryConfig) as IncidentCategory[]).map((item) => { const config = categoryConfig[item]; return <button key={item} type="button" onClick={() => setCategory(item)} className={`min-h-14 rounded-xl border-2 px-3 py-2 text-left flex items-center gap-2 transition-all ${category === item ? config.active : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}><span className={`w-3 h-3 rounded-full flex-shrink-0 ${config.dot}`} /><div><span className="text-sm font-semibold">{config.label}</span>{item === 'sanitaria' && <span className="block text-[10px] opacity-70 mt-0.5">Incluye Parte de Asistencia</span>}</div></button>; })}</div></div>
        <div><label className="label" htmlFor="incident-description">Descripción breve</label><textarea id="incident-description" className="input min-h-[92px] resize-none" maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Qué ocurre, dónde y qué apoyo se necesita…" /><p className="text-[11px] text-gray-400 text-right mt-1">{description.length}/500</p></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2"><button type="button" onClick={captureLocation} className="btn-outline justify-start"><Crosshair size={17} className={locationStatus === 'loading' ? 'animate-spin' : ''} /><span className="truncate">{locationText}</span></button><label className="btn-outline justify-start cursor-pointer"><Camera size={17} /><span className="truncate">{photo ? photo.name : 'Añadir foto'}</span><input type="file" accept="image/*" capture="environment" onChange={handlePhoto} className="hidden" /></label></div>
        {photoPreview && <div className="relative rounded-xl overflow-hidden h-36 bg-gray-100"><img src={photoPreview} alt="Vista previa de la incidencia" className="w-full h-full object-cover" /><button type="button" onClick={() => setPhoto(null)} className="absolute top-2 right-2 bg-black/60 text-white rounded-lg px-2 py-1 text-xs">Quitar</button></div>}
        {error && <p className="text-sm text-error-600 bg-error-50 rounded-xl px-3 py-2">{error}</p>}{message && <p className="text-sm text-success-700 bg-success-50 rounded-xl px-3 py-2 flex items-center gap-2"><CheckCircle2 size={16} />{message}</p>}
        <button type="button" onClick={handleSubmit} disabled={loading} className="btn-danger w-full"><Send size={17} />{loading ? 'Enviando incidencia…' : 'Registrar incidencia'}</button>
        {category === 'sanitaria' && <div className="rounded-xl bg-yellow-50 border border-yellow-200 px-3 py-2.5 flex items-center gap-2"><Stethoscope size={16} className="text-yellow-700 flex-shrink-0" /><p className="text-xs text-yellow-900">Al registrar una incidencia sanitaria, se abrirá automáticamente el Parte de Asistencia Sanitaria para completar los datos del paciente y las constantes vitales.</p></div>}
      </div>

      {pending.length > 0 && <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-4"><div className="flex items-center gap-2 text-yellow-900 font-semibold text-sm"><WifiOff size={17} /> Pendientes de sincronizar: {pending.length}</div><p className="text-xs text-yellow-800 mt-1">Se conservan en este dispositivo hasta que haya conexión.</p></div>}

      <div className="card p-4"><div className="flex items-center justify-between mb-3"><div><h2 className="text-sm font-semibold text-gray-900">Incidencias recientes</h2><p className="text-xs text-gray-400">Visibles para el equipo operativo</p></div><button onClick={fetchIncidents} className="p-2 rounded-lg text-primary-600 hover:bg-primary-50" aria-label="Actualizar incidencias"><RefreshCw size={17} /></button></div>{loadingList ? <div className="flex justify-center py-6"><Spinner size={24} /></div> : incidents.length === 0 ? <p className="text-sm text-gray-400 py-4 text-center">Todavía no hay incidencias registradas.</p> : <div className="space-y-2">{incidents.map((incident) => { const config = categoryConfig[incident.categoria]; return <div key={incident.id} className="rounded-xl border border-gray-100 p-3"><div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2"><span className={`w-2.5 h-2.5 rounded-full ${config.dot}`} /><span className="text-xs font-semibold text-gray-700">{config.shortLabel}</span></div><span className="text-[10px] text-gray-400">{new Date(incident.created_at).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span></div><p className="text-sm text-gray-800 mt-1">{incident.descripcion}</p><div className="flex items-center gap-3 text-[11px] text-gray-400 mt-2 flex-wrap">{incident.latitud !== null && incident.longitud !== null && <span className="flex items-center gap-1"><MapPin size={12} /> GPS</span>}{incident.foto_path && <span className="flex items-center gap-1"><Camera size={12} /> Foto</span>}<Badge variant={incident.estado === 'resuelta' ? 'success' : 'warning'}>{incident.estado === 'resuelta' ? 'Resuelta' : 'Abierta'}</Badge>{incident.categoria === 'sanitaria' && (incident.report_count ?? 0) > 0 && <Badge variant="primary"><FileText size={11} /> {incident.report_count} parte{(incident.report_count ?? 0) > 1 ? 's' : ''}</Badge>}{incident.categoria === 'sanitaria' && <button onClick={() => setSavedIncidentId(incident.id)} className="text-primary-600 font-medium flex items-center gap-1 hover:underline"><Stethoscope size={12} /> {incident.report_count ? 'Ver parte' : 'Añadir parte'}</button>}</div></div>; })}</div>}</div>

      {savedIncidentId && (() => { const incident = incidents.find((i) => i.id === savedIncidentId); return <ParteSanitarioModal incidentId={savedIncidentId} incidentDescription={incident?.descripcion ?? 'Incidencia sanitaria'} onClose={() => setSavedIncidentId(null)} onSaved={() => { setSavedIncidentId(null); fetchIncidents(); }} />; })()}
    </div>
  );
}
