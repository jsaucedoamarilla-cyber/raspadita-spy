import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

const reply = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: cors });

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "method_not_allowed" }, 405);

  let payload: { action?: string; token?: string };
  try {
    payload = await req.json();
  } catch {
    return reply({ error: "invalid_json" }, 400);
  }

  const token = typeof payload.token === "string" ? payload.token.trim() : "";
  if (payload.action !== "scratch" || token.length < 24 || token.length > 160 || !/^[A-Za-z0-9_-]+$/.test(token)) {
    return reply({ error: "invalid_request" }, 400);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return reply({ error: "server_not_configured" }, 503);

  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const tokenHash = await sha256(token);

  // Atomic one-time reveal: the update succeeds only if the ticket has not been scratched.
  const { data, error } = await db
    .from("raspadita_tickets")
    .update({ scratched: true, scratched_at: new Date().toISOString() })
    .eq("token_hash", tokenHash)
    .eq("scratched", false)
    .select("ticket_number, prize_label, prize_kind, prize_amount, scratched")
    .maybeSingle();

  if (error) {
    console.error("ticket scratch failed", error.message);
    return reply({ error: "temporarily_unavailable" }, 503);
  }
  if (!data) {
    const { data: existing, error: lookupError } = await db
      .from("raspadita_tickets")
      .select("scratched")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (lookupError) return reply({ error: "temporarily_unavailable" }, 503);
    if (!existing) return reply({ error: "ticket_not_found" }, 404);
    return reply({ error: "ticket_already_scratched" }, 409);
  }

  return reply({
    ok: true,
    ticket_number: data.ticket_number,
    prize_label: data.prize_label,
    prize_kind: data.prize_kind,
    prize_amount: data.prize_amount,
  });
});