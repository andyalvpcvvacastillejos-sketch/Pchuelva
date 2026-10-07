import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

interface PushQueueItem {
  id: string;
  titulo: string;
  mensaje: string | null;
  tipo: string;
  data: Record<string, unknown>;
  target_user_ids: string[] | null;
}

interface PushTokenRow {
  token: string;
  device_info: string | null;
}

function b64urlDecode(str: string): Uint8Array {
  const padding = "=".repeat((4 - (str.length % 4)) % 4);
  const base64 = (str + padding).replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function b64urlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

let cachedVapidKey: CryptoKey | null = null;
let cachedVapidPubKey: string | null = null;

async function importVapidKey(): Promise<CryptoKey> {
  if (cachedVapidKey) return cachedVapidKey;
  const raw = b64urlDecode(VAPID_PRIVATE_KEY);
  cachedVapidKey = await crypto.subtle.importKey(
    "pkcs8",
    raw.buffer,
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign"]
  );
  return cachedVapidKey;
}

async function getVapidPublicKeyB64(): Promise<string> {
  if (cachedVapidPubKey) return cachedVapidPubKey;
  const key = await importVapidKey();
  const jwk = await crypto.subtle.exportKey("jwk", key);
  const x = b64urlDecode(jwk.x as string);
  const y = b64urlDecode(jwk.y as string);
  const pubBytes = new Uint8Array(1 + x.length + y.length);
  pubBytes[0] = 0x04;
  pubBytes.set(x, 1);
  pubBytes.set(y, 1 + x.length);
  cachedVapidPubKey = b64urlEncode(pubBytes);
  return cachedVapidPubKey;
}

async function createVapidJwt(endpoint: string, expHours = 12): Promise<string> {
  const url = new URL(endpoint);
  const origin = url.protocol + "//" + url.host;
  const now = Math.floor(Date.now() / 1000);

  const header = { typ: "JWT", alg: "ES256" };
  const payload = {
    aud: origin,
    exp: now + expHours * 3600,
    sub: VAPID_SUBJECT,
    iat: now,
  };

  const headerB64 = b64urlEncode(new TextEncoder().encode(JSON.stringify(header)));
  const payloadB64 = b64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = await importVapidKey();
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(signingInput)
  );

  const sigB64 = b64urlEncode(new Uint8Array(signature));
  return `${signingInput}.${sigB64}`;
}

async function sendWebPush(
  endpoint: string,
  p256dh: string,
  auth: string,
  payload: Record<string, unknown>
): Promise<boolean> {
  try {
    const jwt = await createVapidJwt(endpoint);
    const pubKeyB64 = await getVapidPublicKeyB64();
    const encrypted = await encryptPayload(payload, p256dh, auth);

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Authorization": `vapid t=${jwt}, k=${pubKeyB64}`,
        "Content-Type": "application/octet-stream",
        "Content-Encoding": "aes128gcm",
        "TTL": "86400",
      },
      body: encrypted,
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`Web Push error for ${endpoint}:`, response.status, errText);
      if (response.status === 404 || response.status === 410) {
        await supabase.from("push_tokens").update({ is_active: false }).eq("token", endpoint);
      }
      return false;
    }
    return true;
  } catch (err) {
    console.error("sendWebPush error:", err);
    return false;
  }
}

