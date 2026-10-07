import { supabase } from '@/lib/supabase';

export async function processPendingPushNotifications(): Promise<void> {
  const { error } = await supabase.functions.invoke('send-push', { body: {} });
  if (error) console.error('No se pudieron enviar las notificaciones push:', error);
}
