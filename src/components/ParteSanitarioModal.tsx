import { useCallback, useEffect, useState } from 'react';
import { Activity, ArrowLeft, Droplet, HeartPulse, History, MapPin, Save, Stethoscope, Thermometer, User, Sparkles } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { supabase, type AvpuLevel, type MedicalResolution, type OperationalVehicle, type PatientHistory, type Servicio } from '@/lib/supabase';
import { Spinner } from '@/components/ui/Spinner';

const avpuOptions: { value: AvpuLevel; label: string; description: string }[] = [
  { value: 'alerta', label: 'A', description: 'Alerta, responde espontáneamente' },
  { value: 'voz', label: 'V', description: 'Responde a estímulos verbales' },
  { value: 'dolor', label: 'P', description: 'Responde solo al dolor' },
  { value: 'inconsciente', label: 'U', description: 'Inconsciente, sin respuesta' },
];

const resolutionOptions: { value: MedicalResolution; label: string; color: string }[] = [
  { value: 'alta_lugar', label: 'Alta en el lugar', color: 'success' },
  { value: 'derivacion_centro', label: 'Derivación a centro sanitario', color: 'warning' },
  { value: 'ambulancia_uvi', label: 'Ambulancia UVI', color: 'error' },
];

const vehicleTypeLabels: Record<string, string> = { vir: 'VIR', coordinacion: 'Coordinación', ambulancia: 'Ambulancia', logistica: 'Logística', otro: 'Otro' };

type VitalField = 'fc' | 'tas' | 'tad' | 'spo2' | 'temperatura' | 'glucemia';

type AssistantStep = {
  id: string;
  question: string;
  guidance: string;
  options?: { label: string; value: string; action?: Partial<{ motivo: string; nivelConciencia: AvpuLevel; tratamiento: string; resolucion: MedicalResolution }> }[];
  vitalsInput?: { field: VitalField; label: string; min: number; max: number; step?: string; isFloat?: boolean }[];
};

