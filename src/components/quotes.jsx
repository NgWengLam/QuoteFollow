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
  MessageCircle,
} from "lucide-react";
import {
  money,
  dayKey,
  dateLabel,
  totalItems,
  renderTemplate,
  validateRules,
  DEFAULT_RULES,
  whatsappLink,
} from "../../shared/domain.js";
import { supabase } from "../data.js";
import { LABEL, initials, Button, Badge, Empty } from "./ui.jsx";
export function QuoteDetail({
  quote: q,
  customer: c,
  data,
  busy,
  back,
  edit,
  updateStatus,
  archive,
  remove,
  preview,
}) {
  const reminders = data.reminders
      .filter((r) => r.quotation_id === q.id)
      .sort((a, b) => a.days_after - b.days_after),
    logs = data.logs.filter((l) => l.quotation_id === q.id);
  const waLink = (r) =>
    c.consent
      ? whatsappLink(
          c.phone,
          renderTemplate(r.template, {
            customer_name: c.name,
            quote_number: q.quote_number,
            project: q.project,
            business_name: data.business.name,
            amount: money(q.amount_cents),
          }),
        )
      : null;
  const hasEmailHistory =
    logs.length > 0 ||
    reminders.some((r) => r.first_attempt_at || r.status === "sent");
  const editable =
    !q.archived_at &&
    q.status === "pending" &&
    !q.replied_at &&
    !reminders.some((r) => r.first_attempt_at || r.status === "sent");
  return (
    <>
      <button className="back-link" onClick={back}>
        <ArrowLeft size={16} />
        All quotations
      </button>
      <div className="page-heading detail-heading">
        <div>
          <div className="eyebrow">{q.quote_number}</div>
          <h1>{q.project}</h1>
          <p>
            {c.name} · Sent {dateLabel(q.sent_date)}
          </p>
        </div>
        <div className="inline-actions">
          <Badge status={q.status} />
          {q.archived_at && <span className="badge no_reply">Archived</span>}
          {editable && (
            <Button kind="secondary" onClick={edit}>
              Edit quotation
            </Button>
          )}
          <Button
            kind="secondary"
            disabled={busy}
            onClick={() => archive(!q.archived_at)}
          >
            {q.archived_at ? "Unarchive" : "Archive"}
          </Button>
          {!hasEmailHistory && (
            <Button kind="secondary" disabled={busy} onClick={remove}>
              <Trash2 size={16} />
              Delete
            </Button>
          )}
        </div>
      </div>
      <div className="detail-grid">
        <div>
          <section className="card">
            <div className="section-head">
              <h2>Quotation details</h2>
              <span className="muted">MYR</span>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Scope of work</th>
                    <th>Qty</th>
                    <th>Unit price</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {q.items.map((item, i) => (
                    <tr key={i}>
                      <td>{item.description}</td>
                      <td>{item.quantity}</td>
                      <td>{money(item.unit_price_cents)}</td>
                      <td>
                        {money(
                          Math.round(item.quantity * item.unit_price_cents),
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="quote-total">
              <span>Quotation total</span>
              <strong>{money(q.amount_cents)}</strong>
            </div>
            {q.notes && (
              <div className="notes">
                <span className="eyebrow">INTERNAL NOTES</span>
                <p>{q.notes}</p>
              </div>
            )}
          </section>
          <section className="card message-history">
            <div className="section-head">
              <div>
                <h2>Message history</h2>
                <p>A record of each conversation touchpoint.</p>
              </div>
              <Mail size={19} />
            </div>
            {logs.length ? (
              logs.map((l) => (
                <div className="log" key={l.id}>
                  <span className="log-icon">
                    <Mail size={15} />
                  </span>
                  <div>
                    <strong>
                      {l.direction === "inbound"
                        ? "Reply received"
                        : l.direction === "system"
                          ? "Delivery update"
                          : "Email follow-up"}
                    </strong>
                    <small>
                      {dateLabel(l.sent_at)} · {l.channel}
                    </small>
                    <p>{l.content}</p>
                  </div>
                </div>
              ))
            ) : (
              <Empty
                title="No messages yet"
                text="Sent follow-ups and recorded email replies will appear here."
              />
            )}
          </section>
        </div>
        <div>
          <section className="card padded">
            <h2>Keep the status up to date</h2>
            <p className="muted">
              A reply, acceptance or rejection stops remaining reminders.
            </p>
            <label className="field">
              Quotation status
              <select
                aria-label="Quotation status"
                value={q.status}
                disabled={busy}
                onChange={(e) => updateStatus(q, e.target.value)}
              >
                {Object.entries(LABEL).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <Button
              kind="secondary"
              disabled={busy || !!q.replied_at}
              onClick={() => updateStatus(q, q.status, true)}
            >
              <CheckCheck size={16} />
              {q.replied_at ? "Reply recorded" : "Mark customer replied"}
            </Button>
            {q.replied_at && (
              <p className="success-note">
                Follow-ups stopped on {dateLabel(q.replied_at)}.
              </p>
            )}
            <div className="contact-summary">
              <span className="avatar">{initials(c.name)}</span>
              <div>
                <strong>{c.name}</strong>
                <p>
                  {c.email || "No email"}
                  <br />
                  {c.phone}
                </p>
              </div>
            </div>
          </section>
          <section className="card padded schedule-card">
            <h2>Follow-up schedule</h2>
            <p className="muted">
              Malaysia time · {data.business.send_start}:00–
              {data.business.send_end}:00
              {data.business.weekdays_only ? " · Weekdays" : ""}
            </p>
            {reminders.map((r) => (
              <div className="scheduled-item" key={r.id}>
                <span className={"schedule-dot " + r.status}>
                  {r.status === "sent" ? (
                    <Check size={13} />
                  ) : (
                    <Clock size={13} />
                  )}
                </span>
                <div>
                  <strong>Day {r.days_after}</strong>
                  <small>
                    {dateLabel(r.send_at)} · {r.status.replaceAll("_", " ")}
                  </small>
                  {r.last_error && <p className="error-text">{r.last_error}</p>}
                </div>
                <button
                  className="icon-btn"
                  aria-label={`Preview day ${r.days_after} message`}
                  onClick={() => preview(r)}
                >
                  <Mail size={16} />
                </button>
                {r.status !== "cancelled" && waLink(r) && (
                  <a
                    className="icon-btn whatsapp"
                    aria-label={`Send day ${r.days_after} message on WhatsApp`}
                    title="Send on WhatsApp"
                    href={waLink(r)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <MessageCircle size={16} />
                  </a>
                )}
              </div>
            ))}
            {!reminders.length && (
              <p className="muted">
                No follow-ups scheduled for this quotation.
              </p>
            )}
            {!data.business.automation_enabled && (
              <div className="callout">Business automation is paused.</div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
export function MessagePreview({ quote: q, reminder: r, data, demo }) {
  const c = data.customers.find((c) => c.id === q.customer_id);
  const text = renderTemplate(r.template, {
    customer_name: c.name,
    quote_number: q.quote_number,
    project: q.project,
    business_name: data.business.name,
    amount: money(q.amount_cents),
  });
  const wa =
    c.consent && r.status !== "cancelled" ? whatsappLink(c.phone, text) : null;
  return (
    <div className="message-preview">
      <div className="email-meta">
        <span>To</span>
        <strong>{c.email || "No email recorded"}</strong>
        <span>Subject</span>
        <strong>
          {data.business.name} · Quotation {q.quote_number}
        </strong>
      </div>
      <div className="email-body">
        {text}
        <p className="email-footer">
          Reply to this email to ask a question or stop further follow-ups.
          <br />
          {data.business.name} · {data.business.phone}
        </p>
      </div>
      <div className="callout">
        <Clock size={16} />
        <span>
          Day {r.days_after} · Due {dateLabel(r.send_at)}.{" "}
          {demo
            ? "Demo only — no email will be sent."
            : "The hourly worker sends during your business hours when enabled."}
        </span>
      </div>
      {wa && (
        <a
          className="btn secondary"
          href={wa}
          target="_blank"
          rel="noopener noreferrer"
        >
          <MessageCircle size={16} />
          Send on WhatsApp
        </a>
      )}
    </div>
  );
}
