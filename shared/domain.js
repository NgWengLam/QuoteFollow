export const TIME_ZONE = "Asia/Kuala_Lumpur";
export const STATUSES = ["pending", "accepted", "rejected", "no_reply"];
export const DEFAULT_RULES = [
  {
    days_after: 3,
    template:
      "Hi {{customer_name}}, just checking whether you had a chance to review quotation {{quote_number}} for {{project}}. Happy to answer any questions. — {{business_name}}",
  },
  {
    days_after: 7,
    template:
      "Hi {{customer_name}}, following up on {{quote_number}}. Is there anything we can clarify about the scope or pricing? — {{business_name}}",
  },
  {
    days_after: 14,
    template:
      "Hi {{customer_name}}, one last check-in on {{quote_number}}. If your plans have changed, just reply and we will stop the reminders. Thank you! — {{business_name}}",
  },
];
export const money = (cents) =>
  new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
    maximumFractionDigits: 2,
  }).format(Number(cents || 0) / 100);
export const dayKey = (date = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(date));
export const dateLabel = (value) =>
  value
    ? new Intl.DateTimeFormat("en-MY", {
        timeZone: TIME_ZONE,
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(
        new Date(value.length === 10 ? value + "T12:00:00+08:00" : value),
      )
    : "—";
export function totalItems(items) {
  if (!Array.isArray(items) || !items.length || items.length > 50)
    throw new Error("Add between 1 and 50 quotation items.");
  let total = 0;
  for (const item of items) {
    if (
      typeof item.description !== "string" ||
      !item.description.trim() ||
      item.description.length > 300
    )
      throw new Error("Each item needs a description (up to 300 characters).");
    const q = Number(item.quantity),
      p = Number(item.unit_price_cents);
    if (
      !Number.isFinite(q) ||
      q <= 0 ||
      q > 100000 ||
      Math.abs(q * 100 - Math.round(q * 100)) > 0.0001 ||
      !Number.isSafeInteger(p) ||
      p < 0 ||
      p > 100000000
    )
      throw new Error(
        "Enter a valid quantity (up to two decimal places) and non-negative price.",
      );
    total += Math.round(q * p);
  }
  if (total > 1000000000)
    throw new Error("Quotation total must not exceed RM10 million.");
  return total;
}
export function renderTemplate(template, values) {
  return template.replace(/\{\{([a-z_]+)\}\}/g, (m, key) =>
    Object.hasOwn(values, key) ? String(values[key]) : m,
  );
}
export function validateRules(rules) {
  if (!Array.isArray(rules) || rules.length > 5)
    throw new Error("Use up to five follow-ups.");
  const seen = new Set();
  for (const r of rules) {
    if (
      !Number.isInteger(+r.days_after) ||
      +r.days_after < 1 ||
      +r.days_after > 90 ||
      seen.has(+r.days_after)
    )
      throw new Error("Use unique follow-up days between 1 and 90.");
    seen.add(+r.days_after);
    if (!r.template?.trim() || r.template.length > 2000)
      throw new Error("Templates must contain 1–2,000 characters.");
    if (
      /\{\{(?!customer_name\}\}|quote_number\}\}|project\}\}|business_name\}\}|amount\}\})/.test(
        r.template,
      )
    )
      throw new Error("Use only the listed template variables.");
  }
  return rules;
}
export function dueAt(sentDate, days) {
  const d = new Date(sentDate + "T09:00:00+08:00");
  d.setUTCDate(d.getUTCDate() + Number(days));
  return d.toISOString();
}
export function isSendWindow(date, business) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TIME_ZONE,
      hour: "numeric",
      hourCycle: "h23",
      weekday: "short",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  return (
    Number(parts.hour) >= business.send_start &&
    Number(parts.hour) < business.send_end &&
    (!business.weekdays_only || !["Sat", "Sun"].includes(parts.weekday))
  );
}
export function canRetry(firstAttempt, now = new Date()) {
  return now - new Date(firstAttempt) < 23 * 3600000;
}
// WhatsApp click-to-chat. Malaysian local numbers (012-345 6789) become 60123456789.
export function whatsappNumber(phone) {
  let digits = String(phone || "").replace(/\D/g, "");
  if (digits.startsWith("0")) digits = "60" + digits.slice(1);
  return digits.length >= 9 && digits.length <= 15 ? digits : null;
}
export function whatsappLink(phone, text) {
  const number = whatsappNumber(phone);
  return number
    ? `https://wa.me/${number}?text=${encodeURIComponent(text)}`
    : null;
}