const protocolSteps: AssistantStep[] = [
  {
    id: 'scene',
    question: 'Seguridad en la escena',
    guidance: 'Protocolo de seguridad en escena (PAS): Protege, Avisa, Socorre. Antes de acercarte, asegúrate de que no hay peligros para ti ni para el paciente (tráfico, fuego, estructuras, electricidad, agua). Si la escena no es segura, no te acerques, solicita refuerzos y mantén distancia de seguridad. Identifica el número de víctimas y mecanismo de lesión.',
    options: [
      { label: 'Sí, es segura', value: 'safe', action: { motivo: 'Escena segura. ' } },
      { label: 'No, hay peligro', value: 'unsafe', action: { motivo: 'Escena NO segura. Se solicitan refuerzos. ' } },
    ],
  },
  {
    id: 'consciousness',
    question: 'Nivel de consciencia del paciente',
    guidance: 'Evalúa según escala AVPU (ERC 2025). Acércate al paciente y estímulo verbal fuerte. Alerta: responde espontáneamente y orienta. Voz: solo responde al llamarle. Dolor: solo reacciona a estímulos dolorosos (presión supraorbitaria o pinza traqueal). Inconsciente: no responde a ningún estímulo. Si está inconsciente, activa inmediatamente el protocolo de SVB y llama al 112.',
    options: [
      { label: 'Alerta (A)', value: 'alerta', action: { nivelConciencia: 'alerta' } },
      { label: 'Responde a voz (V)', value: 'voz', action: { nivelConciencia: 'voz' } },
      { label: 'Responde al dolor (P)', value: 'dolor', action: { nivelConciencia: 'dolor', motivo: 'Paciente responde solo al dolor. ' } },
      { label: 'Inconsciente (U)', value: 'inconsciente', action: { nivelConciencia: 'inconsciente', motivo: 'Paciente inconsciente. ', tratamiento: 'Posición lateral de seguridad si respira. Activación de cadena de supervivencia. ' } },
    ],
  },
  {
    id: 'abc',
    question: 'Evaluación primaria: vía aérea, respiración y circulación',
    guidance: 'Protocolo ABC (ERC 2025): A (Airway) - Abrir vía aérea con maniobra frente-mentón. Si sospecha trauma cervical, use tracción mandibular. Comprueba que no hay obstrucción (cuerpos extraños, vómito, sangre). B (Breathing) - Comprobar respiración durante 10 segundos (VER movimiento torácico, OÍR sonidos, SENTIR aire en mejilla). Si no respira, iniciar RCP 30:2 inmediatamente. C (Circulation) - Palpar pulso carotídeo (no más de 10 segundos). Observar coloración, temperatura y tiempo de relleno capilar.',
    vitalsInput: [
      { field: 'fc', label: 'Frecuencia cardíaca (lpm)', min: 0, max: 250 },
      { field: 'spo2', label: 'Saturación de O2 (%)', min: 0, max: 100 },
    ],
    options: [
      { label: 'Vía aérea permeable, respira', value: 'abc_ok', action: { motivo: 'Vía aérea permeable, respiración presente. ' } },
      { label: 'Vía aérea obstruida', value: 'abc_blocked', action: { motivo: 'Vía aérea obstruida. ', tratamiento: 'Maniobra frente-mentón. Aspiración de secreciones si disponible. ' } },
      { label: 'No respira, sin pulso', value: 'abc_nobreath', action: { motivo: 'Paciente en parada cardiorrespiratoria. ', tratamiento: 'Inicio inmediato de RCP 30:2 (compresiones a 100-120/min, profundidad 5-6 cm). Activar cadena de supervivencia: llamar 112, solicitar DESA. ' } },
      { label: 'No respira, con pulso', value: 'abc_breath_nopulse', action: { motivo: 'Paciente sin respiración con pulso presente. ', tratamiento: 'Ventilaciones de rescate: 10-12 respiraciones/min en adulto. Posición lateral de seguridad. ' } },
    ],
  },
  {
    id: 'vitals',
    question: 'Constantes vitales completas y evaluación secundaria',
    guidance: 'Toma de constantes completas según protocolo de evaluación secundaria (ERC 2025). Registra tensión arterial (normal: 120/80 en adulto), temperatura (normal: 36-37.2°C) y glucemia capilar (normal: 70-110 mg/dl; hipoglucemia < 70; hiperglucemia > 250). Evalúa: si TAS < 90 sospechar shock; si SpO2 < 92% administrar oxígeno; si glucemia < 70 administrar azúcar oral o glucagón si está inconsciente.',
    vitalsInput: [
      { field: 'tas', label: 'Tensión arterial sistólica (mmHg)', min: 0, max: 300 },
      { field: 'tad', label: 'Tensión arterial diastólica (mmHg)', min: 0, max: 200 },
      { field: 'temperatura', label: 'Temperatura (°C)', min: 25, max: 45, step: '0.1', isFloat: true },
      { field: 'glucemia', label: 'Glucemia (mg/dl)', min: 0, max: 999 },
    ],
  },
  {
    id: 'sample',
    question: 'Anamnesis SAMPLE',
    guidance: 'Realiza la anamnesis estructurada SAMPLE (protocolo ERC 2025): S (Síntomas) - ¿Qué le ocurre? ¿Dónde duele? A (Alergias) - ¿Tiene alergias a medicamentos, alimentos, picaduras? M (Medicación) - ¿Toma algún medicamento? P (Pasado médico) - ¿Tiene enfermedades previas? L (Última comida) - ¿Cuándo fue la última comida/bebida? E (Eventos previos) - ¿Qué estaba haciendo cuando ocurrió? Pregunta al paciente si está consciente, o a familiares/testigos si no lo está.',
  },
  {
    id: 'symptoms',
    question: 'Motivo principal de la asistencia',
    guidance: 'Describe el motivo de asistencia y los síntomas principales observados. Incluye mecanismo de lesión (caída, golpe, colisión, etc.), localización del dolor o síntoma, intensidad (0-10) y tiempo de evolución.',
  },
  {
    id: 'treatment',
    question: 'Tratamiento y primeros auxilios aplicados',
    guidance: 'Según el cuadro clínico y protocolo ERC 2025: control de hemorragias con presión directa y torniquete si es necesario; inmovilización de fracturas; posición lateral de seguridad en inconscientes que respiran; oxigenoterapia si SpO2 < 92% (10-15 lpm con mascarilla reservorio); administración de glucosa oral si glucemia < 70 mg/dl y paciente consciente; AAS 300mg vía oral si sospecha de IAM. No administering nada via oral if unconscious.',
  },
  {
    id: 'stroke_check',
    question: '¿Sospechas de ictus? (Test FAST)',
    guidance: 'Test FAST (ERC 2025): F (Face) - Pide al paciente que sonría, ¿hay asimetría facial? A (Arm) - Pide que levante ambos brazos, ¿cae uno? S (Speech) - Pide que repita una frase, ¿hay dificultad? T (Time) - Si hay cualquier signo positivo, anota la hora de inicio y activa código ictus (112). Es urgente vital.',
    options: [
      { label: 'No, sin signos de ictus', value: 'fast_no', action: { motivo: 'Test FAST negativo. ' } },
      { label: 'Sí, sospecha de ictus', value: 'fast_yes', action: { motivo: 'Sospecha de ictus (FAST+). ', tratamiento: 'Activación código ictus. Derivación urgente. NO administrar nada por vía oral. Anotar hora de inicio de síntomas. ', resolucion: 'ambulancia_uvi' } },
    ],
  },
  {
    id: 'anaphylaxis_check',
    question: '¿Sospechas de anafilaxia?',
    guidance: 'Anafilaxia (ERC 2025): inicio rápido tras exposición a alérgeno conocido. Síntomas: urticaria generalizada, dificultad respiratoria, sibilancias, hipotensión, dolor abdominal, vómitos. Tratamiento: Adrenalina 0.5mg IM en cara externa del muslo (puede repetir cada 5 min). Posición decúbito supino con elevación de piernas si hipotensión. Llamar 112.',
    options: [
      { label: 'No', value: 'anaph_no', action: {} },
      { label: 'Sí, anafilaxia', value: 'anaph_yes', action: { motivo: 'Anafilaxia confirmada. ', tratamiento: 'Adrenalina 0.5mg IM en cara externa del muslo. Posición decúbito supino con elevación de piernas. Llamada 112. ', resolucion: 'ambulancia_uvi' } },
    ],
  },
  {
    id: 'resolution',
    question: 'Destino y resolución del paciente',
    guidance: 'Evalúa la resolución final del paciente: ALTA EN EL LUGAR si las constantes son normales, el paciente se recupera y no requiere valoración médica adicional. DERIVACIÓN A CENTRO SANITARIO si requiere valoración médica pero no es urgente vital. AMBULANCIA UVI si es urgente vital, activa el 112 y solicita ambulancia medicalizada.',
    options: [
      { label: 'Alta en el lugar', value: 'alta_lugar', action: { resolucion: 'alta_lugar' } },
      { label: 'Derivación a centro', value: 'derivacion_centro', action: { resolucion: 'derivacion_centro' } },
      { label: 'Ambulancia UVI', value: 'ambulancia_uvi', action: { resolucion: 'ambulancia_uvi' } },
    ],
  },
];

