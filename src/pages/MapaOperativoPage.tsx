import { useCallback, useEffect, useMemo, useState } from 'react';
import { Crosshair, Droplets, MapPinned, MapPin, Plus, RefreshCw, Route, Shield, Trash2, Truck, X, Flag, Navigation } from 'lucide-react';
import L from 'leaflet';
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useAuth } from '@/context/AuthContext';
import { supabase, type OperationalPoi, type OperationalVehicle, type PoiCategory, type RouteType, type RouteWaypoint, type SpecialRoute, type VehicleStatus, type VehicleType, type WaypointType } from '@/lib/supabase';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';

const huelvaCenter: [number, number] = [37.2614, -6.9447];

const poiConfig: Record<PoiCategory, { label: string; shortLabel: string; color: string; icon: typeof Shield }> = {
  socorro_encuentro: { label: 'Puestos de socorro / Encuentro', shortLabel: 'Socorro', color: '#dc2626', icon: Shield },
  hidrante: { label: 'Bocas de riego / Hidrantes', shortLabel: 'Hidrantes', color: '#2563eb', icon: Droplets },
  riesgo_evacuacion: { label: 'Zonas de riesgo / Evacuación', shortLabel: 'Riesgo', color: '#d97706', icon: Route },
};

const vehicleTypeConfig: Record<VehicleType, { label: string; color: string }> = {
  vir: { label: 'VIR', color: '#16a34a' },
  coordinacion: { label: 'Coordinación', color: '#9333ea' },
  ambulancia: { label: 'Ambulancia', color: '#dc2626' },
  logistica: { label: 'Logística', color: '#0891b2' },
  otro: { label: 'Otro', color: '#475569' },
};

const vehicleStatusConfig: Record<VehicleStatus, { label: string; color: string }> = {
  en_base: { label: 'En base', color: 'gray' },
  en_ruta: { label: 'En ruta', color: 'primary' },
  en_incidencia: { label: 'En incidencia', color: 'error' },
};

const routeTypeConfig: Record<RouteType, { label: string }> = {
  procesion: { label: 'Procesión' },
  carrera_popular: { label: 'Carrera popular' },
  manifestacion: { label: 'Manifestación' },
  otro: { label: 'Otro evento' },
};

const waypointTypeConfig: Record<WaypointType, { label: string; color: string }> = {
  recorrido: { label: 'Recorrido', color: '#334155' },
  pk_critico: { label: 'PK crítico', color: '#d97706' },
  corte_trafico: { label: 'Corte de tráfico', color: '#dc2626' },
  retene: { label: 'Retén estático', color: '#16a34a' },
};

function createPoiIcon(category: PoiCategory) {
  const { color } = poiConfig[category];
  return L.divIcon({
    className: 'poi-marker',
    html: `<div style="background:${color};width:34px;height:34px;border:3px solid white;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 2px 7px rgba(15,23,42,.35);display:flex;align-items:center;justify-content:center"><span style="width:9px;height:9px;border-radius:50%;background:white"></span></div>`,
    iconSize: [34, 34], iconAnchor: [17, 34], popupAnchor: [0, -34],
  });
}

function createVehicleIcon(type: VehicleType, status: VehicleStatus) {
  const { color } = vehicleTypeConfig[type];
  const pulse = status === 'en_incidencia' ? 'animation:vehiclePulse 1.5s infinite;' : '';
  return L.divIcon({
    className: 'vehicle-marker',
    html: `<div style="${pulse}background:${color};width:36px;height:36px;border:3px solid white;border-radius:50%;box-shadow:0 2px 8px rgba(15,23,42,.4);display:flex;align-items:center;justify-content:center"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 17h-2v-5l2-5h11l4 4v6h-2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/></svg></div>`,
    iconSize: [36, 36], iconAnchor: [18, 18], popupAnchor: [0, -18],
  });
}

function createWaypointIcon(type: WaypointType) {
  const { color } = waypointTypeConfig[type];
  if (type === 'retene' || type === 'corte_trafico') {
    return L.divIcon({ className: 'waypoint-marker', html: `<div style="background:${color};width:28px;height:28px;border:2.5px solid white;border-radius:4px;box-shadow:0 2px 5px rgba(15,23,42,.3);display:flex;align-items:center;justify-content:center"><span style="width:10px;height:10px;border-radius:50%;background:white"></span></div>`, iconSize: [28, 28], iconAnchor: [14, 14], popupAnchor: [0, -14] });
  }
  return L.divIcon({ className: 'waypoint-marker', html: `<div style="background:${color};width:22px;height:22px;border:2px solid white;border-radius:50%;box-shadow:0 2px 5px rgba(15,23,42,.3)"></div>`, iconSize: [22, 22], iconAnchor: [11, 11], popupAnchor: [0, -11] });
}

