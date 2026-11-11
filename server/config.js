import { createClient } from "@supabase/supabase-js";
export function loadConfig(env = process.env) {
  const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
  for (const k of required)
    if (!env[k]) throw new Error(`Set ${k} in your server environment.`);
  return {
    supabaseUrl: env.SUPABASE_URL,
    serviceKey: env.SUPABASE_SERVICE_ROLE_KEY,
    origin: env.APP_ORIGIN || "http://localhost:4173",
    port: Number(env.PORT || 3001),
    sendEnabled: env.EMAIL_SEND_ENABLED === "true",
    emailKey: env.RESEND_API_KEY,
    from: env.EMAIL_FROM,
    replyDomain: env.REPLY_DOMAIN,
    webhookSecret: env.RESEND_WEBHOOK_SECRET,
  };
}
export function adminClient(c) {
  return createClient(c.supabaseUrl, c.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export function deliveryReady(c) {
  return Boolean(
    c.sendEnabled &&
      c.emailKey &&
      c.from &&
      c.replyDomain &&
      c.webhookSecret &&
      !c.replyDomain.endsWith(".example"),
  );
}
