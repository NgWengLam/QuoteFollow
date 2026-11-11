import React, { useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  ArrowLeft,
  Plus,
  Trash2,
  Check,
  CheckCheck,
  Mail,
  Clock,
  FileText,
  ShieldCheck,
  Building2,
  Workflow,
  RefreshCw,
  CheckCircle2,
} from "lucide-react";
import {
  money,
  dayKey,
  dateLabel,
  totalItems,
  renderTemplate,
  validateRules,
  DEFAULT_RULES,
} from "../../shared/domain.js";
import { supabase } from "../data.js";
import { LABEL, initials, Button, Badge, Empty } from "./ui.jsx";
export function CustomerForm({ customer: c = {}, onSubmit, busy, onCancel }) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const d = new FormData(e.currentTarget);
        onSubmit({
          ...(c.id ? { id: c.id } : {}),
          name: d.get("name").trim(),
          email: d.get("email").trim(),
          phone: d.get("phone").trim(),
          company: d.get("company").trim(),
          consent: d.get("consent") === "on",
        });
      }}
    >
      <div className="form-grid">
        <label className="full">
          Customer name
          <input
            name="name"
            required
            maxLength={120}
            defaultValue={c.name}
            placeholder="e.g. Amelia Tan"
          />
        </label>
        <label>
          Email address
          <input
            name="email"
            type="email"
            maxLength={254}
            defaultValue={c.email}
            placeholder="customer@example.com"
          />
        </label>
        <label>
          Phone number
          <input
            name="phone"
            maxLength={40}
            defaultValue={c.phone}
            placeholder="+60"
          />
        </label>
        <label className="full">
          Company or area <span className="optional">Optional</span>
          <input
            name="company"
            maxLength={120}
            defaultValue={c.company}
            placeholder="e.g. Setia Alam"
          />
        </label>
        <label className="checkbox full">
          <input type="checkbox" name="consent" defaultChecked={c.consent} />
          <span>
            This customer expects email follow-ups about their quotation.
          </span>
        </label>
        {c.unsubscribed && (
          <p className="callout full">
            Email delivery is blocked for this contact after a bounce or
            complaint.
          </p>
        )}
      </div>
      <div className="modal-actions">
        <Button kind="secondary" type="button" onClick={onCancel}>
          Cancel
        </Button>
        <Button disabled={busy}>{busy ? "Saving…" : "Save customer"}</Button>
      </div>
    </form>
  );
}
export function QuoteForm({
  quote: q = {},
  data,
  onSubmit,
  busy,
  onCancel,
  addCustomer,
}) {
  const [items, setItems] = useState(
      q.items || [{ description: "", quantity: 1, unit_price_cents: 0 }],
    ),
    [err, setErr] = useState("");
  const [follow, setFollow] = useState(q.followups_enabled ?? true),
    [cid, setCid] = useState(q.customer_id || data.customers[0]?.id || "");
  const customer = data.customers.find((c) => c.id === cid);
  let total = 0;
  try {
    total = totalItems(items);
  } catch {}
  const editItem = (i, key, value) =>
    setItems(items.map((x, n) => (i === n ? { ...x, [key]: value } : x)));
  if (!data.customers.length)
    return (
      <div className="guide-content">
        <Empty
          title="Start with a customer"
          text="Add the person this quotation is for, then create your quote."
          action={
            <Button onClick={addCustomer}>
              <Plus size={16} />
              Add customer
            </Button>
          }
        />
      </div>
    );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setErr("");
        try {
          totalItems(items);
          const d = new FormData(e.currentTarget);
          onSubmit({
            ...q,
            customer_id: cid,
            quote_number: d.get("quote_number").trim(),
            project: d.get("project").trim(),
            sent_date: d.get("sent_date"),
            notes: d.get("notes").trim(),
            items,
            followups_enabled: follow,
          });
        } catch (error) {
          setErr(error.message);
        }
      }}
    >
      <div className="form-grid">
        <label>
          Customer
          <select value={cid} onChange={(e) => setCid(e.target.value)} required>
            {data.customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Quotation number
          <input
            name="quote_number"
            required
            maxLength={40}
            defaultValue={
              q.quote_number ||
              `QT-${new Date().getFullYear()}-${String(data.quotations.length + 1).padStart(3, "0")}`
            }
          />
        </label>
        <label className="full">
          Project name
          <input
            name="project"
            required
            maxLength={160}
            defaultValue={q.project}
            placeholder="e.g. Kitchen renovation · Setia Alam"
          />
        </label>
        <label>
          Date quotation was sent
          <input
            type="date"
            name="sent_date"
            required
            max={dayKey()}
            defaultValue={q.sent_date || dayKey()}
          />
        </label>
        <div className="field-note">
          We’ll count follow-up days from this date. The original quotation
          should already have been sent.
        </div>
        <div className="full item-editor">
          <div className="item-header">
            <span>Description</span>
            <span>Qty</span>
            <span>Unit price (RM)</span>
            <span />
          </div>
          {items.map((item, i) => (
            <div className="item-row" key={i}>
              <input
                aria-label={`Item ${i + 1} description`}
                required
                maxLength={300}
                value={item.description}
                placeholder="Scope of work"
                onChange={(e) => editItem(i, "description", e.target.value)}
              />
              <input
                aria-label={`Item ${i + 1} quantity`}
                type="number"
                min="0.01"
                max="100000"
                step="0.01"
                required
                value={item.quantity}
                onChange={(e) => editItem(i, "quantity", e.target.value)}
              />
              <input
                aria-label={`Item ${i + 1} unit price`}
                type="number"
                min="0"
                max="1000000"
                step="0.01"
                required
                value={item.unit_price_cents / 100}
                onChange={(e) =>
                  editItem(
                    i,
                    "unit_price_cents",
                    Math.round(Number(e.target.value) * 100),
                  )
                }
              />
              <button
                type="button"
                className="icon-btn"
                aria-label={`Remove item ${i + 1}`}
                disabled={items.length === 1}
                onClick={() => setItems(items.filter((_, n) => n !== i))}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <div className="item-footer">
            <button
              type="button"
              className="text-link"
              disabled={items.length >= 50}
              onClick={() =>
                setItems([
                  ...items,
                  { description: "", quantity: 1, unit_price_cents: 0 },
                ])
              }
            >
              <Plus size={14} />
              Add item
            </button>
            <strong>
              Total <span>{money(total)}</span>
            </strong>
          </div>
        </div>
        <label className="full">
          Internal notes{" "}
          <span className="optional">
            Optional · never included in messages
          </span>
          <textarea
            name="notes"
            maxLength={3000}
            defaultValue={q.notes}
            rows={2}
          />
        </label>
        <label className="checkbox full">
          <input
            type="checkbox"
            checked={follow}
            onChange={(e) => setFollow(e.target.checked)}
          />
          <span>Schedule follow-ups using my current rules.</span>
        </label>
        {follow && (
          <div className="callout full">
            {!customer?.email || !customer?.consent || customer?.unsubscribed
              ? "Sending will be blocked until this customer has a valid email and confirmed permission."
              : !data.rules.length
                ? "No rules yet. Add follow-up rules first, then edit this quotation to schedule them."
                : `Follow-ups on days ${data.rules.map((r) => r.days_after).join(", ")}. Sending respects your business hours and automation settings.`}
          </div>
        )}
        {err && (
          <p role="alert" className="error-text full">
            {err}
          </p>
        )}
      </div>
      <div className="modal-actions">
        <Button kind="secondary" type="button" onClick={onCancel}>
          Cancel
        </Button>
        <Button disabled={busy}>
          {busy ? "Saving…" : "Save quotation"}
          <ArrowRight size={16} />
        </Button>
      </div>
    </form>
  );
}
