import { supabase } from '@/lib/supabase';

export async function fetchMedicalReportCount(incidentId: string): Promise<number> {
  const { count } = await supabase.from('partes_sanitarios').select('*', { count: 'exact', head: true }).eq('incident_id', incidentId);
  return count ?? 0;
}