const selectedIcon = L.divIcon({ className: 'selected-marker', html: '<div style="width:24px;height:24px;border:3px solid white;border-radius:50%;background:#0f766e;box-shadow:0 0 0 3px rgba(15,118,110,.3)"></div>', iconSize: [24, 24], iconAnchor: [12, 12] });

type AddMode = 'poi' | 'vehicle' | 'waypoint' | null;

function MapClickHandler({ mode, onSelect }: { mode: AddMode; onSelect: (lat: number, lng: number) => void }) {
  useMapEvents({ click(event) { if (mode) onSelect(Number(event.latlng.lat.toFixed(6)), Number(event.latlng.lng.toFixed(6))); } });
  return null;
}

type TabView = 'general' | 'vehiculos' | 'rutas';

export function MapaOperativoPage() {
  const { profile } = useAuth();
  const canManage = profile?.role === 'admin_tecnico' || profile?.role === 'coordinador';
  const [tab, setTab] = useState<TabView>('general');
  const [pois, setPois] = useState<OperationalPoi[]>([]);
  const [vehicles, setVehicles] = useState<OperationalVehicle[]>([]);
  const [routes, setRoutes] = useState<SpecialRoute[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [waypoints, setWaypoints] = useState<RouteWaypoint[]>([]);
  const [activeLayers, setActiveLayers] = useState<Record<PoiCategory, boolean>>({ socorro_encuentro: true, hidrante: true, riesgo_evacuacion: true });
  const [showVehicles, setShowVehicles] = useState(true);
  const [showRoute, setShowRoute] = useState(true);
  const [loading, setLoading] = useState(true);
  const [addMode, setAddMode] = useState<AddMode>(null);
  const [selectedLocation, setSelectedLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [poiName, setPoiName] = useState('');
  const [poiDescription, setPoiDescription] = useState('');
  const [poiCategory, setPoiCategory] = useState<PoiCategory>('socorro_encuentro');

  const [vehicleName, setVehicleName] = useState('');
  const [vehicleType, setVehicleType] = useState<VehicleType>('vir');
  const [vehicleStatus, setVehicleStatus] = useState<VehicleStatus>('en_base');

  const [showRouteModal, setShowRouteModal] = useState(false);
  const [routeName, setRouteName] = useState('');
  const [routeType, setRouteType] = useState<RouteType>('procesion');
  const [routeDate, setRouteDate] = useState('');
  const [routeDescription, setRouteDescription] = useState('');
  const [waypointType, setWaypointType] = useState<WaypointType>('recorrido');
  const [waypointLabel, setWaypointLabel] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [poiRes, vehicleRes, routeRes] = await Promise.all([
      supabase.from('puntos_interes').select('*').eq('is_active', true).order('created_at', { ascending: false }),
      supabase.from('vehiculos_operativos').select('*').eq('is_active', true).order('created_at', { ascending: false }),
      supabase.from('rutas_especiales').select('*').eq('is_active', true).order('fecha', { ascending: true }),
    ]);
    setPois((poiRes.data ?? []) as OperationalPoi[]);
    setVehicles((vehicleRes.data ?? []) as OperationalVehicle[]);
    setRoutes((routeRes.data ?? []) as SpecialRoute[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const fetchWaypoints = useCallback(async (routeId: string) => {
    const { data } = await supabase.from('ruta_waypoints').select('*').eq('ruta_id', routeId).order('orden', { ascending: true });
    setWaypoints((data ?? []) as RouteWaypoint[]);
  }, []);

  useEffect(() => {
    if (selectedRouteId) { fetchWaypoints(selectedRouteId); } else { setWaypoints([]); }
  }, [selectedRouteId, fetchWaypoints]);

  const visiblePois = useMemo(() => pois.filter((p) => activeLayers[p.categoria]), [activeLayers, pois]);
  const routeLinePoints = useMemo(() => waypoints.filter((w) => w.tipo === 'recorrido' || w.tipo === 'pk_critico').map((w) => [w.latitud, w.longitud] as [number, number]), [waypoints]);

  const toggleLayer = (layer: PoiCategory) => setActiveLayers((c) => ({ ...c, [layer]: !c[layer] }));

  const handleMapClick = (lat: number, lng: number) => { setSelectedLocation({ lat, lng }); setError(null); };
  const startAdd = (mode: AddMode) => { setAddMode(mode); setSelectedLocation(null); setError(null); };
  const cancelAdd = () => { setAddMode(null); setSelectedLocation(null); setPoiName(''); setPoiDescription(''); setVehicleName(''); setWaypointLabel(''); };

  const savePoi = async () => {
    if (!selectedLocation || poiName.trim().length < 2) { setError('Selecciona una ubicación y escribe un nombre.'); return; }
    setSaving(true); setError(null);
    const { error: e } = await supabase.from('puntos_interes').insert({ nombre: poiName.trim(), descripcion: poiDescription.trim() || null, categoria: poiCategory, latitud: selectedLocation.lat, longitud: selectedLocation.lng });
    if (e) setError('No se pudo guardar el punto.'); else { cancelAdd(); await fetchAll(); }
    setSaving(false);
  };

  const saveVehicle = async () => {
    if (!selectedLocation || vehicleName.trim().length < 2) { setError('Selecciona una ubicación y escribe un nombre.'); return; }
    setSaving(true); setError(null);
    const { error: e } = await supabase.from('vehiculos_operativos').insert({ nombre: vehicleName.trim(), tipo: vehicleType, estado: vehicleStatus, latitud: selectedLocation.lat, longitud: selectedLocation.lng });
    if (e) setError('No se pudo guardar el vehículo.'); else { cancelAdd(); await fetchAll(); }
    setSaving(false);
  };

  const updateVehicleStatus = async (id: string, status: VehicleStatus) => {
    const { error: e } = await supabase.from('vehiculos_operativos').update({ estado: status, updated_at: new Date().toISOString() }).eq('id', id);
    if (!e) setVehicles((c) => c.map((v) => v.id === id ? { ...v, estado: status } : v));
  };

  const handleDeactivateVehicle = useCallback(async (id: string) => {
    const { error: e } = await supabase.from('vehiculos_operativos').update({ is_active: false }).eq('id', id);
    if (!e) setVehicles((c) => c.filter((v) => v.id !== id));
  }, []);

  const handleDeactivatePoi = useCallback(async (id: string) => {
    const { error: e } = await supabase.from('puntos_interes').update({ is_active: false }).eq('id', id);
    if (!e) setPois((c) => c.filter((p) => p.id !== id));
  }, []);

  const createRoute = async () => {
    if (routeName.trim().length < 3 || !routeDate) { setError('Escribe un nombre y fecha para la ruta.'); return; }
    setSaving(true); setError(null);
    const { data, error: e } = await supabase.from('rutas_especiales').insert({ nombre: routeName.trim(), tipo: routeType, fecha: new Date(routeDate).toISOString(), descripcion: routeDescription.trim() || null }).select().single();
    if (e) setError('No se pudo crear la ruta.'); else { setShowRouteModal(false); setRouteName(''); setRouteDate(''); setRouteDescription(''); setSelectedRouteId(data.id); setAddMode('waypoint'); await fetchAll(); }
    setSaving(false);
  };

  const addWaypoint = async () => {
    if (!selectedRouteId || !selectedLocation) { setError('Selecciona una ubicación en el mapa.'); return; }
    setSaving(true); setError(null);
    const nextOrden = waypoints.length > 0 ? Math.max(...waypoints.map((w) => w.orden)) + 1 : 0;
    const { error: e } = await supabase.from('ruta_waypoints').insert({ ruta_id: selectedRouteId, orden: nextOrden, tipo: waypointType, latitud: selectedLocation.lat, longitud: selectedLocation.lng, etiqueta: waypointLabel.trim() || null });
    if (e) setError('No se pudo añadir el punto.'); else { setSelectedLocation(null); setWaypointLabel(''); await fetchWaypoints(selectedRouteId); }
    setSaving(false);
  };

  const handleRemoveWaypoint = useCallback(async (id: string) => {
    await supabase.from('ruta_waypoints').delete().eq('id', id);
    if (selectedRouteId) await fetchWaypoints(selectedRouteId);
  }, [selectedRouteId, fetchWaypoints]);

  const handleDeactivateRoute = useCallback(async (id: string) => {
    const { error: e } = await supabase.from('rutas_especiales').update({ is_active: false }).eq('id', id);
    if (!e) { setSelectedRouteId(null); setRoutes((c) => c.filter((r) => r.id !== id)); setWaypoints([]); }
  }, []);

  const modeLabel = addMode === 'poi' ? 'Toca el mapa para situar el nuevo punto de interés.' : addMode === 'vehicle' ? 'Toca el mapa para situar el vehículo operativo.' : addMode === 'waypoint' ? 'Toca el mapa para añadir el siguiente punto de la ruta.' : '';

  return (
    <div className="px-4 py-4 max-w-5xl mx-auto space-y-4">
      <style>{'@keyframes vehiclePulse{0%,100%{opacity:1}50%{opacity:.55}}'}</style>
      <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-600">Cartografía operativa</p><h1 className="text-xl font-bold text-gray-900">Mapa táctico</h1><p className="text-sm text-gray-500 mt-1">Puntos de interés, vehículos y rutas especiales de Huelva.</p></div><div className="w-10 h-10 rounded-xl bg-primary-50 text-primary-700 flex items-center justify-center"><MapPinned size={22} /></div></div>

      <div className="flex gap-2">
        {([['general', 'Puntos de interés'], ['vehiculos', 'Vehículos'], ['rutas', 'Rutas especiales']] as [TabView, string][]).map(([id, label]) => <button key={id} onClick={() => { setTab(id); cancelAdd(); }} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === id ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>{label}</button>)}
      </div>

      {tab === 'general' && <div className="card p-3"><div className="flex items-center justify-between gap-2 mb-3"><p className="text-xs font-semibold text-gray-700">Capas visibles</p><button onClick={fetchAll} className="p-2 rounded-lg text-primary-600 hover:bg-primary-50" aria-label="Actualizar"><RefreshCw size={16} /></button></div><div className="grid grid-cols-1 sm:grid-cols-3 gap-2">{(Object.keys(poiConfig) as PoiCategory[]).map((layer) => { const config = poiConfig[layer]; const Icon = config.icon; return <button key={layer} onClick={() => toggleLayer(layer)} className={`flex items-center gap-2 p-2.5 rounded-xl border text-left transition-colors ${activeLayers[layer] ? 'border-gray-200 bg-gray-50 text-gray-800' : 'border-gray-100 bg-white text-gray-400 opacity-60'}`}><span className="w-3 h-3 rounded-full" style={{ backgroundColor: config.color }} /><Icon size={16} style={{ color: config.color }} /><span className="text-xs font-medium leading-tight">{config.label}</span></button>; })}</div></div>}

      {tab === 'vehiculos' && <div className="card p-3"><div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold text-gray-700">Vehículos operativos ({vehicles.length})</p><div className="flex items-center gap-2"><button onClick={() => setShowVehicles((v) => !v)} className={`px-2.5 py-1 rounded-lg text-xs font-medium border ${showVehicles ? 'border-primary-200 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-400'}`}>{showVehicles ? 'Visibles' : 'Ocultos'}</button><button onClick={fetchAll} className="p-2 rounded-lg text-primary-600 hover:bg-primary-50" aria-label="Actualizar"><RefreshCw size={16} /></button></div></div></div>}

      {tab === 'rutas' && <div className="card p-3 space-y-3"><div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold text-gray-700">Rutas especiales ({routes.length})</p>{canManage && !showRouteModal && !selectedRouteId && <button onClick={() => setShowRouteModal(true)} className="btn-primary text-xs px-3 py-1.5"><Plus size={14} /> Nueva ruta</button>}</div><div className="flex flex-wrap gap-2">{routes.map((r) => <button key={r.id} onClick={() => { setSelectedRouteId(r.id); setAddMode(null); }} className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${selectedRouteId === r.id ? 'border-primary-500 bg-primary-50 text-primary-800' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}><Flag size={12} className="inline mr-1" />{r.nombre}<span className="ml-1.5 text-gray-400">{routeTypeConfig[r.tipo].label}</span></button>)}</div>{selectedRouteId && (() => { const route = routes.find((r) => r.id === selectedRouteId); return route ? <div className="rounded-xl bg-primary-50 border border-primary-100 px-3 py-2.5 flex items-center justify-between gap-2"><div><p className="text-sm font-semibold text-primary-900">{route.nombre}</p><p className="text-[11px] text-primary-700">{new Date(route.fecha).toLocaleString('es-ES', { day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' })} · {waypoints.length} puntos</p></div><div className="flex items-center gap-1">{canManage && <button onClick={() => setAddMode('waypoint')} className="btn-primary text-xs px-2.5 py-1"><Plus size={13} /> Punto</button>}<button onClick={() => setShowRoute((v) => !v)} className={`px-2.5 py-1 rounded-lg text-xs font-medium border ${showRoute ? 'border-primary-200 bg-white text-primary-700' : 'border-gray-200 text-gray-400'}`}>{showRoute ? 'Trazado visible' : 'Trazado oculto'}</button>{canManage && <button onClick={() => handleDeactivateRoute(route.id)} className="p-1.5 rounded-lg text-error-500 hover:bg-error-50"><Trash2 size={15} /></button>}</div></div> : null; })()}</div>}

      <div className="relative rounded-2xl overflow-hidden border border-gray-200 shadow-sm bg-slate-100">
        <MapContainer center={huelvaCenter} zoom={13} scrollWheelZoom className="h-[min(68vh,560px)] min-h-[390px] w-full">
          <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <MapClickHandler mode={addMode} onSelect={handleMapClick} />
          {tab === 'general' && visiblePois.map((poi) => <Marker key={poi.id} position={[poi.latitud, poi.longitud]} icon={createPoiIcon(poi.categoria)}><Popup><div className="min-w-[190px]"><p className="text-xs font-semibold uppercase tracking-wide" style={{ color: poiConfig[poi.categoria].color }}>{poiConfig[poi.categoria].label}</p><p className="font-bold text-gray-900 mt-1">{poi.nombre}</p>{poi.descripcion && <p className="text-sm text-gray-600 mt-1">{poi.descripcion}</p>}<p className="text-[11px] text-gray-400 mt-2">{poi.latitud.toFixed(5)}, {poi.longitud.toFixed(5)}</p>{canManage && <button onClick={() => handleDeactivatePoi(poi.id)} className="text-xs text-red-600 font-medium mt-2 flex items-center gap-1"><Trash2 size={13} /> Ocultar punto</button>}</div></Popup></Marker>)}
          {tab === 'vehiculos' && showVehicles && vehicles.map((v) => v.latitud !== null && v.longitud !== null && <Marker key={v.id} position={[v.latitud, v.longitud]} icon={createVehicleIcon(v.tipo, v.estado)}><Popup><div className="min-w-[200px]"><div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full" style={{ backgroundColor: vehicleTypeConfig[v.tipo].color }} /><p className="font-bold text-gray-900">{v.nombre}</p></div><p className="text-xs text-gray-500 mt-0.5">{vehicleTypeConfig[v.tipo].label}</p><div className="mt-2 flex items-center gap-2"><Badge variant={vehicleStatusConfig[v.estado].color as 'gray' | 'primary' | 'error'}>{vehicleStatusConfig[v.estado].label}</Badge><span className="text-[10px] text-gray-400">{new Date(v.updated_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</span></div>{canManage && <div className="mt-2 flex gap-1 flex-wrap">{(['en_base', 'en_ruta', 'en_incidencia'] as VehicleStatus[]).map((st) => <button key={st} onClick={() => updateVehicleStatus(v.id, st)} className={`text-[11px] px-2 py-1 rounded-lg border ${v.estado === st ? 'border-primary-400 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>{vehicleStatusConfig[st].label}</button>)}</div>}{canManage && <button onClick={() => handleDeactivateVehicle(v.id)} className="text-xs text-red-600 font-medium mt-2 flex items-center gap-1"><Trash2 size={13} /> Retirar vehículo</button>}</div></Popup></Marker>)}
          {tab === 'rutas' && selectedRouteId && showRoute && <>
            {routeLinePoints.length >= 2 && <Polyline positions={routeLinePoints} pathOptions={{ color: '#1d4ed8', weight: 4, opacity: 0.6, dashArray: '8 8' }} />}
            {waypoints.map((wp) => <Marker key={wp.id} position={[wp.latitud, wp.longitud]} icon={createWaypointIcon(wp.tipo)}><Popup><div className="min-w-[170px]"><p className="text-xs font-semibold uppercase" style={{ color: waypointTypeConfig[wp.tipo].color }}>{waypointTypeConfig[wp.tipo].label}</p>{wp.etiqueta && <p className="font-bold text-gray-900 mt-1">{wp.etiqueta}</p>}<p className="text-[11px] text-gray-400 mt-1">Punto {wp.orden + 1}</p>{canManage && <button onClick={() => handleRemoveWaypoint(wp.id)} className="text-xs text-red-600 font-medium mt-2 flex items-center gap-1"><Trash2 size={13} /> Eliminar punto</button>}</div></Popup></Marker>)}
          </>}
          {selectedLocation && <Marker position={[selectedLocation.lat, selectedLocation.lng]} icon={selectedIcon}><Popup>Ubicación seleccionada</Popup></Marker>}
        </MapContainer>
        {addMode && <div className="absolute top-3 left-3 right-3 z-[1000] rounded-xl bg-white/95 shadow-lg border border-primary-100 px-3 py-2 flex items-center gap-2"><Crosshair size={16} className="text-primary-600 flex-shrink-0" /><p className="text-xs text-gray-700 flex-1">{modeLabel}</p><button onClick={cancelAdd} className="p-1 text-gray-500"><X size={17} /></button></div>}
      </div>

      {tab === 'general' && canManage && (addMode === 'poi' ? <div className="card p-4 space-y-3"><h2 className="text-sm font-semibold text-gray-900">Nuevo punto de interés</h2><div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><div><label className="label">Categoría</label><select className="input" value={poiCategory} onChange={(e) => setPoiCategory(e.target.value as PoiCategory)}>{(Object.keys(poiConfig) as PoiCategory[]).map((item) => <option key={item} value={item}>{poiConfig[item].label}</option>)}</select></div><div><label className="label">Nombre</label><input className="input" value={poiName} onChange={(e) => setPoiName(e.target.value)} placeholder="Ej. Puesto de socorro 1" /></div></div><input className="input" value={poiDescription} onChange={(e) => setPoiDescription(e.target.value)} placeholder="Descripción opcional" />{selectedLocation ? <p className="text-xs text-success-700 bg-success-50 rounded-xl px-3 py-2 flex items-center gap-2"><MapPin size={14} /> {selectedLocation.lat.toFixed(5)}, {selectedLocation.lng.toFixed(5)}</p> : <p className="text-xs text-warning-700 bg-warning-50 rounded-xl px-3 py-2">Toca el mapa para seleccionar las coordenadas.</p>}{error && <p className="text-sm text-error-600 bg-error-50 rounded-xl px-3 py-2">{error}</p>}<div className="flex gap-2"><button onClick={cancelAdd} className="btn-outline flex-1">Cancelar</button><button onClick={savePoi} disabled={saving} className="btn-primary flex-1">{saving ? <Spinner size={16} /> : <Plus size={16} />} Guardar punto</button></div></div> : <button onClick={() => startAdd('poi')} className="btn-primary w-full"><Plus size={16} /> Añadir punto de interés</button>)}

      {tab === 'vehiculos' && canManage && (addMode === 'vehicle' ? <div className="card p-4 space-y-3"><h2 className="text-sm font-semibold text-gray-900">Nuevo vehículo operativo</h2><div className="grid grid-cols-1 sm:grid-cols-3 gap-3"><div><label className="label">Nombre</label><input className="input" value={vehicleName} onChange={(e) => setVehicleName(e.target.value)} placeholder="Ej. VIR-1" /></div><div><label className="label">Tipo</label><select className="input" value={vehicleType} onChange={(e) => setVehicleType(e.target.value as VehicleType)}>{(Object.keys(vehicleTypeConfig) as VehicleType[]).map((item) => <option key={item} value={item}>{vehicleTypeConfig[item].label}</option>)}</select></div><div><label className="label">Estado</label><select className="input" value={vehicleStatus} onChange={(e) => setVehicleStatus(e.target.value as VehicleStatus)}>{(Object.keys(vehicleStatusConfig) as VehicleStatus[]).map((item) => <option key={item} value={item}>{vehicleStatusConfig[item].label}</option>)}</select></div></div>{selectedLocation ? <p className="text-xs text-success-700 bg-success-50 rounded-xl px-3 py-2 flex items-center gap-2"><Navigation size={14} /> {selectedLocation.lat.toFixed(5)}, {selectedLocation.lng.toFixed(5)}</p> : <p className="text-xs text-warning-700 bg-warning-50 rounded-xl px-3 py-2">Toca el mapa para situar el vehículo.</p>}{error && <p className="text-sm text-error-600 bg-error-50 rounded-xl px-3 py-2">{error}</p>}<div className="flex gap-2"><button onClick={cancelAdd} className="btn-outline flex-1">Cancelar</button><button onClick={saveVehicle} disabled={saving} className="btn-primary flex-1">{saving ? <Spinner size={16} /> : <Truck size={16} />} Guardar vehículo</button></div></div> : <button onClick={() => startAdd('vehicle')} className="btn-primary w-full"><Plus size={16} /> Añadir vehículo operativo</button>)}

      {tab === 'rutas' && canManage && selectedRouteId && addMode === 'waypoint' && <div className="card p-4 space-y-3"><h2 className="text-sm font-semibold text-gray-900">Añadir punto de ruta</h2><div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><div><label className="label">Tipo de punto</label><select className="input" value={waypointType} onChange={(e) => setWaypointType(e.target.value as WaypointType)}>{(Object.keys(waypointTypeConfig) as WaypointType[]).map((item) => <option key={item} value={item}>{waypointTypeConfig[item].label}</option>)}</select></div><div><label className="label">Etiqueta opcional</label><input className="input" value={waypointLabel} onChange={(e) => setWaypointLabel(e.target.value)} placeholder="Ej. Retén PK 3" /></div></div>{selectedLocation ? <p className="text-xs text-success-700 bg-success-50 rounded-xl px-3 py-2 flex items-center gap-2"><MapPin size={14} /> {selectedLocation.lat.toFixed(5)}, {selectedLocation.lng.toFixed(5)}</p> : <p className="text-xs text-warning-700 bg-warning-50 rounded-xl px-3 py-2">Toca el mapa para añadir el punto.</p>}{error && <p className="text-sm text-error-600 bg-error-50 rounded-xl px-3 py-2">{error}</p>}<div className="flex gap-2"><button onClick={cancelAdd} className="btn-outline flex-1">Cancelar</button><button onClick={addWaypoint} disabled={saving} className="btn-primary flex-1">{saving ? <Spinner size={16} /> : <Plus size={16} />} Añadir punto {waypoints.length > 0 ? `(${waypoints.length})` : ''}</button></div></div>}

      {tab === 'rutas' && routes.length === 0 && !showRouteModal && <p className="text-sm text-gray-400 text-center py-4">No hay rutas especiales registradas.</p>}

      {showRouteModal && <Modal open onClose={() => setShowRouteModal(false)} title="Nueva ruta especial" size="md"><div className="space-y-4"><div><label className="label">Nombre del evento</label><input className="input" value={routeName} onChange={(e) => setRouteName(e.target.value)} placeholder="Ej. Procesión del Domingo de Ramos" /></div><div className="grid grid-cols-2 gap-3"><div><label className="label">Tipo</label><select className="input" value={routeType} onChange={(e) => setRouteType(e.target.value as RouteType)}>{(Object.keys(routeTypeConfig) as RouteType[]).map((item) => <option key={item} value={item}>{routeTypeConfig[item].label}</option>)}</select></div><div><label className="label">Fecha y hora</label><input type="datetime-local" className="input" value={routeDate} onChange={(e) => setRouteDate(e.target.value)} /></div></div><div><label className="label">Descripción opcional</label><input className="input" value={routeDescription} onChange={(e) => setRouteDescription(e.target.value)} placeholder="Detalles operativos del evento" /></div>{error && <p className="text-sm text-error-600 bg-error-50 rounded-xl px-3 py-2">{error}</p>}<div className="flex gap-3"><button onClick={() => setShowRouteModal(false)} className="btn-outline flex-1">Cancelar</button><button onClick={createRoute} disabled={saving} className="btn-primary flex-1">{saving ? <Spinner size={16} /> : <Plus size={16} />} Crear ruta</button></div></div></Modal>}

      <div className="flex items-center gap-2 text-xs text-gray-400 flex-wrap">
        <MapPinned size={14} />
        {loading ? 'Cargando…' : tab === 'general' ? `${visiblePois.length} puntos visibles` : tab === 'vehiculos' ? `${vehicles.length} vehículos operativos` : `${routes.length} rutas · ${waypoints.length} puntos de ruta`}
        {!canManage && <Badge variant="gray">Solo consulta</Badge>}
      </div>
    </div>
  );
}
