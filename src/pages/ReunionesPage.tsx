import { useEffect, useState, useCallback } from 'react';
import { CalendarDays, Plus, MapPin, Clock, Check, X, Share2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { supabase, type Reunion, type ReunionRespuesta } from '@/lib/supabase';
import { processPendingPushNotifications } from '@/lib/push';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

function shareOnWhatsApp(text: string) {
  const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank');
}

function buildReunionShareText(r: Reunion): string {
  const fecha = new Date(r.fecha);
  let text = `*${r.titulo}*\n`;
  text += `📅 ${fecha.toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })} a las ${fecha.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}\n`;
  if (r.ubicacion) text += `📍 ${r.ubicacion}\n`;
  if (r.descripcion) text += `\n${r.descripcion}\n`;
  text += `\n_Protección Civil Huelva_`;
  return text;
}

export function ReunionesPage() {
  const { profile, user } = useAuth();
  const isStaff = profile?.role === 'admin_tecnico' || profile?.role === 'coordinador';

  const [loading, setLoading] = useState(true);
  const [reuniones, setReuniones] = useState<(Reunion & { my_respuesta?: string; respuestas_count: number; asisten_count: number; no_asisten_count: number })[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Reunion | null>(null);
  const [viewReunion, setViewReunion] = useState<Reunion | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchReuniones = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [reuRes, respRes] = await Promise.all([
      supabase.from('reuniones').select('*').order('fecha', { ascending: false }),
      supabase.from('reunion_respuestas').select('reunion_id, user_id, respuesta'),
    ]);
    const myRespuestas = new Map<string, string>();
    const counts = new Map<string, { total: number; asisten: number; noAsisten: number }>();
    for (const response of (respRes.data ?? [])) {
      const current = counts.get(response.reunion_id) ?? { total: 0, asisten: 0, noAsisten: 0 };
      current.total += 1;
      if (response.respuesta === 'asisto') current.asisten += 1;
      if (response.respuesta === 'no_asisto') current.noAsisten += 1;
      counts.set(response.reunion_id, current);
      if (response.user_id === user.id) myRespuestas.set(response.reunion_id, response.respuesta);
    }
    const reunionesWithMine = (reuRes.data ?? []).map((r: Reunion) => {
      const count = counts.get(r.id) ?? { total: 0, asisten: 0, noAsisten: 0 };
      return {
        ...r,
        my_respuesta: myRespuestas.get(r.id),
        respuestas_count: count.total,
        asisten_count: count.asisten,
        no_asisten_count: count.noAsisten,
      };
    });
    setReuniones(reunionesWithMine);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchReuniones();
  }, [fetchReuniones]);

  const handleRespond = async (reunionId: string, respuesta: 'asisto' | 'no_asisto') => {
    if (!user) return;
    const { data: existing } = await supabase
      .from('reunion_respuestas')
      .select('id')
      .eq('reunion_id', reunionId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (existing) {
      await supabase
        .from('reunion_respuestas')
        .update({ respuesta, responded_at: new Date().toISOString() })
        .eq('id', existing.id);
    } else {
      await supabase
        .from('reunion_respuestas')
        .insert({ reunion_id: reunionId, user_id: user.id, respuesta });
    }
    fetchReuniones();
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    const { error: delError } = await supabase.from('reuniones').delete().eq('id', confirmDelete.id);
    if (delError) {
      setError(`Error al eliminar: ${delError.message}`);
    } else {
      setConfirmDelete(null);
      fetchReuniones();
    }
  };

  if (loading) return <div className="flex justify-center py-20"><Spinner size={32} /></div>;

  const now = new Date();
  const proximas = reuniones.filter((r) => new Date(r.fecha) >= now);
  const pasadas = reuniones.filter((r) => new Date(r.fecha) < now);

  return (
    <div className="px-4 py-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900">Reuniones y Comunicaciones</h1>
        {isStaff && (
          <button onClick={() => setShowCreate(true)} className="btn-primary">
            <Plus size={18} /> Nueva
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 text-sm text-error-600 bg-error-50 rounded-xl px-4 py-3 flex items-center justify-between">
          {error}
          <button onClick={() => setError(null)} className="text-error-400"><X size={16} /></button>
        </div>
      )}

      {reuniones.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No hay reuniones"
          description={isStaff ? "Crea una reunión para notificar a los voluntarios." : "No hay reuniones programadas."}
          action={isStaff ? <button onClick={() => setShowCreate(true)} className="btn-primary"><Plus size={18} /> Crear reunión</button> : undefined}
        />
      ) : (
        <>
          {proximas.length > 0 && (
            <div className="mb-6">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Próximas reuniones</h2>
              <div className="space-y-3">
                {proximas.map((r) => (
                  <ReunionCard
                    key={r.id}
                    reunion={r}
                    isStaff={isStaff}
                    onView={() => setViewReunion(r)}
                    onDelete={() => setConfirmDelete(r)}
                    onRespond={(resp) => handleRespond(r.id, resp)}
                  />
                ))}
              </div>
            </div>
          )}

          {pasadas.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-500 mb-3">Reuniones pasadas</h2>
              <div className="space-y-2">
                {pasadas.map((r) => (
                  <ReunionCard
                    key={r.id}
                    reunion={r}
                    isStaff={isStaff}
                    onView={() => setViewReunion(r)}
                    onDelete={() => setConfirmDelete(r)}
                    onRespond={() => {}}
                    past
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {showCreate && (
        <CreateReunionModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); fetchReuniones(); }} />
      )}

      {viewReunion && (
        <ReunionDetailModal
          reunion={viewReunion}
          isStaff={isStaff}
          onClose={() => setViewReunion(null)}
        />
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={handleDelete}
        title="Eliminar reunión"
        message="¿Seguro que quieres eliminar esta reunión?"
        confirmText="Eliminar"
        danger
      />
    </div>
  );
}

function ReunionCard({
  reunion, isStaff, onView, onDelete, onRespond, past,
}: {
  reunion: Reunion & { my_respuesta?: string; respuestas_count: number; asisten_count: number; no_asisten_count: number };
  isStaff: boolean;
  onView: () => void;
  onDelete: () => void;
  onRespond: (respuesta: 'asisto' | 'no_asisto') => void;
  past?: boolean;
}) {
  const fecha = new Date(reunion.fecha);
  return (
    <div className={`card p-4 ${past ? 'opacity-70' : ''}`}>
      <div className="flex items-start justify-between mb-2">
        <button onClick={onView} className="text-left flex-1">
          <p className="font-semibold text-gray-900 text-sm">{reunion.titulo}</p>
          {reunion.descripcion && <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">{reunion.descripcion}</p>}
        </button>
        <div className="flex items-center gap-1 ml-2">
          <button
            onClick={() => shareOnWhatsApp(buildReunionShareText(reunion))}
            className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 transition-colors"
            title="Compartir por WhatsApp"
          >
            <Share2 size={16} />
          </button>
          {isStaff && (
            <button onClick={onDelete} className="p-1.5 rounded-lg text-error-400 hover:text-error-600 hover:bg-error-50 transition-colors" title="Eliminar">
              <X size={16} />
            </button>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 text-xs text-gray-500 mb-3">
        <span className="flex items-center gap-1">
          <CalendarDays size={12} />
          {fecha.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
        </span>
        <span className="flex items-center gap-1">
          <Clock size={12} />
          {fecha.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
        </span>
        {reunion.ubicacion && <span className="flex items-center gap-1"><MapPin size={12} /> {reunion.ubicacion}</span>}
      </div>
      <p className="text-xs text-gray-500 mb-3">Respuestas: {reunion.respuestas_count} · Asisten: {reunion.asisten_count} · No asisten: {reunion.no_asisten_count}</p>
      {!past && (
        <div className="flex gap-2">
          <button
            onClick={() => onRespond('asisto')}
            className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-1.5 border ${
              reunion.my_respuesta === 'asisto'
                ? 'bg-success-500 text-white border-success-500'
                : 'bg-success-50 text-success-700 hover:bg-success-100 border-success-200'
            }`}
          >
            <Check size={16} /> Asisto
          </button>
          <button
            onClick={() => onRespond('no_asisto')}
            className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-1.5 border ${
              reunion.my_respuesta === 'no_asisto'
                ? 'bg-error-500 text-white border-error-500'
                : 'bg-error-50 text-error-600 hover:bg-error-100 border-error-200'
            }`}
          >
            <X size={16} /> No asisto
          </button>
        </div>
      )}
    </div>
  );
}

function ReunionDetailModal({ reunion, isStaff, onClose }: { reunion: Reunion; isStaff: boolean; onClose: () => void }) {
  const [respuestas, setRespuestas] = useState<ReunionRespuesta[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRespuestas = async () => {
      const { data } = await supabase
        .from('reunion_respuestas')
        .select('*')
        .eq('reunion_id', reunion.id)
        .order('responded_at', { ascending: false });
      const rawRespuestas = (data ?? []) as ReunionRespuesta[];
      const userIds = [...new Set(rawRespuestas.map((respuesta) => respuesta.user_id))];
      const { data: profiles } = userIds.length > 0
        ? await supabase.from('profiles').select('*').in('id', userIds)
        : { data: [] };
      const profilesById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
      setRespuestas(rawRespuestas.map((respuesta) => ({
        ...respuesta,
        profile: profilesById.get(respuesta.user_id),
      })));
      setLoading(false);
    };
    fetchRespuestas();
  }, [reunion.id]);

  const asisten = respuestas.filter((r) => r.respuesta === 'asisto');
  const noAsisten = respuestas.filter((r) => r.respuesta === 'no_asisto');

  return (
    <Modal open onClose={onClose} title={reunion.titulo} size="md">
      <div className="space-y-4">
        {reunion.descripcion && <p className="text-sm text-gray-600">{reunion.descripcion}</p>}
        <div className="flex flex-wrap gap-3 text-sm text-gray-500">
          <span className="flex items-center gap-1">
            <CalendarDays size={14} />
            {new Date(reunion.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })}
          </span>
          <span className="flex items-center gap-1">
            <Clock size={14} />
            {new Date(reunion.fecha).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
          </span>
          {reunion.ubicacion && <span className="flex items-center gap-1"><MapPin size={14} /> {reunion.ubicacion}</span>}
        </div>

        <button
          onClick={() => shareOnWhatsApp(buildReunionShareText(reunion))}
          className="w-full py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2 bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 transition-all"
        >
          <Share2 size={16} /> Compartir por WhatsApp
        </button>

        {loading ? (
          <Spinner size={24} />
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-success-50 rounded-xl p-3">
                <p className="text-xs text-success-600 font-medium mb-1">Asisten</p>
                <p className="text-2xl font-bold text-success-700">{asisten.length}</p>
              </div>
              <div className="bg-error-50 rounded-xl p-3">
                <p className="text-xs text-error-600 font-medium mb-1">No asisten</p>
                <p className="text-2xl font-bold text-error-700">{noAsisten.length}</p>
              </div>
            </div>

            {asisten.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1">
                  <Check size={14} className="text-success-600" /> Asisten ({asisten.length})
                </p>
                <div className="space-y-1">
                  {asisten.map((r) => (
                    <div key={r.id} className="flex items-center gap-2 py-1">
                      <div className="w-7 h-7 rounded-full bg-success-100 flex items-center justify-center text-xs font-bold text-success-700">
                        {isStaff ? `${r.profile?.nombre?.[0] ?? '?'}${r.profile?.apellidos?.[0] ?? ''}` : '✓'}
                      </div>
                      <span className="text-sm text-gray-700">
                        {isStaff ? `${r.profile?.nombre} ${r.profile?.apellidos}` : 'Voluntario'}
                      </span>
                      {isStaff && r.profile?.indicativo && <Badge variant="gray">{r.profile.indicativo}</Badge>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {noAsisten.length > 0 && isStaff && (
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1">
                  <X size={14} className="text-error-600" /> No asisten ({noAsisten.length})
                </p>
                <div className="space-y-1">
                  {noAsisten.map((r) => (
                    <div key={r.id} className="flex items-center gap-2 py-1">
                      <div className="w-7 h-7 rounded-full bg-error-100 flex items-center justify-center text-xs font-bold text-error-700">
                        {r.profile?.nombre?.[0] ?? '?'}{r.profile?.apellidos?.[0] ?? ''}
                      </div>
                      <span className="text-sm text-gray-700">
                        {r.profile?.nombre} {r.profile?.apellidos}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {respuestas.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">Sin respuestas todavía</p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

function CreateReunionModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { user } = useAuth();
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [fecha, setFecha] = useState('');
  const [ubicacion, setUbicacion] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    setError(null);

    const { error } = await supabase.from('reuniones').insert({
      titulo,
      descripcion: descripcion || null,
      fecha: new Date(fecha).toISOString(),
      ubicacion: ubicacion || null,
      created_by: user.id,
    });

    if (error) setError('No se pudo crear la reunión.');
    else { await processPendingPushNotifications(); onCreated(); }
    setLoading(false);
  };

  return (
    <Modal open onClose={onClose} title="Nueva reunión" size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label">Título</label>
          <input className="input" value={titulo} onChange={(e) => setTitulo(e.target.value)} required placeholder="Ej: Reunión mensual de coordinación" />
        </div>
        <div>
          <label className="label">Descripción</label>
          <textarea className="input min-h-[80px]" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Orden del día, temas a tratar..." />
        </div>
        <div>
          <label className="label">Fecha y hora</label>
          <input type="datetime-local" className="input" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
        </div>
        <div>
          <label className="label">Ubicación</label>
          <input className="input" value={ubicacion} onChange={(e) => setUbicacion(e.target.value)} placeholder="Ej: Sede de Protección Civil" />
        </div>
        {error && <div className="text-sm text-error-600 bg-error-50 rounded-xl px-4 py-3">{error}</div>}
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="btn-outline flex-1">Cancelar</button>
          <button type="submit" disabled={loading} className="btn-primary flex-1">
            {loading ? 'Creando...' : 'Crear reunión'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
