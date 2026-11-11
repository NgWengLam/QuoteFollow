import { renderTemplate, money } from "../shared/domain.js";
import { deliveryReady } from "./config.js";
const unwrap = ({ data, error }) => {
  if (error) throw error;
  return data;
};
export async function processDue(
  db,
  config,
  { request = fetch, maxJobs = 25 } = {},
) {
  if (!deliveryReady(config)) return { processed: 0, disabled: true };
  let processed = 0;
  for (let i = 0; i < maxJobs; i++) {
    const [r] = unwrap(await db.rpc("claim_reminder"));
    if (!r) break;
    const q = unwrap(
      await db.from("quotations").select("*").eq("id", r.quotation_id).single(),
    );
    const c = unwrap(
      await db.from("customers").select("*").eq("id", q.customer_id).single(),
    );
    const b = unwrap(
      await db.from("businesses").select("*").eq("id", q.business_id).single(),
    );
    const text = renderTemplate(r.template, {
      customer_name: c.name,
      quote_number: q.quote_number,
      project: q.project,
      business_name: b.name,
      amount: money(q.amount_cents),
    });
    const payload = {
      from: config.from,
      to: [c.email],
      reply_to: `quote+${q.reply_token}@${config.replyDomain}`,
      subject: `${b.name} · Quotation ${q.quote_number}`,
      text: `${text}\n\nReply to this email to ask a question or stop further follow-ups.\n${b.name}${b.phone ? " · " + b.phone : ""}`,
    };
    const frozen = unwrap(
      await db.rpc("prepare_reminder", {
        reminder_id: r.id,
        token: r.claim_token,
        email_payload: payload,
      }),
    );
    if (!frozen) continue;
    let outcome = "retry",
      provider = null;
    try {
      const response = await request("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.emailKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `nudge/reminder/${r.id}`,
        },
        body: JSON.stringify(frozen),
        signal: AbortSignal.timeout(20000),
      });
      if (response.ok) {
        const body = await response.json();
        if (typeof body.id === "string") {
          outcome = "sent";
          provider = body.id;
        }
      } else if (
        response.status >= 400 &&
        response.status < 500 &&
        ![408, 409, 429].includes(response.status)
      )
        outcome = "failed";
    } catch {
      /* Unknown delivery is retried with the SAME payload and key; never blindly recreated. */
    }
    unwrap(
      await db.rpc("finish_reminder", {
        reminder_id: r.id,
        token: r.claim_token,
        outcome,
        provider,
      }),
    );
    processed++;
  }
  return { processed, disabled: false };
}
