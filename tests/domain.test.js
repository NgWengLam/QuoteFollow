import test from "node:test";
import assert from "node:assert/strict";
import {
  totalItems,
  dayKey,
  dueAt,
  isSendWindow,
  canRetry,
  renderTemplate,
  validateRules,
  whatsappNumber,
  whatsappLink,
} from "../shared/domain.js";
import { demoSaveQuote, seedDemo } from "../src/demo.js";
import {
  TEMPLATE_LANGUAGES,
  applyTemplateLanguage,
} from "../shared/followUpTemplates.js";
test("Every language renders placeholders and snapshots Unicode into new reminders", () => {
  for (const { code } of TEMPLATE_LANGUAGES) {
    const s = seedDemo();
    const oldReminders = structuredClone(s.reminders);
    s.rules = applyTemplateLanguage(
      [
        { days_after: 4 },
        { days_after: 9 },
        { days_after: 20 },
        { days_after: 30 },
      ],
      code,
    );
    validateRules(s.rules);
    assert.deepEqual(
      s.rules.map((r) => r.days_after),
      [4, 9, 20, 30],
    );
    for (const rule of s.rules) {
      const rendered = renderTemplate(rule.template, {
        customer_name: "李明",
        quote_number: "Q-001",
        project: "厨房",
        business_name: "测试装修",
      });
      assert.ok(rendered.includes("李明"));
      assert.ok(!rendered.includes("{{"));
    }
    const next = demoSaveQuote(s, {
      customer_id: s.customers[0].id,
      quote_number: `LANG-${code}`,
      project: "厨房",
      sent_date: dayKey(),
      items: [{ description: "Work", quantity: 1, unit_price_cents: 100 }],
      followups_enabled: true,
    });
    const newQuote = next.quotations.find(
      (q) => q.quote_number === `LANG-${code}`,
    );
    assert.deepEqual(
      next.reminders
        .filter((r) => r.quotation_id === newQuote.id)
        .map((r) => r.template),
      s.rules.map((r) => r.template),
    );
    assert.deepEqual(
      next.reminders.filter((r) => r.quotation_id !== newQuote.id),
      oldReminders,
    );
  }
  assert.deepEqual(
    applyTemplateLanguage([], "ms").map((r) => r.days_after),
    [3, 7, 14],
  );
});
test("Money stays in integer cents, including fractional quantities", () => {
  assert.equal(
    totalItems([
      { description: "Paint", quantity: 2.5, unit_price_cents: 1255 },
    ]),
    3138,
  );
  for (const items of [
    [],
    [{ description: "", quantity: 1, unit_price_cents: 100 }],
    [{ description: "Test", quantity: -1, unit_price_cents: 100 }],
    [{ description: "Test", quantity: 1.111, unit_price_cents: 100 }],
    [{ description: "Test", quantity: 1, unit_price_cents: 1.5 }],
  ])
    assert.throws(() => totalItems(items));
});
test("Malaysia midnight, reminder time, weekends and quiet hours", () => {
  assert.equal(dayKey("2026-10-21T16:30:00Z"), "2026-10-22");
  assert.equal(dueAt("2026-10-21", 3), "2026-10-24T01:00:00.000Z");
  const b = { send_start: 9, send_end: 18, weekdays_only: true };
  assert.equal(isSendWindow(new Date("2026-10-21T01:00:00Z"), b), true);
  assert.equal(isSendWindow(new Date("2026-10-21T10:00:00Z"), b), false);
  assert.equal(isSendWindow(new Date("2026-10-24T02:00:00Z"), b), false);
  assert.equal(isSendWindow(new Date("2026-10-21T19:00:00Z"), b), false);
});
test("Retries stop before provider idempotency expires", () => {
  assert.equal(
    canRetry("2026-10-21T00:00:00Z", new Date("2026-10-21T22:00:00Z")),
    true,
  );
  assert.equal(
    canRetry("2026-10-21T00:00:00Z", new Date("2026-10-22T00:00:00Z")),
    false,
  );
});
test("Template substitution and schedule validation", () => {
  assert.equal(
    renderTemplate("Hi {{customer_name}} — {{amount}}", {
      customer_name: "A <B>",
      amount: "RM 10.00",
    }),
    "Hi A <B> — RM 10.00",
  );
  assert.throws(() =>
    validateRules([
      { days_after: 3, template: "Hi" },
      { days_after: 3, template: "Bye" },
    ]),
  );
  assert.throws(() => validateRules([{ days_after: 0, template: "Hi" }]));
  assert.throws(() =>
    validateRules([{ days_after: 3, template: "{{unknown}}" }]),
  );
  validateRules([{ days_after: 3, template: "Hi {{customer_name}}" }]);
});
test("Demo edits do not silently rewrite already-sent follow-ups", () => {
  const s = seedDemo();
  const q = s.quotations.find((q) =>
    s.reminders.some((r) => r.quotation_id === q.id && r.status === "sent"),
  );
  assert.throws(() => demoSaveQuote(s, q), /already started/);
  const draft = {
    customer_id: s.customers[0].id,
    quote_number: "TEST-01",
    project: "Test",
    sent_date: dayKey(),
    items: [{ description: "Work", quantity: 1, unit_price_cents: 100 }],
    followups_enabled: true,
  };
  const next = demoSaveQuote(s, draft);
  assert.equal(next.reminders.length, s.reminders.length + s.rules.length);
  assert.equal(s.quotations.length, 8);
  assert.throws(() => demoSaveQuote(next, draft), /already used/);
});

test("WhatsApp links use Malaysian international numbers and encode the message", () => {
  assert.equal(whatsappNumber("011-2777 8889"), "601127778889");
  assert.equal(whatsappNumber("+60 12-345 6789"), "60123456789");
  assert.equal(whatsappNumber("60123456789"), "60123456789");
  assert.equal(whatsappNumber(""), null);
  assert.equal(whatsappNumber("123"), null);
  assert.equal(
    whatsappLink("012-345 6789", "Hi Amelia & team"),
    "https://wa.me/60123456789?text=Hi%20Amelia%20%26%20team",
  );
  assert.equal(whatsappLink("", "Hi"), null);
});
