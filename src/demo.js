import { DEFAULT_RULES, dayKey, dueAt, totalItems } from "../shared/domain.js";
const before = (days) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return dayKey(d);
};
export function seedDemo() {
  const business = {
    id: "demo-business",
    name: "Ruang Renovation",
    contact_email: "hello@example.com",
    phone: "+60 12-345 6789",
    send_start: 9,
    send_end: 18,
    weekdays_only: true,
    automation_enabled: true,
  };
  const names = [
    ["Amelia Tan", "Setia Alam", "amelia@example.com"],
    ["Daniel Lim", "Subang Jaya", "daniel@example.com"],
    ["Nur Aisyah", "Shah Alam", "aisyah@example.com"],
    ["Marcus Wong", "Petaling Jaya", "marcus@example.com"],
    ["Farah Abdullah", "Kota Damansara", "farah@example.com"],
    ["Kevin Lee", "Puchong", "kevin@example.com"],
    ["Siti Hajar", "Cyberjaya", "siti@example.com"],
    ["Jason Yap", "Cheras", "jason@example.com"],
  ];
  const customers = names.map(([name, company, email], i) => ({
    id: "c" + i,
    business_id: business.id,
    name,
    company,
    email,
    phone: "+60 12-000 000" + i,
    consent: true,
    unsubscribed: false,
    created_at: new Date().toISOString(),
  }));
  const projects = [
    "Kitchen cabinet & countertop",
    "Condo bathroom renovation",
    "Living room makeover",
    "Office partition & painting",
    "Full apartment renovation",
    "Built-in wardrobe installation",
    "Dry kitchen extension",
    "Study room cabinetry",
  ];
  const amounts = [
    1850000, 1280000, 2450000, 860000, 6850000, 920000, 3200000, 740000,
  ];
  const statuses = [
    "pending",
    "pending",
    "pending",
    "accepted",
    "pending",
    "accepted",
    "no_reply",
    "rejected",
  ];
  const ages = [3, 7, 1, 12, 14, 20, 25, 8];
  const quotations = projects.map((project, i) => ({
    id: "q" + i,
    business_id: business.id,
    customer_id: "c" + i,
    quote_number: `QT-2026-${String(41 - i).padStart(3, "0")}`,
    project,
    items: [
      { description: project, quantity: 1, unit_price_cents: amounts[i] },
    ],
    amount_cents: amounts[i],
    sent_date: before(ages[i]),
    status: statuses[i],
    followups_enabled: statuses[i] === "pending",
    replied_at: statuses[i] === "accepted" ? new Date().toISOString() : null,
    notes: "Demo quotation — fictional project and customer details.",
    created_at: new Date().toISOString(),
  }));
  const rules = DEFAULT_RULES.map((r, i) => ({
    ...r,
    id: "rule" + i,
    business_id: business.id,
  }));
  const reminders = quotations
    .filter((q) => q.status === "pending")
    .flatMap((q) =>
      rules.map((r, i) => ({
        id: q.id + "r" + i,
        quotation_id: q.id,
        business_id: business.id,
        days_after: r.days_after,
        template: r.template,
        send_at: dueAt(q.sent_date, r.days_after),
        status:
          dayKey(dueAt(q.sent_date, r.days_after)) < dayKey()
            ? "sent"
            : "pending",
        attempt_count: 0,
      })),
    );
  const logs = reminders
    .filter((r) => r.status === "sent")
    .map((r) => ({
      id: "l" + r.id,
      quotation_id: r.quotation_id,
      reminder_id: r.id,
      channel: "email",
      direction: "outbound",
      content:
        "Example follow-up: checking whether you had a chance to review the quotation. Happy to answer any questions.",
      subject: "Quotation follow-up",
      sent_at: r.send_at,
    }));
  return { business, customers, quotations, rules, reminders, logs };
}
const KEY = "nudge-demo-v1";
export function loadDemo() {
  try {
    const s = JSON.parse(sessionStorage.getItem(KEY));
    if (s?.business && Array.isArray(s.quotations)) return s;
  } catch {}
  return seedDemo();
}
export function persistDemo(state) {
  sessionStorage.setItem(KEY, JSON.stringify(state));
}
export function demoSaveQuote(state, input) {
  const old = state.quotations.find((q) => q.id === input.id);
  if (
    old &&
    (old.status !== "pending" ||
      old.replied_at ||
      state.reminders.some(
        (r) => r.quotation_id === old.id && r.status === "sent",
      ))
  )
    throw new Error(
      "Follow-ups already started or quote closed. Create a revised quotation instead.",
    );
  if (
    state.quotations.some(
      (q) => q.quote_number === input.quote_number && q.id !== input.id,
    )
  )
    throw new Error("That quotation number is already used.");
  const q = {
    ...input,
    id: input.id || crypto.randomUUID(),
    business_id: state.business.id,
    amount_cents: totalItems(input.items),
    status: old?.status || "pending",
    created_at: old?.created_at || new Date().toISOString(),
  };
  return {
    ...state,
    quotations: old
      ? state.quotations.map((x) => (x.id === q.id ? q : x))
      : [q, ...state.quotations],
    reminders: [
      ...state.reminders.filter((r) => r.quotation_id !== q.id),
      ...(q.followups_enabled
        ? state.rules.map((r) => ({
            id: crypto.randomUUID(),
            quotation_id: q.id,
            business_id: state.business.id,
            ...r,
            id: crypto.randomUUID(),
            send_at: dueAt(q.sent_date, r.days_after),
            status: "pending",
          }))
        : []),
    ],
  };
}
