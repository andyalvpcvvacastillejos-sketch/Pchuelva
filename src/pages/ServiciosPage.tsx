import { useEffect, useState, useCallback } from 'react';
import { Shield, Plus, MapPin, Clock, Users, ArrowLeft, X, FileText, Car, User, Calendar, Trash2, Share2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { supabase, type Servicio, type ServicioInscripcion, type CartaServicio, type OperationalVehicle } from '@/lib/supabase';
import { processPendingPushNotifications } from '@/lib/push';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

const estadoConfig: Record<string, { label: string; variant: 'primary' | 'success' | 'warning' | 'error' | 'gray' }> = {
  abierto: { label: 'Abierto', variant: 'primary' },
  cerrado: { label: 'Cerrado', variant: 'warning' },
  completado: { label: 'Completado', variant: 'success' },
  cancelado: { label: 'Cancelado', variant: 'error' },
};

const inscripcionConfig: Record<string, { label: string; variant: 'primary' | 'success' | 'warning' | 'error' | 'gray' }> = {
  pendiente: { label: 'Pendiente', variant: 'warning' },
  titular: { label: 'Titular', variant: 'success' },
  reserva: { label: 'Reserva', variant: 'primary' },
  rechazado: { label: 'Rechazado', variant: 'error' },
};

function shareOnWhatsApp(text: string) {
  const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank');
}

function buildServicioShareText(s: Servicio, appUrl: string): string {
  const fecha = new Date(s.fecha);
  let text = `*${s.titulo}*
`;
  text += `Fecha: ${fecha.toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })} a las ${fecha.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}\n`;
  if (s.fecha_fin) text += `Finaliza: ${new Date(s.fecha_fin).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}\n`;
  if (s.fecha_limite_inscripcion) text += `Inscripciones hasta: ${new Date(s.fecha_limite_inscripcion).toLocaleString('es-ES')}\n`;
  if (s.ubicacion) text += `Ubicación: ${s.ubicacion}\n`;
  text += `👥 ${s.plazas} plazas titulares + ${s.reservas_plazas} reservas\n`;
  if (s.descripcion) text += `\n${s.descripcion}\n`;
  text += `\nPuedes inscribirte a través de la aplicación.\nAccede a: ${appUrl}\n\nProtección Civil Huelva`;
  return text;
}

export function ServiciosPage() {
  const { profile } = useAuth();
  const isStaff = profile?.role === 'admin_tecnico' || profile?.role === 'coordinador';
  const [appUrl, setAppUrl] = useState(() => window.location.origin);

  const [loading, setLoading] = useState(true);
  const [servicios, setServicios] = useState<(Servicio & { inscritos_count: number })[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const fetchServicios = useCallback(async () => {
    setLoading(true);
    const [servicesRes, inscriptionsRes, settingsRes] = await Promise.all([
      supabase.from('servicios').select('*').order('fecha', { ascending: false }),
      supabase.from('servicio_inscripciones').select('servicio_id'),
      supabase.from('app_settings').select('app_url').eq('setting_key', 'public_app').maybeSingle(),
    ]);
    if (settingsRes.data?.app_url) setAppUrl(settingsRes.data.app_url);
    const counts = new Map<string, number>();
    for (const inscription of inscriptionsRes.data ?? []) {
      counts.set(inscription.servicio_id, (counts.get(inscription.servicio_id) ?? 0) + 1);
    }
    setServicios((servicesRes.data ?? []).map((service: Servicio) => ({
      ...service,
      inscritos_count: counts.get(service.id) ?? 0,
    })));
    setLoading(false);
  }, []);

  useEffect(() => { fetchServicios(); }, [fetchServicios]);

  if (loading) return <div className="flex justify-center py-20"><Spinner size={32} /></div>;

  if (selectedId) {
    return (
      <ServicioDetail
        servicioId={selectedId}
        onBack={() => { setSelectedId(null); fetchServicios(); }}
        isStaff={!!isStaff}
      />
    );
  }

  return (
    <div className="px-4 py-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900">Servicios Preventivos</h1>
        {isStaff && (
          <button onClick={() => setShowCreate(true)} className="btn-primary">
            <Plus size={18} /> Nuevo
          </button>
        )}
      </div>

      {servicios.length === 0 ? (
        <EmptyState
          icon={Shield}
          title="No hay servicios"
          description={isStaff ? "Crea el primer servicio preventivo." : "No hay servicios disponibles todavía."}
          action={isStaff ? <button onClick={() => setShowCreate(true)} className="btn-primary"><Plus size={18} /> Crear servicio</button> : undefined}
        />
      ) : (
        <div className="space-y-3">
          {servicios.map((s) => {
            const cfg = estadoConfig[s.estado] ?? estadoConfig.abierto;
            return (
              <div key={s.id} className="card p-4">
                <button
                  onClick={() => setSelectedId(s.id)}
                  className="w-full text-left hover:shadow-md transition-shadow active:scale-[0.98] rounded-xl"
                >
                <div className="flex items-start justify-between mb-2">
                  <p className="font-semibold text-gray-900 text-sm flex-1">{s.titulo}</p>
                  <Badge variant={cfg.variant}>{cfg.label}</Badge>
                </div>
                {s.descripcion && <p className="text-xs text-gray-500 line-clamp-2 mb-2">{s.descripcion}</p>}
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <Calendar size={12} />
                    {new Date(s.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {s.fecha_fin && <span className="flex items-center gap-1"><Clock size={12} /> hasta {new Date(s.fecha_fin).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</span>}
                  {s.fecha_limite_inscripcion && <span className="flex items-center gap-1 text-warning-700">Inscripción hasta {new Date(s.fecha_limite_inscripcion).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })}</span>}
                  {s.ubicacion && <span className="flex items-center gap-1"><MapPin size={12} /> {s.ubicacion}</span>}
                  <span className="flex items-center gap-1">
                    <Users size={12} /> {s.inscritos_count} apuntados · {s.plazas}+{s.reservas_plazas} plazas
                  </span>
                </div>
                </button>
                <button
                  onClick={() => shareOnWhatsApp(buildServicioShareText(s, appUrl))}
                  className="w-full mt-3 py-2 rounded-xl text-sm font-medium flex items-center justify-center gap-2 bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 transition-all"
                >
                  <Share2 size={16} /> Compartir por WhatsApp
                </button>
              </div>
            );
          })}
        </div>
      )}

      {showCreate && (
        <CreateServicioModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); fetchServicios(); }}
        />
      )}
    </div>
  );
}