async function encryptPayload(
  payload: Record<string, unknown>,
  p256dh: string,
  auth: string
): Promise<ArrayBuffer> {
  const { publicKey: aspPublic, privateKey: aspPrivate } = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey", "deriveBits"]
  );

  const userPubRaw = b64urlDecode(p256dh);
  const userPublicKey = await crypto.subtle.importKey(
    "raw",
    userPubRaw.buffer,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );

  const sharedSecret = await crypto.subtle.deriveBits(
    { name: "ECDH", public: userPublicKey },
    aspPrivate,
    256
  );

  const aspPubRaw = new Uint8Array(await crypto.subtle.exportKey("raw", aspPublic));
  const authSecret = b64urlDecode(auth);

  // RFC 8291 / Web Push: info = "WebPush: info\0" || user_pub || asp_pub
  const encoder = new TextEncoder();
  const infoStr = encoder.encode("WebPush: info\0");
  const info = new Uint8Array(infoStr.length + userPubRaw.length + aspPubRaw.length);
  info.set(infoStr, 0);
  info.set(userPubRaw, infoStr.length);
  info.set(aspPubRaw, infoStr.length + userPubRaw.length);

  // PRK = HKDF-Extract(salt=auth_secret, IKM=shared_secret)
  const prk = await hkdfExtract(authSecret, new Uint8Array(sharedSecret));

  // CEK = HKDF-Expand(PRK, info, 16)
  const cek = await hkdfExpand(prk, info, 16);

  // Nonce = HKDF-Expand(PRK, "WebPush: nonce\0", 12)
  const nonceInfo = encoder.encode("WebPush: nonce\0");
  const nonce = await hkdfExpand(prk, nonceInfo, 12);

  const plaintext = encoder.encode(JSON.stringify(payload));

  // RFC 8188 aes128gcm: salt(16) || rs(4) || idlen(1) || keyid(idlen) || ciphertext
  const recordSize = 4096;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyId = aspPubRaw;

  const headerBytes = new Uint8Array(16 + 4 + 1 + keyId.length);
  headerBytes.set(salt, 0);
  const dv = new DataView(headerBytes.buffer);
  dv.setUint32(16, recordSize);
  headerBytes[20] = keyId.length;
  headerBytes.set(keyId, 21);

  const aesKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce, additionalData: headerBytes },
      aesKey,
      plaintext
    )
  );

  const result = new Uint8Array(headerBytes.length + ciphertext.length);
  result.set(headerBytes, 0);
  result.set(ciphertext, headerBytes.length);
  return result.buffer;
}

async function hkdfExtract(salt: Uint8Array, ikm: Uint8Array): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey("raw", salt, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return await crypto.subtle.sign("HMAC", key, ikm);
}

async function hkdfExpand(prk: ArrayBuffer, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", prk, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const blocks: Uint8Array[] = [];
  let prev = new Uint8Array(0);
  let totalLength = 0;

  while (totalLength < length) {
    const input = new Uint8Array(prev.length + info.length + 1);
    input.set(prev, 0);
    input.set(info, prev.length);
    input[prev.length + info.length] = blocks.length + 1;

    const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, input));
    blocks.push(sig);
    prev = sig;
    totalLength += sig.length;
  }

  const result = new Uint8Array(length);
  let offset = 0;
  for (const block of blocks) {
    const toCopy = Math.min(length - offset, block.length);
    result.set(block.slice(0, toCopy), offset);
    offset += toCopy;
  }
  return result;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authorization = req.headers.get("Authorization");
    const accessToken = authorization?.replace(/^Bearer\s+/i, "");
    if (!accessToken) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);
    if (authError || !authData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: callerProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", authData.user.id)
      .maybeSingle();
    if (!callerProfile || !["admin_tecnico", "coordinador"].includes(callerProfile.role)) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: queueItems, error: queueError } = await supabase
      .from("push_queue")
      .select("*")
      .eq("processed", false)
      .order("created_at", { ascending: true })
      .limit(50);

    if (queueError) throw new Error(`Queue fetch error: ${queueError.message}`);
    if (!queueItems || queueItems.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let totalSent = 0;

    for (const item of queueItems as PushQueueItem[]) {
      let tokenQuery = supabase.from("push_tokens").select("token, device_info").eq("is_active", true);

      if (item.target_user_ids && item.target_user_ids.length > 0) {
        tokenQuery = tokenQuery.in("user_id", item.target_user_ids);
      } else {
        tokenQuery = tokenQuery.in(
          "user_id",
          (await supabase
            .from("profiles")
            .select("id")
            .eq("is_active", true)
            .eq("is_approved", true)
          ).data?.map((p: { id: string }) => p.id) ?? []
        );
      }

      const { data: tokens } = await tokenQuery as { data: PushTokenRow[] | null };

      if (tokens && tokens.length > 0) {
        for (const tok of tokens) {
          let keys: { p256dh: string; auth: string } | null = null;
          try {
            keys = tok.device_info ? JSON.parse(tok.device_info) : null;
          } catch { /* old format, skip */ }

          if (keys && keys.p256dh && keys.auth) {
            const payload = {
              titulo: item.titulo,
              mensaje: item.mensaje ?? "",
              tipo: item.tipo,
              data: item.data,
            };
            const ok = await sendWebPush(tok.token, keys.p256dh, keys.auth, payload);
            if (ok) totalSent++;
          }
        }
      }

      await supabase
        .from("push_queue")
        .update({ processed: true, processed_at: new Date().toISOString() })
        .eq("id", item.id);
    }

    return new Response(JSON.stringify({ processed: queueItems.length, sent: totalSent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-push failed", err);
    return new Response(JSON.stringify({ error: "Push processing failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
