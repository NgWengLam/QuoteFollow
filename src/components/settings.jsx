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
import {
  TEMPLATE_LANGUAGES,
  FOLLOW_UP_TEMPLATES,
  applyTemplateLanguage,
} from "../../shared/followUpTemplates.js";
import { LABEL, initials, Button, Badge, Empty, Modal } from "./ui.jsx";
export function Rules({ data, busy, onSave }) {
  const [rules, setRules] = useState(data.rules.map((r) => ({ ...r }))),
    [error, setError] = useState(""),
    [language, setLanguage] = useState("en"),
    [confirmTemplates, setConfirmTemplates] = useState(false),
    [templateNotice, setTemplateNotice] = useState("");
  const selectedLanguage = TEMPLATE_LANGUAGES.find(
    (item) => item.code === language,
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">PERSONAL, EVEN WHEN AUTOMATED</div>
          <h1>
            A rhythm that feels right<span>.</span>
          </h1>
          <p>Set the timing. Write like yourself. We’ll remember the rest.</p>
        </div>
        <span className="channel-chip">
          <Mail size={16} />
          Email follow-ups
        </span>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          try {
            validateRules(rules);
            setError("");
            onSave(
              rules.map((r) => ({
                days_after: Number(r.days_after),
                template: r.template,
              })),
            );
          } catch (err) {
            setError(err.message);
          }
        }}
      >
        <div className="settings-grid">
          <section className="card rules-card">
            <div className="section-head">
              <div>
                <h2>Your follow-up sequence</h2>
                <p>Days after the quotation was sent. Up to 5 reminders.</p>
              </div>
            </div>
            <div className="template-library">
              <h3>Speak their language</h3>
              <p className="muted">
                Start with a ready-written message, then make it your own.
              </p>
              <label className="field">
                Template library language
                <select
                  value={language}
                  onChange={(e) => {
                    setLanguage(e.target.value);
                    setTemplateNotice("");
                  }}
                >
                  {TEMPLATE_LANGUAGES.map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="template-sample" aria-live="polite">
                <span className="eyebrow">FIRST FOLLOW-UP · SAMPLE</span>
                <p lang={selectedLanguage.lang}>
                  {renderTemplate(FOLLOW_UP_TEMPLATES[language][0], {
                    customer_name: "Alex",
                    quote_number: "Q-2026-001",
                    project:
                      language === "ms"
                        ? "pengubahsuaian dapur"
                        : language === "zh"
                          ? "厨房装修"
                          : "kitchen renovation",
                    business_name: data.business.name,
                  })}
                </p>
              </div>
              <Button
                type="button"
                kind="secondary"
                disabled={busy}
                onClick={() => setConfirmTemplates(true)}
              >
                Use these templates
              </Button>
              <p className="muted template-hint">
                Applies to message bodies. Your follow-up days stay the same.
                Review and save below.
              </p>
              {templateNotice && (
                <p role="status" className="success-note">
                  {templateNotice}
                </p>
              )}
            </div>
            {rules.map((r, i) => (
              <div className="rule" key={i}>
                <div className="rule-top">
                  <span className="rule-number">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <strong>
                    {i === 0
                      ? "A friendly check-in"
                      : i === rules.length - 1
                        ? "Leave the door open"
                        : "Keep the conversation going"}
                  </strong>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Remove follow-up ${i + 1}`}
                    onClick={() => setRules(rules.filter((_, n) => n !== i))}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <label className="day-input">
                  Send after{" "}
                  <input
                    type="number"
                    aria-label={`Follow-up ${i + 1} day`}
                    min="1"
                    max="90"
                    required
                    value={r.days_after}
                    onChange={(e) =>
                      setRules(
                        rules.map((x, n) =>
                          n === i ? { ...x, days_after: e.target.value } : x,
                        ),
                      )
                    }
                  />{" "}
                  days
                </label>
                <label className="field">
                  Message
                  <textarea
                    aria-label={`Follow-up ${i + 1} message`}
                    rows={4}
                    required
                    maxLength={2000}
                    value={r.template}
                    onChange={(e) =>
                      setRules(
                        rules.map((x, n) =>
                          n === i ? { ...x, template: e.target.value } : x,
                        ),
                      )
                    }
                  />
                </label>
              </div>
            ))}
            {!rules.length && (
              <Empty
                title="Choose your first check-in"
                text="Add a reminder to create your follow-up sequence."
              />
            )}
            <div className="rules-bottom">
              <Button
                kind="secondary"
                type="button"
                disabled={rules.length >= 5}
                onClick={() =>
                  setRules([
                    ...rules,
                    {
                      days_after: Math.min(
                        90,
                        Math.max(0, ...rules.map((r) => Number(r.days_after))) +
                          3,
                      ),
                      template: FOLLOW_UP_TEMPLATES[language][0],
                    },
                  ])
                }
              >
                <Plus size={16} />
                Add follow-up
              </Button>
            </div>
          </section>
          <aside>
            <section className="card padded">
              <span className="stat-icon purple">
                <Workflow size={20} />
              </span>
              <h2 className="spaced">Make every message personal</h2>
              <p className="muted">
                These placeholders are filled in for each quotation.
              </p>
              <div className="variables">
                {[
                  "customer_name",
                  "quote_number",
                  "project",
                  "business_name",
                  "amount",
                ].map((v) => (
                  <code key={v}>{"{{" + v + "}}"}</code>
                ))}
              </div>
              <div className="callout">
                Changes apply to new or edited quotations. Existing schedules
                keep their original wording.
              </div>
            </section>
            <section className="card padded schedule-card">
              <ShieldCheck size={23} />
              <h3>Thoughtful by default</h3>
              <p className="muted">
                Follow-ups stop after a reply or a closed quotation. Send
                windows use Malaysian time.
              </p>
              <p className="muted">
                WhatsApp is planned for a later version. No WhatsApp messages
                are sent by this app.
              </p>
            </section>
          </aside>
        </div>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        <div className="save-bar">
          <span>Keep it helpful. Keep it human.</span>
          <Button disabled={busy}>
            {busy ? "Saving…" : "Save follow-up settings"}
            <Check size={16} />
          </Button>
        </div>
      </form>
      {confirmTemplates && (
        <Modal
          title="Replace message drafts?"
          onClose={() => setConfirmTemplates(false)}
        >
          <div className="padded">
            <p>
              Replace all message drafts in this sequence with{" "}
              {selectedLanguage.label} templates? This replaces any custom
              wording. Existing scheduled messages stay unchanged.
            </p>
            {!rules.length && (
              <p>A new sequence will start on days 3, 7 and 14.</p>
            )}
            <div className="template-actions">
              <Button
                type="button"
                kind="secondary"
                onClick={() => setConfirmTemplates(false)}
              >
                Keep my drafts
              </Button>
              <Button
                type="button"
                onClick={() => {
                  setRules(applyTemplateLanguage(rules, language));
                  setConfirmTemplates(false);
                  setError("");
                  setTemplateNotice(
                    "Templates applied to drafts. Edit the messages, then save your follow-up settings.",
                  );
                }}
              >
                Replace drafts
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
export function Account({
  business: b,
  demo,
  session,
  busy,
  onSave,
  onReset,
  notify,
}) {
  const [ready, setReady] = useState(null);
  async function check() {
    if (demo) {
      setReady("Demo mode: delivery is simulated. No emails are sent.");
      return;
    }
    try {
      const response = await fetch(
        (import.meta.env.VITE_API_URL || "") + "/api/readiness",
        { headers: { Authorization: `Bearer ${session.access_token}` } },
      );
      if (!response.ok) throw new Error("API unavailable or session expired");
      const data = await response.json();
      setReady(
        data.emailReady
          ? "Email server configured. Complete your own-address delivery and reply test before enabling automation."
          : "Email delivery is disabled or provider settings are missing.",
      );
    } catch (e) {
      setReady(
        "Cannot reach the email API. Check the server URL and deployment.",
      );
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR BUSINESS, YOUR WAY</div>
          <h1>
            Make yourself at home<span>.</span>
          </h1>
          <p>The details behind every conversation.</p>
        </div>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget),
            fields = {
              name: f.get("name").trim(),
              contact_email: f.get("contact_email").trim(),
              phone: f.get("phone").trim(),
              send_start: Number(f.get("send_start")),
              send_end: Number(f.get("send_end")),
              weekdays_only: f.get("weekdays_only") === "on",
              automation_enabled: f.get("automation_enabled") === "on",
            };
          if (fields.send_end <= fields.send_start)
            return notify("End time must be after start time.", true);
          onSave(fields);
        }}
      >
        <div className="settings-grid">
          <div>
            <section className="card">
              <div className="section-head">
                <h2>Business details</h2>
                <Building2 size={19} />
              </div>
              <div className="form-grid">
                <label className="full">
                  Business name
                  <input
                    name="name"
                    required
                    maxLength={120}
                    defaultValue={b.name}
                  />
                </label>
                <label>
                  Contact email
                  <input
                    type="email"
                    name="contact_email"
                    required
                    defaultValue={b.contact_email}
                  />
                </label>
                <label>
                  Business phone
                  <input name="phone" maxLength={40} defaultValue={b.phone} />
                </label>
              </div>
            </section>
            <section className="card schedule-card">
              <div className="section-head">
                <div>
                  <h2>Respect their time</h2>
                  <p>Messages only leave within this Malaysian time window.</p>
                </div>
                <Clock size={19} />
              </div>
              <div className="form-grid">
                <label>
                  From
                  <select name="send_start" defaultValue={b.send_start}>
                    {Array.from({ length: 10 }, (_, i) => i + 8).map((h) => (
                      <option key={h} value={h}>
                        {String(h).padStart(2, "0")}:00 MYT
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Until
                  <select name="send_end" defaultValue={b.send_end}>
                    {Array.from({ length: 12 }, (_, i) => i + 9).map((h) => (
                      <option key={h} value={h}>
                        {String(h).padStart(2, "0")}:00 MYT
                      </option>
                    ))}
                  </select>
                </label>
                <label className="checkbox full">
                  <input
                    name="weekdays_only"
                    type="checkbox"
                    defaultChecked={b.weekdays_only}
                  />
                  Send Monday to Friday only
                </label>
                <label className="checkbox full">
                  <input
                    name="automation_enabled"
                    type="checkbox"
                    defaultChecked={b.automation_enabled}
                  />
                  Enable automatic follow-ups for this business
                </label>
                <div className="callout full">
                  Enabling requires customer permission, scheduled reminders and
                  a configured email server.{" "}
                  {demo
                    ? "In this demo no messages are sent."
                    : "Pause here to stop new sending attempts."}
                </div>
              </div>
            </section>
          </div>
          <aside>
            <section className="card padded">
              <span className="stat-icon blue">
                <Mail size={20} />
              </span>
              <h2 className="spaced">Email connection</h2>
              <p className="muted">
                Your Express server sends the emails. Secret keys stay on the
                server.
              </p>
              <Button type="button" kind="secondary" onClick={check}>
                <RefreshCw size={15} />
                Check connection
              </Button>
              {ready && (
                <p className="callout" role="status">
                  {ready}
                </p>
              )}
            </section>
            {demo && (
              <section className="card padded schedule-card">
                <h2>A fresh start</h2>
                <p className="muted">
                  Restore the fictional sample data. Demo changes are kept in
                  this browser tab’s session.
                </p>
                <Button type="button" kind="ghost" onClick={onReset}>
                  Reset demo workspace
                </Button>
              </section>
            )}
          </aside>
        </div>
        <div className="save-bar">
          <span>
            <ShieldCheck size={15} />
            Business data is separated by account.
          </span>
          <Button disabled={busy}>
            {busy ? "Saving…" : "Save business settings"}
            <Check size={16} />
          </Button>
        </div>
      </form>
    </>
  );
}