// ============================================================
// SERVICE DETAIL
// ============================================================
function ServicioDetail({ servicioId, onBack, isStaff }: { servicioId: string; onBack: () => void; isStaff: boolean }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [servicio, setServicio] = useState<Servicio | null>(null);
  const [inscripciones, setInscripciones] = useState<ServicioInscripcion[]>([]);
  const [carta, setCarta] = useState<CartaServicio | null>(null);
  const [myInscripcion, setMyInscripcion] = useState<ServicioInscripcion | null>(null);
  const [showCarta, setShowCarta] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [showVehicles, setShowVehicles] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    const [servRes, inscRes, cartaRes] = await Promise.all([
      supabase.from('servicios').select('*').eq('id', servicioId).maybeSingle(),
      supabase
        .from('servicio_inscripciones')
        .select('*')
        .eq('servicio_id', servicioId)
        .order('created_at', { ascending: true }),
      supabase.from('carta_servicio').select('*').eq('servicio_id', servicioId).maybeSingle(),
    ]);

    const rawInscripciones = (inscRes.data ?? []) as ServicioInscripcion[];
    const userIds = [...new Set(rawInscripciones.map((inscripcion) => inscripcion.user_id))];
    const { data: profiles } = userIds.length > 0
      ? await supabase.from('profiles').select('*').in('id', userIds)
      : { data: [] };
    const profilesById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
    const inscripcionesWithProfiles = rawInscripciones.map((inscripcion) => ({
      ...inscripcion,
      profile: profilesById.get(inscripcion.user_id),
    }));

    setServicio(servRes.data as Servicio | null);
    setInscripciones(inscripcionesWithProfiles);
    setCarta(cartaRes.data as CartaServicio | null);

    if (user) {
      setMyInscripcion(inscripcionesWithProfiles.find((inscripcion) => inscripcion.user_id === user.id) ?? null);
    }
    setLoading(false);
  }, [servicioId, user]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  const [enrollError, setEnrollError] = useState<string | null>(null);

  const handleEnroll = async () => {
    if (!user || !servicio) return;
    setEnrollError(null);
    const { error } = await supabase
      .from('servicio_inscripciones')
      .insert({ servicio_id: servicio.id, user_id: user.id, estado: 'pendiente' });
    if (error) {
      if (error.code === '23505') {
        setEnrollError('Ya estás inscrito en este servicio.');
      } else {
        setEnrollError(error.message);
      }
    } else {
      fetchDetail();
    }
  };

  const handleUnenroll = async () => {
    if (!user || !servicio) return;
    const { error } = await supabase
      .from('servicio_inscripciones')
      .delete()
      .eq('servicio_id', servicio.id)
      .eq('user_id', user.id);
    if (!error) fetchDetail();
  };

  const handleDelete = async () => {
    if (!servicio) return;
    await supabase.from('servicios').delete().eq('id', servicio.id);
    onBack();
  };

  if (loading) return <div className="flex justify-center py-20"><Spinner size={32} /></div>;
  if (!servicio) return <EmptyState icon={Shield} title="Servicio no encontrado" />;

  const cfg = estadoConfig[servicio.estado] ?? estadoConfig.abierto;
  const titulares = inscripciones.filter((i) => i.estado === 'titular');
  const reservas = inscripciones.filter((i) => i.estado === 'reserva');
  const canEnroll = servicio.estado === 'abierto' && !myInscripcion && (!servicio.fecha_limite_inscripcion || new Date(servicio.fecha_limite_inscripcion).getTime() >= Date.now());
  const canViewCarta = isStaff || myInscripcion?.estado === 'titular' || myInscripcion?.estado === 'reserva' || myInscripcion?.estado === 'pendiente';

  return (
    <div className="px-4 py-4">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-gray-500 mb-3 hover:text-gray-700">
        <ArrowLeft size={16} /> Volver
      </button>

      {/* Service Info */}
      <div className="card p-5 mb-4">
        <div className="flex items-start justify-between mb-3">
          <h1 className="text-lg font-bold text-gray-900 flex-1">{servicio.titulo}</h1>
          <Badge variant={cfg.variant}>{cfg.label}</Badge>
        </div>
        {servicio.descripcion && <p className="text-sm text-gray-600 mb-4">{servicio.descripcion}</p>}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="flex items-center gap-2 text-gray-600">
            <Calendar size={16} className="text-primary-500" />
            <div>
              <p className="text-xs text-gray-400">Fecha</p>
              <p className="font-medium">{new Date(servicio.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
              <p className="text-xs">{new Date(servicio.fecha).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</p>
              {servicio.fecha_fin && <p className="text-xs">Hasta {new Date(servicio.fecha_fin).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</p>}
              {servicio.fecha_limite_inscripcion && <p className="text-xs text-warning-700">Inscripción hasta {new Date(servicio.fecha_limite_inscripcion).toLocaleString('es-ES')}</p>}
            </div>
          </div>
          {servicio.ubicacion && (
            <div className="flex items-center gap-2 text-gray-600">
              <MapPin size={16} className="text-primary-500" />
              <div>
                <p className="text-xs text-gray-400">Ubicación</p>
                <p className="font-medium">{servicio.ubicacion}</p>
              </div>
            </div>
          )}
          <div className="flex items-center gap-2 text-gray-600">
            <Users size={16} className="text-primary-500" />
            <div>
              <p className="text-xs text-gray-400">Plazas</p>
              <p className="font-medium">{servicio.plazas} titulares</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-gray-600">
            <Shield size={16} className="text-primary-500" />
            <div>
              <p className="text-xs text-gray-400">Reservas</p>
              <p className="font-medium">{servicio.reservas_plazas} reservas</p>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 mb-4">
        {canEnroll && (
          <button onClick={handleEnroll} className="btn-primary flex-1">
            <Plus size={18} /> Apuntarme
          </button>
        )}
        {!myInscripcion && servicio.fecha_limite_inscripcion && new Date(servicio.fecha_limite_inscripcion).getTime() < Date.now() && <p className="text-xs text-error-600 bg-error-50 rounded-xl px-3 py-2 flex-1">El plazo de inscripción ha terminado.</p>}
        {myInscripcion && myInscripcion.estado === 'pendiente' && (
          <button onClick={() => setConfirmCancel(true)} className="btn-outline flex-1 text-error-600 border-error-200">
            <X size={18} /> Cancelar inscripción
          </button>
        )}
        {canViewCarta && (
          <button onClick={() => setShowCarta(true)} className="btn-accent flex-1">
            <FileText size={18} /> Carta de Servicio
          </button>
        )}
        {isStaff && (
          <>
            <button onClick={() => setShowAssign(true)} className="btn-outline flex-1">
              <Users size={18} /> Asignar
            </button>
            <button onClick={() => setShowVehicles(true)} className="btn-outline flex-1">
              <Car size={18} /> Vehículos
            </button>
            <button onClick={() => setShowEdit(true)} className="btn-ghost">
              <FileText size={18} />
            </button>
            <button onClick={() => setConfirmDelete(true)} className="btn-ghost text-error-600 hover:bg-error-50">
              <Trash2 size={18} />
            </button>
          </>
        )}
      </div>

      {/* Enroll error */}
      {enrollError && (
        <div className="card p-3 mb-4 text-sm text-error-600 bg-error-50 rounded-xl flex items-center justify-between">
          {enrollError}
          <button onClick={() => setEnrollError(null)} className="text-error-400"><X size={16} /></button>
        </div>
      )}

      {/* My inscription status */}
      {myInscripcion && (
        <div className="card p-4 mb-4">
          <p className="text-xs text-gray-400 mb-1">Tu inscripción</p>
          <div className="flex items-center justify-between">
            <Badge variant={inscripcionConfig[myInscripcion.estado]?.variant ?? 'gray'}>
              {inscripcionConfig[myInscripcion.estado]?.label ?? myInscripcion.estado}
            </Badge>
            <span className="text-xs text-gray-400">
              {new Date(myInscripcion.created_at).toLocaleDateString('es-ES')}
            </span>
          </div>
        </div>
      )}

      {/* Inscriptions list (staff only) */}
      {isStaff && inscripciones.length > 0 && (
        <div className="card p-4 mb-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Inscripciones ({inscripciones.length})</h3>
          <div className="space-y-2">
            {inscripcionesList(inscripciones)}
          </div>
        </div>
      )}

      {/* Summary for volunteers */}
      {!isStaff && (titulares.length > 0 || reservas.length > 0) && (
        <div className="card p-4 mb-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Asignaciones</h3>
          <div className="space-y-2">
            <div>
              <p className="text-xs text-gray-400 mb-1">Titulares ({titulares.length}/{servicio.plazas})</p>
              <div className="flex flex-wrap gap-1.5">
                {titulares.map((t) => (
                  <Badge key={t.id} variant="success">Voluntario {t.profile?.indicativo ?? ''}</Badge>
                ))}
                {titulares.length === 0 && <span className="text-xs text-gray-400">Sin asignar</span>}
              </div>
            </div>
            {reservas.length > 0 && (
              <div>
                <p className="text-xs text-gray-400 mb-1">Reservas ({reservas.length}/{servicio.reservas_plazas})</p>
                <div className="flex flex-wrap gap-1.5">
                  {reservas.map((r) => (
                    <Badge key={r.id} variant="primary">Voluntario {r.profile?.indicativo ?? ''}</Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Carta de Servicio Modal */}
      {showCarta && (
        <CartaServicioModal
          servicioId={servicio.id}
          carta={carta}
          isStaff={isStaff}
          onClose={() => { setShowCarta(false); fetchDetail(); }}
        />
      )}

      {/* Assign Modal */}
      {showAssign && (
        <AssignModal
          servicio={servicio}
          inscripciones={inscripciones}
          onClose={() => { setShowAssign(false); fetchDetail(); }}
        />
      )}

      {/* Vehicle Assign Modal */}
      {showVehicles && servicio && (
        <ServiceVehicleModal servicioId={servicio.id} onClose={() => { setShowVehicles(false); fetchDetail(); }} />
      )}

      {/* Edit Modal */}
      {showEdit && (
        <CreateServicioModal
          existing={servicio}
          onClose={() => setShowEdit(false)}
          onCreated={() => { setShowEdit(false); fetchDetail(); }}
        />
      )}

      <ConfirmDialog
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        onConfirm={handleUnenroll}
        title="Cancelar inscripción"
        message="¿Seguro que quieres cancelar tu inscripción a este servicio?"
        confirmText="Sí, cancelar"
        danger
      />

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
        title="Eliminar servicio"
        message="¿Seguro que quieres eliminar este servicio permanentemente? Se borrarán también las inscripciones y la carta de servicio."
        confirmText="Eliminar"
        danger
      />
    </div>
  );
}

function inscripcionesList(inscripciones: ServicioInscripcion[]) {
  return inscripciones.map((i) => {
    const cfg = inscripcionConfig[i.estado] ?? inscripcionConfig.pendiente;
    return (
      <div key={i.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-xs font-bold text-primary-700">
            {i.profile?.nombre?.[0] ?? '?'}{i.profile?.apellidos?.[0] ?? ''}
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">
              {i.profile?.nombre} {i.profile?.apellidos}
            </p>
            {i.profile?.indicativo && <p className="text-xs text-gray-400">{i.profile.indicativo} · {i.profile.especialidad}</p>}
          </div>
        </div>
        <Badge variant={cfg.variant}>{cfg.label}</Badge>
      </div>
    );
  });
}

// ============================================================
// CREATE / EDIT SERVICE MODAL
// ============================================================
function CreateServicioModal({
  existing, onClose, onCreated,
}: {
  existing?: Servicio;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { user } = useAuth();
  const [titulo, setTitulo] = useState(existing?.titulo ?? '');
  const [descripcion, setDescripcion] = useState(existing?.descripcion ?? '');
  const [fecha, setFecha] = useState(existing ? new Date(existing.fecha).toISOString().slice(0, 16) : '');
  const [fechaFin, setFechaFin] = useState(existing?.fecha_fin ? new Date(existing.fecha_fin).toISOString().slice(0, 16) : '');
  const [fechaLimite, setFechaLimite] = useState(existing?.fecha_limite_inscripcion ? new Date(existing.fecha_limite_inscripcion).toISOString().slice(0, 16) : '');
  const [ubicacion, setUbicacion] = useState(existing?.ubicacion ?? '');
  const [plazas, setPlazas] = useState(existing?.plazas.toString() ?? '5');
  const [reservasPlazas, setReservasPlazas] = useState(existing?.reservas_plazas.toString() ?? '2');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    setError(null);

    const payload = {
      titulo,
      descripcion: descripcion || null,
      fecha: new Date(fecha).toISOString(),
      fecha_fin: fechaFin ? new Date(fechaFin).toISOString() : null,
      fecha_limite_inscripcion: fechaLimite ? new Date(fechaLimite).toISOString() : null,
      ubicacion: ubicacion || null,
      plazas: parseInt(plazas) || 0,
      reservas_plazas: parseInt(reservasPlazas) || 0,
    };

    let result;
    if (existing) {
      result = await supabase.from('servicios').update(payload).eq('id', existing.id);
    } else {
      result = await supabase.from('servicios').insert({ ...payload, created_by: user.id });
    }

    if (result.error) setError('No se pudo guardar el servicio. Revisa las fechas indicadas.');
    else {
      if (!existing) await processPendingPushNotifications();
      onCreated();
    }
    setLoading(false);
  };

  return (
    <Modal open onClose={onClose} title={existing ? 'Editar servicio' : 'Nuevo servicio'} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label">Título</label>
          <input className="input" value={titulo} onChange={(e) => setTitulo(e.target.value)} required placeholder="Ej: Dispositivo preventivo en concierto" />
        </div>
        <div>
          <label className="label">Descripción</label>
          <textarea className="input min-h-[80px]" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Detalles del servicio..." />
        </div>
        <div>
          <label className="label">Fecha y hora</label>
          <input type="datetime-local" className="input" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
        </div>
        <div>
          <label className="label">Hora de finalización</label>
          <input type="datetime-local" className="input" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} min={fecha} />
        </div>
        <div>
          <label className="label">Fecha límite para inscribirse</label>
          <input type="datetime-local" className="input" value={fechaLimite} onChange={(e) => setFechaLimite(e.target.value)} max={fecha} />
        </div>
        <div>
          <label className="label">Ubicación</label>
          <input className="input" value={ubicacion} onChange={(e) => setUbicacion(e.target.value)} placeholder="Ej: Casa Colón, Huelva" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Plazas titulares</label>
            <input type="number" min="0" className="input" value={plazas} onChange={(e) => setPlazas(e.target.value)} required />
          </div>
          <div>
            <label className="label">Plazas de reserva</label>
            <input type="number" min="0" className="input" value={reservasPlazas} onChange={(e) => setReservasPlazas(e.target.value)} required />
          </div>
        </div>
        {error && <div className="text-sm text-error-600 bg-error-50 rounded-xl px-4 py-3">{error}</div>}
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="btn-outline flex-1">Cancelar</button>
          <button type="submit" disabled={loading} className="btn-primary flex-1">
            {loading ? 'Guardando...' : existing ? 'Guardar' : 'Crear'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ============================================================
// ASSIGN MODAL
// ============================================================
function AssignModal({
  servicio, inscripciones, onClose,
}: {
  servicio: Servicio;
  inscripciones: ServicioInscripcion[];
  onClose: () => void;
}) {
  const [updated, setUpdated] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const handleAssign = async (inscripcion: ServicioInscripcion, estado: string) => {
    setLoading(true);
    await supabase
      .from('servicio_inscripciones')
      .update({ estado, assigned_at: new Date().toISOString() })
      .eq('id', inscripcion.id);
    setUpdated({ ...updated, [inscripcion.id]: estado });
    setLoading(false);
  };

  const titularesCount = inscripciones.filter((i) => (updated[i.id] ?? i.estado) === 'titular').length;
  const reservasCount = inscripciones.filter((i) => (updated[i.id] ?? i.estado) === 'reserva').length;

  return (
    <Modal open onClose={onClose} title="Asignar titulares y reservas" size="lg">
      <div className="mb-4 flex gap-3">
        <Badge variant="success">Titulares: {titularesCount}/{servicio.plazas}</Badge>
        <Badge variant="primary">Reservas: {reservasCount}/{servicio.reservas_plazas}</Badge>
      </div>

      {inscripciones.length === 0 ? (
        <EmptyState icon={Users} title="Sin inscripciones" description="Nadie se ha apuntado todavía." />
      ) : (
        <div className="space-y-3">
          {inscripciones.map((i) => {
            const currentEstado = updated[i.id] ?? i.estado;
            return (
              <div key={i.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-xs font-bold text-primary-700">
                    {i.profile?.nombre?.[0] ?? '?'}{i.profile?.apellidos?.[0] ?? ''}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {i.profile?.nombre} {i.profile?.apellidos}
                    </p>
                    {i.profile?.indicativo && (
                      <p className="text-xs text-gray-400">{i.profile.indicativo} · {i.profile.especialidad}</p>
                    )}
                  </div>
                </div>
                <div className="flex gap-1">
                  {(['titular', 'reserva', 'rechazado', 'pendiente'] as const).map((est) => {
                    const cfg = inscripcionConfig[est];
                    const isActive = currentEstado === est;
                    return (
                      <button
                        key={est}
                        disabled={loading}
                        onClick={() => handleAssign(i, est)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                          isActive
                            ? est === 'titular' ? 'bg-success-500 text-white'
                              : est === 'reserva' ? 'bg-primary-500 text-white'
                              : est === 'rechazado' ? 'bg-error-500 text-white'
                              : 'bg-warning-500 text-white'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                      >
                        {cfg.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex gap-3 pt-4">
        <button onClick={onClose} className="btn-primary w-full">Cerrar</button>
      </div>
    </Modal>
  );
}

// ============================================================
// SERVICE VEHICLE ASSIGN MODAL
// ============================================================
function ServiceVehicleModal({ servicioId, onClose }: { servicioId: string; onClose: () => void }) {
  const [allVehicles, setAllVehicles] = useState<OperationalVehicle[]>([]);
  const [assignedIds, setAssignedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      const [vehRes, assignRes] = await Promise.all([
        supabase.from('vehiculos_operativos').select('*').eq('is_active', true).order('nombre'),
        supabase.from('servicio_vehiculos').select('vehiculo_id').eq('servicio_id', servicioId),
      ]);
      setAllVehicles((vehRes.data ?? []) as OperationalVehicle[]);
      setAssignedIds(new Set((assignRes.data ?? []).map((r: { vehiculo_id: string }) => r.vehiculo_id)));
      setLoading(false);
    };
    fetchData();
  }, [servicioId]);

  const toggleVehicle = async (vehiculoId: string) => {
    setSaving(true);
    if (assignedIds.has(vehiculoId)) {
      await supabase.from('servicio_vehiculos').delete().eq('servicio_id', servicioId).eq('vehiculo_id', vehiculoId);
      setAssignedIds((prev) => { const next = new Set(prev); next.delete(vehiculoId); return next; });
    } else {
      await supabase.from('servicio_vehiculos').insert({ servicio_id: servicioId, vehiculo_id: vehiculoId });
      setAssignedIds((prev) => new Set(prev).add(vehiculoId));
    }
    setSaving(false);
  };

  const vehicleTypeLabels: Record<string, string> = { vir: 'VIR', coordinacion: 'Coordinación', ambulancia: 'Ambulancia', logistica: 'Logística', otro: 'Otro' };

  return (
    <Modal open onClose={onClose} title="Vehículos asignados al servicio" size="md">
      {loading ? <div className="flex justify-center py-8"><Spinner size={24} /></div> : allVehicles.length === 0 ? (
        <EmptyState icon={Car} title="Sin vehículos" description="No hay vehículos operativos registrados. Añádelos desde el mapa táctico." />
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-gray-500 mb-3">Selecciona los vehículos que estarán asignados a este servicio preventivo. Estarán disponibles para vincular en los partes de asistencia sanitaria.</p>
          {allVehicles.map((v) => {
            const isAssigned = assignedIds.has(v.id);
            return (
              <button key={v.id} onClick={() => toggleVehicle(v.id)} disabled={saving} className={`w-full flex items-center justify-between p-3 rounded-xl border-2 transition-all ${isAssigned ? 'border-success-500 bg-success-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isAssigned ? 'bg-success-100 text-success-700' : 'bg-gray-100 text-gray-500'}`}><Car size={20} /></div>
                  <div className="text-left">
                    <p className="text-sm font-semibold text-gray-900">{v.nombre}</p>
                    <p className="text-xs text-gray-500">{vehicleTypeLabels[v.tipo] ?? v.tipo}</p>
                  </div>
                </div>
                <Badge variant={isAssigned ? 'success' : 'gray'}>{isAssigned ? 'Asignado' : 'Sin asignar'}</Badge>
              </button>
            );
          })}
        </div>
      )}
      <div className="flex gap-3 pt-4">
        <button onClick={onClose} className="btn-primary w-full">Cerrar</button>
      </div>
    </Modal>
  );
}

// ============================================================
// CARTA DE SERVICIO MODAL
// ============================================================
function CartaServicioModal({
  servicioId, carta, isStaff, onClose,
}: {
  servicioId: string;
  carta: CartaServicio | null;
  isStaff: boolean;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const [directrices, setDirectrices] = useState(carta?.directrices ?? '');
  const [vehiculos, setVehiculos] = useState(carta?.vehiculos ?? []);
  const [conductores, setConductores] = useState(carta?.conductores ?? []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const handleSave = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);

    const payload = {
      servicio_id: servicioId,
      directrices: directrices || null,
      vehiculos,
      conductores,
      created_by: carta?.created_by ?? user.id,
    };

    let result;
    if (carta) {
      result = await supabase.from('carta_servicio').update(payload).eq('id', carta.id);
    } else {
      result = await supabase.from('carta_servicio').insert(payload);
    }

    if (result.error) setError(result.error.message);
    else { setEditing(false); onClose(); }
    setLoading(false);
  };

  return (
    <Modal open onClose={onClose} title="Carta de Servicio" size="lg">
      {error && <div className="text-sm text-error-600 bg-error-50 rounded-xl px-4 py-3 mb-4">{error}</div>}

      {/* Directrices */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <FileText size={16} className="text-primary-600" /> Directrices
          </h3>
          {isStaff && !editing && carta && (
            <button onClick={() => setEditing(true)} className="text-xs text-primary-600 font-medium">Editar</button>
          )}
        </div>
        {editing || !carta ? (
          <textarea
            className="input min-h-[120px]"
            value={directrices}
            onChange={(e) => setDirectrices(e.target.value)}
            placeholder="Directrices del servicio, instrucciones, protocolos..."
          />
        ) : (
          <p className="text-sm text-gray-600 whitespace-pre-wrap bg-gray-50 rounded-xl p-3 min-h-[60px]">
            {directrices || 'Sin directrices'}
          </p>
        )}
      </div>

      {/* Vehículos */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <Car size={16} className="text-primary-600" /> Vehículos
          </h3>
          {isStaff && (editing || !carta) && (
            <button
              onClick={() => setVehiculos([...vehiculos, { tipo: '', matricula: '' }])}
              className="text-xs text-primary-600 font-medium"
            >
              + Añadir
            </button>
          )}
        </div>
        <div className="space-y-2">
          {vehiculos.length === 0 && !editing && carta && <p className="text-sm text-gray-400">Sin vehículos asignados</p>}
          {vehiculos.map((v, idx) => (
            <div key={idx} className="flex gap-2 items-center">
              {editing || !carta ? (
                <>
                  <input
                    className="input flex-1"
                    placeholder="Tipo (Ambulancia, Furgoneta...)"
                    value={v.tipo}
                    onChange={(e) => {
                      const next = [...vehiculos];
                      next[idx] = { ...next[idx], tipo: e.target.value };
                      setVehiculos(next);
                    }}
                  />
                  <input
                    className="input flex-1"
                    placeholder="Matrícula"
                    value={v.matricula}
                    onChange={(e) => {
                      const next = [...vehiculos];
                      next[idx] = { ...next[idx], matricula: e.target.value };
                      setVehiculos(next);
                    }}
                  />
                  <button
                    onClick={() => setVehiculos(vehiculos.filter((_, i) => i !== idx))}
                    className="p-2 text-error-500 hover:bg-error-50 rounded-lg"
                  >
                    <X size={18} />
                  </button>
                </>
              ) : (
                <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2 w-full">
                  <Car size={16} className="text-gray-400" />
                  <span className="text-sm text-gray-700">{v.tipo || 'N/A'}</span>
                  <span className="text-xs text-gray-400 ml-auto">{v.matricula || 'N/A'}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Conductores */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <User size={16} className="text-primary-600" /> Conductores
          </h3>
          {isStaff && (editing || !carta) && (
            <button
              onClick={() => setConductores([...conductores, { nombre: '', licencia: '' }])}
              className="text-xs text-primary-600 font-medium"
            >
              + Añadir
            </button>
          )}
        </div>
        <div className="space-y-2">
          {conductores.length === 0 && !editing && carta && <p className="text-sm text-gray-400">Sin conductores asignados</p>}
          {conductores.map((c, idx) => (
            <div key={idx} className="flex gap-2 items-center">
              {editing || !carta ? (
                <>
                  <input
                    className="input flex-1"
                    placeholder="Nombre"
                    value={c.nombre}
                    onChange={(e) => {
                      const next = [...conductores];
                      next[idx] = { ...next[idx], nombre: e.target.value };
                      setConductores(next);
                    }}
                  />
                  <input
                    className="input flex-1"
                    placeholder="Licencia"
                    value={c.licencia}
                    onChange={(e) => {
                      const next = [...conductores];
                      next[idx] = { ...next[idx], licencia: e.target.value };
                      setConductores(next);
                    }}
                  />
                  <button
                    onClick={() => setConductores(conductores.filter((_, i) => i !== idx))}
                    className="p-2 text-error-500 hover:bg-error-50 rounded-lg"
                  >
                    <X size={18} />
                  </button>
                </>
              ) : (
                <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2 w-full">
                  <User size={16} className="text-gray-400" />
                  <span className="text-sm text-gray-700">{c.nombre || 'N/A'}</span>
                  <span className="text-xs text-gray-400 ml-auto">{c.licencia || 'N/A'}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Save button */}
      {isStaff && (editing || !carta) && (
        <div className="flex gap-3 pt-2">
          {carta && editing && (
            <button onClick={() => { setEditing(false); onClose(); }} className="btn-outline flex-1">
              Cancelar
            </button>
          )}
          <button onClick={handleSave} disabled={loading} className="btn-primary flex-1">
            {loading ? 'Guardando...' : 'Guardar carta'}
          </button>
        </div>
      )}

      {!isStaff && !carta && (
        <p className="text-sm text-gray-400 text-center py-4">
          La carta de servicio aún no ha sido creada por el coordinador.
        </p>
      )}
    </Modal>
  );
}
