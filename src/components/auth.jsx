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
export function Auth({ onDemo, notify, toast }) {
  const [signup, setSignup] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  return (
    <div className="auth-page">
      <div className="auth-story">
        <a className="brand">
          <span className="brand-mark">
            Q<span>•</span>
          </span>
          QuoteFollow
        </a>
        <div>
          <span className="eyebrow">MADE FOR YOUR NEXT YES</span>
          <h1>
            You do great work.
            <br />
            Let’s keep it
            <br />
            moving<span>.</span>
          </h1>
          <p>
            Thoughtful quotation follow-ups for
            <br />
            Malaysia’s renovation businesses.
          </p>
          <div className="auth-illustration">
            <div>
              <CheckCircle2 size={20} />
              <span>Quotation sent</span>
              <strong>RM 18,500</strong>
            </div>
            <div>
              <Clock size={20} />
              <span>A friendly follow-up</span>
              <span className="badge pending">Day 3</span>
            </div>
            <div>
              <CheckCheck size={20} />
              <span>Your next project</span>
              <span className="badge accepted">Accepted</span>
            </div>
          </div>
        </div>
        <small>Small team. Big possibilities.</small>
      </div>
      <div className="auth-form">
        <div>
          <h2>{signup ? "A home for your quotations." : "Welcome back."}</h2>
          <p>
            {signup
              ? "Create your account to start keeping track."
              : "Your next conversation starts here."}
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!supabase) {
                setMessage(
                  "The live backend is not configured yet. Try the demo below; setup instructions are included in the project.",
                );
                return;
              }
              setBusy(true);
              setMessage("");
              const f = new FormData(e.currentTarget);
              try {
                const args = {
                  email: f.get("email"),
                  password: f.get("password"),
                };
                const { error, data } = signup
                  ? await supabase.auth.signUp(args)
                  : await supabase.auth.signInWithPassword(args);
                if (error) throw error;
                if (signup && !data.session)
                  setMessage(
                    "Check your email to confirm your account, then sign in.",
                  );
              } catch (err) {
                setMessage(err.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className="field">
              Email address
              <input
                type="email"
                name="email"
                autoComplete="email"
                required
                placeholder="you@yourbusiness.com"
              />
            </label>
            <label className="field">
              Password
              <input
                type="password"
                name="password"
                minLength={8}
                autoComplete={signup ? "new-password" : "current-password"}
                required
                placeholder="At least 8 characters"
              />
            </label>
            {message && (
              <p role="status" className="callout">
                {message}
              </p>
            )}
            <Button disabled={busy}>
              {busy ? "Please wait…" : signup ? "Create account" : "Sign in"}
              <ArrowRight size={17} />
            </Button>
          </form>
          <p className="auth-switch">
            {signup ? "Already have an account?" : "New here?"}{" "}
            <button
              onClick={() => {
                setSignup(!signup);
                setMessage("");
              }}
            >
              {signup ? "Sign in" : "Create an account"}
            </button>
          </p>
          <div className="or">
            <span />
            or explore first
            <span />
          </div>
          <Button kind="secondary" onClick={onDemo}>
            Explore the demo <ArrowUpRight size={17} />
          </Button>
          <p className="auth-hint">
            Fictional data. No sign-up. No emails sent.
          </p>
        </div>
      </div>
    </div>
  );
}
export function Onboard({ busy, onSubmit, toast }) {
  return (
    <div className="loading">
      <div className="card onboarding">
        <h1>Let’s meet your business.</h1>
        <p>One workspace for your customers and quotations.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(new FormData(e.currentTarget).get("name"));
          }}
        >
          <label className="field">
            Business name
            <input
              name="name"
              required
              maxLength={120}
              placeholder="e.g. Ruang Renovation"
            />
          </label>
          <Button disabled={busy}>
            Create workspace <ArrowRight size={16} />
          </Button>
          {toast?.error && <p role="alert">{toast.text}</p>}
        </form>
      </div>
    </div>
  );
}
