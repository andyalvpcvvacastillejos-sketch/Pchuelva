import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

interface RequestBody {
  action: "update" | "password" | "delete";
  userId: string;
  password?: string;
  role?: string;
  isActive?: boolean;
  isApproved?: boolean;
  nombre?: string;
  apellidos?: string;
  indicativo?: string | null;
  especialidad?: string | null;
  telefono?: string | null;
}

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

    const authHeader = req.headers.get("Authorization");
    const accessToken = authHeader?.replace(/^Bearer\s+/i, "");
    if (!accessToken) return json({ error: "No autorizado" }, 401);

    const { data: caller, error: callerError } = await adminClient.auth.getUser(accessToken);
    if (callerError || !caller.user) return json({ error: "No autorizado" }, 401);

    const { data: callerProfile } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", caller.user.id)
      .maybeSingle();
    if (!callerProfile || !["admin_tecnico", "coordinador"].includes(callerProfile.role)) {
      return json({ error: "No autorizado" }, 403);
    }

    const body = await req.json() as RequestBody;
    if (!body.userId || !["update", "password", "delete"].includes(body.action)) {
      return json({ error: "Solicitud no válida" }, 400);
    }
    if (body.userId === caller.user.id) return json({ error: "No puedes gestionar tu propia cuenta" }, 400);

    const { data: targetProfile } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", body.userId)
      .maybeSingle();
    if (!targetProfile) return json({ error: "Usuario no encontrado" }, 404);
    if (callerProfile.role === "coordinador" && targetProfile.role === "admin_tecnico") {
      return json({ error: "No tienes permiso para gestionar este usuario" }, 403);
    }

    if (body.action === "password") {
      if (!body.password || body.password.length < 6) return json({ error: "La contraseña debe tener al menos 6 caracteres" }, 400);
      const { error } = await adminClient.auth.admin.updateUserById(body.userId, { password: body.password });
      if (error) return json({ error: "No se pudo cambiar la contraseña" }, 400);
      return json({ ok: true });
    }

    if (body.action === "delete") {
      const { error } = await adminClient.auth.admin.deleteUser(body.userId);
      if (error) return json({ error: "No se pudo eliminar el usuario" }, 400);
      return json({ ok: true });
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: updateError } = await callerClient.rpc("admin_manage_user", {
      p_user_id: body.userId,
      p_action: "update",
      p_role: body.role ?? null,
      p_is_active: body.isActive ?? null,
      p_is_approved: body.isApproved ?? null,
      p_nombre: body.nombre ?? null,
      p_apellidos: body.apellidos ?? null,
      p_indicativo: body.indicativo ?? null,
      p_especialidad: body.especialidad ?? null,
      p_telefono: body.telefono ?? null,
    });
    if (updateError) return json({ error: "No se pudo guardar el usuario" }, 400);

    return json({ ok: true });
  } catch (error) {
    console.error("admin-user error", error);
    return json({ error: "No se pudo completar la operación" }, 500);
  }
});