export function ParteSanitarioModal({
  incidentId,
  incidentDescription,
  onClose,
  onSaved,
}: {
  incidentId: string;
  incidentDescription: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const [pacienteNombre, setPacienteNombre] = useState('');
  const [pacienteEdad, setPacienteEdad] = useState('');
  const [pacienteTelefono, setPacienteTelefono] = useState('');
  const [pacienteDni, setPacienteDni] = useState('');
  const [direccion, setDireccion] = useState('');
  const [motivo, setMotivo] = useState('');
  const [fc, setFc] = useState('');
  const [tas, setTas] = useState('');
  const [tad, setTad] = useState('');
  const [spo2, setSpo2] = useState('');
  const [temperatura, setTemperatura] = useState('');
  const [glucemia, setGlucemia] = useState('');
  const [nivelConciencia, setNivelConciencia] = useState<AvpuLevel | ''>('');
  const [tratamiento, setTratamiento] = useState('');
  const [resolucion, setResolucion] = useState<MedicalResolution>('alta_lugar');
  const [servicioId, setServicioId] = useState<string>('');
  const [vehiculoId, setVehiculoId] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [showAssistant, setShowAssistant] = useState(false);
  const [assistantStep, setAssistantStep] = useState(0);
  const [services, setServices] = useState<Servicio[]>([]);
  const [vehicles, setVehicles] = useState<OperationalVehicle[]>([]);
  const [patientHistory, setPatientHistory] = useState<PatientHistory | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [pastReports, setPastReports] = useState<{ created_at: string; motivo_asistencia: string; resolucion: string }[]>([]);

  const vitalSetters: Record<VitalField, (v: string) => void> = {
    fc: setFc, tas: setTas, tad: setTad, spo2: setSpo2, temperatura: setTemperatura, glucemia: setGlucemia,
  };
  const vitalValues: Record<VitalField, string> = { fc, tas, tad, spo2, temperatura, glucemia };

  useEffect(() => {
    const fetchServices = async () => {
      const { data } = await supabase.from('servicios').select('*').order('fecha', { ascending: false }).limit(20);
      setServices((data ?? []) as Servicio[]);
    };
    fetchServices();
  }, []);

  const fetchVehiclesForService = useCallback(async (sId: string) => {
    if (!sId) { setVehicles([]); return; }
    const { data: assigns } = await supabase.from('servicio_vehiculos').select('vehiculo_id').eq('servicio_id', sId);
    const vehicleIds = (assigns ?? []).map((a: { vehiculo_id: string }) => a.vehiculo_id);
    if (vehicleIds.length === 0) { setVehicles([]); return; }
    const { data: vehs } = await supabase.from('vehiculos_operativos').select('*').in('id', vehicleIds).eq('is_active', true).order('nombre');
    setVehicles((vehs ?? []) as OperationalVehicle[]);
  }, []);

  useEffect(() => { fetchVehiclesForService(servicioId); }, [servicioId, fetchVehiclesForService]);

  const searchPatientHistory = useCallback(async (dni: string) => {
    if (dni.trim().length < 5) { setPatientHistory(null); setPastReports([]); return; }
    setHistoryLoading(true);
    const { data: history } = await supabase.from('historial_pacientes').select('*').eq('paciente_dni', dni.trim().toUpperCase()).maybeSingle();
    setPatientHistory(history as PatientHistory | null);
    if (history) {
      const { data: reports } = await supabase.from('partes_sanitarios').select('created_at, motivo_asistencia, resolucion').ilike('dni', dni.trim()).order('created_at', { ascending: false }).limit(10);
      setPastReports((reports ?? []) as { created_at: string; motivo_asistencia: string; resolucion: string }[]);
      if (history.paciente_nombre && !pacienteNombre) setPacienteNombre(history.paciente_nombre);
      if (history.paciente_edad && !pacienteEdad) setPacienteEdad(String(history.paciente_edad));
      if (history.paciente_telefono && !pacienteTelefono) setPacienteTelefono(history.paciente_telefono);
      if (history.direccion && !direccion) setDireccion(history.direccion);
    } else {
      setPastReports([]);
    }
    setHistoryLoading(false);
  }, [pacienteNombre, pacienteEdad, pacienteTelefono, direccion]);

  const handleAssistantAnswer = (step: AssistantStep, value?: string) => {
    if (step.options) {
      const opt = step.options.find((o) => o.value === value);
      if (opt?.action?.motivo) setMotivo((m) => m.includes(opt.action!.motivo!) ? m : m + opt.action!.motivo);
      if (opt?.action?.tratamiento) setTratamiento((t) => t.includes(opt.action!.tratamiento!) ? t : t + opt.action!.tratamiento);
      if (opt?.action?.nivelConciencia) setNivelConciencia(opt.action.nivelConciencia);
      if (opt?.action?.resolucion) setResolucion(opt.action.resolucion);
    }
    if (assistantStep < protocolSteps.length - 1) setAssistantStep((s) => s + 1);
  };

  const handleSave = async () => {
    if (!user) return;
    if (motivo.trim().length < 3) { setError('Describe el motivo de la asistencia.'); return; }
    setSaving(true); setError(null);

    const payload: Record<string, unknown> = {
      incident_id: incidentId,
      user_id: user.id,
      motivo_asistencia: motivo.trim(),
      resolucion,
      paciente_nombre: pacienteNombre.trim() || null,
      paciente_edad: pacienteEdad ? parseInt(pacienteEdad) : null,
      paciente_telefono: pacienteTelefono.trim() || null,
      paciente_dni: pacienteDni.trim() || null,
      direccion: direccion.trim() || null,
      fc: fc ? parseInt(fc) : null,
      tas: tas ? parseInt(tas) : null,
      tad: tad ? parseInt(tad) : null,
      spo2: spo2 ? parseInt(spo2) : null,
      temperatura: temperatura ? parseFloat(temperatura) : null,
      glucemia: glucemia ? parseInt(glucemia) : null,
      nivel_conciencia: nivelConciencia || null,
      tratamiento: tratamiento.trim() || null,
      servicio_id: servicioId || null,
      vehiculo_id: vehiculoId || null,
    };

    const { error: insertError } = await supabase.from('partes_sanitarios').insert(payload);
    if (insertError) {
      setError('No se pudo guardar el parte sanitario. Verifica que la incidencia existe.');
      setSaving(false);
      return;
    }

    if (pacienteDni.trim().length >= 5) {
      const dniUpper = pacienteDni.trim().toUpperCase();
      const summaryText = `${new Date().toLocaleDateString('es-ES')}: ${motivo.trim().substring(0, 100)} → ${resolucion}`;
      const { data: existing } = await supabase.from('historial_pacientes').select('*').eq('paciente_dni', dniUpper).maybeSingle();
      if (existing) {
        const newResumen = existing.resumen ? `${existing.resumen}\n${summaryText}` : summaryText;
        await supabase.from('historial_pacientes').update({
          paciente_nombre: pacienteNombre.trim() || existing.paciente_nombre,
          paciente_edad: pacienteEdad ? parseInt(pacienteEdad) : existing.paciente_edad,
          paciente_telefono: pacienteTelefono.trim() || existing.paciente_telefono,
          direccion: direccion.trim() || existing.direccion,
          resumen: newResumen,
          updated_at: new Date().toISOString(),
        }).eq('id', existing.id);
      } else {
        await supabase.from('historial_pacientes').insert({
          paciente_dni: dniUpper,
          paciente_nombre: pacienteNombre.trim() || null,
          paciente_edad: pacienteEdad ? parseInt(pacienteEdad) : null,
          paciente_telefono: pacienteTelefono.trim() || null,
          direccion: direccion.trim() || null,
          resumen: summaryText,
        });
      }
    }

    setSuccess(true);
    setSaving(false);
    setTimeout(() => onSaved(), 900);
  };

  if (success) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-black/50 p-4 animate-fade-in" style={{ zIndex: 1200 }}>
        <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 text-center">
          <div className="w-14 h-14 rounded-full bg-success-100 flex items-center justify-center mx-auto mb-3"><Stethoscope size={28} className="text-success-600" /></div>
          <p className="text-sm font-semibold text-gray-900">Parte guardado correctamente</p>
          <p className="text-xs text-gray-400 mt-1">El parte queda asociado a la incidencia y visible para el equipo.</p>
        </div>
      </div>
    );
  }

  const currentStep = protocolSteps[assistantStep];

  return (
    <div className="fixed inset-0 flex items-start justify-center bg-black/50 p-3 overflow-y-auto animate-fade-in" style={{ zIndex: 1200 }}>
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full my-4 flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl z-10">
          <div className="flex items-center gap-2"><div className="w-9 h-9 rounded-xl bg-yellow-100 text-yellow-700 flex items-center justify-center"><Stethoscope size={20} /></div><div><h2 className="text-sm font-bold text-gray-900">Parte de Asistencia Sanitaria</h2><p className="text-[11px] text-gray-400 line-clamp-1">{incidentDescription}</p></div></div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"><ArrowLeft size={18} /></button>
        </div>

        <div className="overflow-y-auto px-4 py-4 space-y-5">
          {error && <div className="text-sm text-error-600 bg-error-50 rounded-xl px-3 py-2">{error}</div>}

          {showAssistant ? (
            <div className="rounded-2xl border-2 border-primary-200 bg-primary-50/50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2"><Sparkles size={18} className="text-primary-600" /><h3 className="text-sm font-bold text-primary-900">Asistente de Protocolo ERC 2025</h3></div>
                <button onClick={() => setShowAssistant(false)} className="text-xs text-gray-500 hover:text-gray-700">Cerrar</button>
              </div>
              <div className="flex gap-1 flex-wrap">
                {protocolSteps.map((s, i) => <button key={s.id} onClick={() => setAssistantStep(i)} className={`px-2 py-0.5 rounded-lg text-[10px] font-medium transition-colors ${i === assistantStep ? 'bg-primary-600 text-white' : i < assistantStep ? 'bg-primary-100 text-primary-700' : 'bg-white text-gray-400 border border-gray-200'}`}>{i + 1}</button>)}
              </div>
              <div className="bg-white rounded-xl p-3 space-y-2">
                <p className="text-sm font-semibold text-gray-900">{assistantStep + 1}. {currentStep.question}</p>
                <p className="text-xs text-gray-600 leading-relaxed">{currentStep.guidance}</p>

                {currentStep.vitalsInput && currentStep.vitalsInput.length > 0 && (
                  <div className="rounded-lg bg-yellow-50 border border-yellow-200 px-3 py-3 mt-2 space-y-2">
                    <p className="text-xs font-semibold text-yellow-800 mb-1">Introduce las constantes vitales ahora:</p>
                    {currentStep.vitalsInput.map((v) => (
                      <div key={v.field}>
                        <label className="label text-yellow-800">{v.label}</label>
                        <input
                          type="number"
                          inputMode="decimal"
                          className="input"
                          value={vitalValues[v.field]}
                          min={v.min}
                          max={v.max}
                          step={v.step ?? '1'}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === '') { vitalSetters[v.field](''); return; }
                            const parsed = v.isFloat ? parseFloat(val) : parseInt(val);
                            if (isNaN(parsed) || parsed < v.min || parsed > v.max) return;
                            vitalSetters[v.field](val);
                          }}
                          placeholder="—"
                        />
                      </div>
                    ))}
                    <p className="text-[10px] text-yellow-600 mt-1">Los valores se rellenan automáticamente en el formulario.</p>
                  </div>
                )}

                {currentStep.options && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {currentStep.options.map((opt) => <button key={opt.value} onClick={() => handleAssistantAnswer(currentStep, opt.value)} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-primary-100 text-primary-700 hover:bg-primary-200 transition-colors">{opt.label}</button>)}
                  </div>
                )}
                {!currentStep.options && (
                  <button onClick={() => handleAssistantAnswer(currentStep)} className="btn-primary text-xs px-3 py-1.5 mt-2">Entendido, siguiente</button>
                )}
                {assistantStep === protocolSteps.length - 1 && <button onClick={() => setShowAssistant(false)} className="btn-outline text-xs px-3 py-1.5 mt-2 w-full">Finalizar asistente y revisar formulario</button>}
              </div>
            </div>
          ) : (
            <button onClick={() => { setShowAssistant(true); setAssistantStep(0); }} className="w-full rounded-xl bg-primary-50 border border-primary-200 px-4 py-2.5 flex items-center justify-center gap-2 text-sm font-medium text-primary-700 hover:bg-primary-100 transition-colors">
              <Sparkles size={17} /> Activar asistente de protocolo ERC 2025
            </button>
          )}

          {patientHistory && (
            <div className="rounded-xl bg-blue-50 border border-blue-200 p-3">
              <div className="flex items-center gap-2 mb-1"><History size={16} className="text-blue-600" /><p className="text-xs font-bold text-blue-900">Historial del paciente encontrado</p></div>
              {patientHistory.resumen && <p className="text-xs text-blue-700 whitespace-pre-wrap mt-1 max-h-24 overflow-y-auto">{patientHistory.resumen}</p>}
              {pastReports.length > 0 && <p className="text-[11px] text-blue-500 mt-1">{pastReports.length} asistencia(s) anterior(es) registrada(s)</p>}
            </div>
          )}
          {historyLoading && <div className="flex items-center gap-2 text-xs text-gray-400"><Spinner size={14} /> Buscando historial del paciente…</div>}

          <Section title="Datos del paciente" icon={User}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div><label className="label">Nombre</label><input className="input" value={pacienteNombre} onChange={(e) => setPacienteNombre(e.target.value)} placeholder="Nombre del paciente" /></div>
              <div><label className="label">Edad</label><input type="number" inputMode="numeric" min={0} max={130} className="input" value={pacienteEdad} onChange={(e) => setPacienteEdad(e.target.value)} placeholder="Años" /></div>
              <div><label className="label">Teléfono</label><input type="tel" inputMode="tel" className="input" value={pacienteTelefono} onChange={(e) => setPacienteTelefono(e.target.value)} placeholder="600 123 456" /></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              <div><label className="label">DNI / NIE</label><input className="input" value={pacienteDni} onChange={(e) => { setPacienteDni(e.target.value); }} onBlur={(e) => searchPatientHistory(e.target.value)} placeholder="00000000X" /></div>
              <div><label className="label">Dirección completa</label><input className="input" value={direccion} onChange={(e) => setDireccion(e.target.value)} placeholder="Calle, número, piso, ciudad" /></div>
            </div>
            {pacienteDni.trim().length >= 5 && !patientHistory && !historyLoading && <p className="text-[11px] text-gray-400 mt-1">Al salir del campo DNI se buscará automáticamente el historial del paciente.</p>}
          </Section>

          <Section title="Servicio y vehículo" icon={MapPin}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label">Servicio preventivo</label>
                <select className="input" value={servicioId} onChange={(e) => { setServicioId(e.target.value); setVehiculoId(''); }}>
                  <option value="">Sin servicio asociado</option>
                  {services.map((s) => <option key={s.id} value={s.id}>{s.titulo}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Vehículo que atiende</label>
                <select className="input" value={vehiculoId} onChange={(e) => setVehiculoId(e.target.value)} disabled={!servicioId}>
                  <option value="">{servicioId ? 'Sin vehículo asignado' : 'Selecciona un servicio primero'}</option>
                  {vehicles.map((v) => <option key={v.id} value={v.id}>{v.nombre} ({vehicleTypeLabels[v.tipo] ?? v.tipo})</option>)}
                </select>
                {servicioId && vehicles.length === 0 && <p className="text-[11px] text-gray-400 mt-1">No hay vehículos asignados a este servicio. Asigna vehículos desde el detalle del servicio.</p>}
              </div>
            </div>
          </Section>

          <Section title="Motivo de la asistencia" icon={Activity}>
            <textarea className="input min-h-[72px] resize-none" maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Anamnesis breve: qué ocurre, síntomas, mecanismo de lesión…" />
            <p className="text-[11px] text-gray-400 text-right mt-1">{motivo.length}/500</p>
          </Section>

          <Section title="Constantes vitales" icon={HeartPulse}>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <VitalFieldInput label="FC (lpm)" value={fc} onChange={setFc} min={0} max={250} icon={<HeartPulse size={14} />} />
              <VitalFieldInput label="TAS (mmHg)" value={tas} onChange={setTas} min={0} max={300} />
              <VitalFieldInput label="TAD (mmHg)" value={tad} onChange={setTad} min={0} max={200} />
              <VitalFieldInput label="SpO2 (%)" value={spo2} onChange={setSpo2} min={0} max={100} />
              <VitalFieldInput label="Temp. (°C)" value={temperatura} onChange={setTemperatura} min={25} max={45} step="0.1" isFloat icon={<Thermometer size={14} />} />
              <VitalFieldInput label="Glucemia (mg/dl)" value={glucemia} onChange={setGlucemia} min={0} max={999} icon={<Droplet size={14} />} />
            </div>
            <div className="mt-3"><label className="label">Nivel de conciencia (AVPU)</label><div className="grid grid-cols-4 gap-2">{avpuOptions.map((opt) => <button key={opt.value} type="button" onClick={() => setNivelConciencia(opt.value)} className={`rounded-xl border-2 py-2.5 text-center transition-all ${nivelConciencia === opt.value ? 'border-yellow-400 bg-yellow-50 text-yellow-900' : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'}`}><span className="text-lg font-bold block">{opt.label}</span><span className="text-[10px] leading-tight block mt-0.5">{opt.description}</span></button>)}</div></div>
          </Section>

          <Section title="Tratamiento aplicado" icon={Stethoscope}>
            <textarea className="input min-h-[72px] resize-none" maxLength={500} value={tratamiento} onChange={(e) => setTratamiento(e.target.value)} placeholder="Primeros auxilios, medicación, maniobras realizadas…" />
          </Section>

          <Section title="Destino / Resolución" icon={Activity}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">{resolutionOptions.map((opt) => <button key={opt.value} type="button" onClick={() => setResolucion(opt.value)} className={`rounded-xl border-2 px-3 py-3 text-center transition-all ${resolucion === opt.value ? opt.color === 'success' ? 'border-success-500 bg-success-50 text-success-800' : opt.color === 'warning' ? 'border-warning-400 bg-warning-50 text-warning-900' : 'border-error-500 bg-error-50 text-error-800' : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'}`}><span className="text-sm font-semibold">{opt.label}</span></button>)}</div>
          </Section>
        </div>

        <div className="px-4 py-3 border-t border-gray-100 flex gap-3 sticky bottom-0 bg-white rounded-b-2xl">
          <button onClick={onClose} className="btn-outline flex-1">Cancelar</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">{saving ? <Spinner size={16} /> : <Save size={17} />} {saving ? 'Guardando…' : 'Guardar parte'}</button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: typeof User; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-gray-500 mb-2"><Icon size={15} /> {title}</h3>
      {children}
    </div>
  );
}

function VitalFieldInput({ label, value, onChange, min, max, step, isFloat, icon }: { label: string; value: string; onChange: (v: string) => void; min: number; max: number; step?: string; isFloat?: boolean; icon?: React.ReactNode }) {
  return (
    <div>
      <label className="label flex items-center gap-1">{icon} {label}</label>
      <input
        type="number"
        inputMode="decimal"
        className="input"
        value={value}
        min={min}
        max={max}
        step={step ?? '1'}
        onChange={(e) => {
          const v = e.target.value;
          if (v === '') { onChange(''); return; }
          const parsed = isFloat ? parseFloat(v) : parseInt(v);
          if (isNaN(parsed) || parsed < min || parsed > max) return;
          onChange(v);
        }}
        placeholder="—"
      />
    </div>
  );
}

export function MedicalReportBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return <span className="badge bg-warning-100 text-warning-800"><Stethoscope size={11} /> {count} parte{count > 1 ? 's' : ''}</span>;
}
