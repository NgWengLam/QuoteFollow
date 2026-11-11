import React, { useState, useEffect } from "react";
import {
  LayoutDashboard,
  Users,
  FileText,
  Workflow,
  Settings,
  ArrowUpRight,
  ArrowRight,
  Plus,
  Search,
  ChevronDown,
  ChevronRight,
  Check,
  CheckCheck,
  Clock,
  Mail,
  X,
  LogOut,
  HelpCircle,
  Menu,
  Building2,
  ShieldCheck,
  CheckCircle2,
  CalendarDays,
  AlertCircle,
} from "lucide-react";
import {
  money,
  dayKey,
  dateLabel,
  totalItems,
  validateRules,
  DEFAULT_RULES,
} from "../shared/domain.js";
import { loadDemo, persistDemo, seedDemo, demoSaveQuote } from "./demo.js";
import { supabase, loadLive, unwrap } from "./data.js";
import {
  LABEL,
  initials,
  Button,
  Badge,
  Modal,
  Empty,
} from "./components/ui.jsx";
import { CustomerForm, QuoteForm } from "./components/forms.jsx";
import { QuoteDetail, MessagePreview } from "./components/quotes.jsx";
import { Rules, Account } from "./components/settings.jsx";
import { Auth, Onboard } from "./components/auth.jsx";
const NAV = [
  ["dashboard", "Overview", LayoutDashboard],
  ["quotations", "Quotations", FileText],
  ["customers", "Customers", Users],
  ["followups", "Follow-up settings", Workflow],
];
export default function App() {
  const [demo, setDemo] = useState(!supabase),
    [session, setSession] = useState(null),
    [data, setData] = useState(() => (!supabase ? loadDemo() : null)),
    [loading, setLoading] = useState(!!supabase),
    [page, setPage] = useState("dashboard"),
    [selected, setSelected] = useState(null),
    [modal, setModal] = useState(null),
    [toast, setToast] = useState(null),
    [busy, setBusy] = useState(false),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [mobile, setMobile] = useState(false),
    [onboard, setOnboard] = useState(false),
    [loadError, setLoadError] = useState("");
  const notify = (text, error = false) => setToast({ text, error });
  async function refresh() {
    setLoading(true);
    setLoadError("");
    try {
      const next = await loadLive();
      setData(next);
      setOnboard(!next);
    } catch (e) {
      setLoadError(e.message);
      notify(e.message, true);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (!s) setData(null);
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (session && !demo) refresh();
  }, [session?.user?.id, demo]);
  useEffect(() => {
    if (demo && data) persistDemo(data);
  }, [data, demo]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6500);
    return () => clearTimeout(t);
  }, [toast]);
  const navigate = (p) => {
    setPage(p);
    setSelected(null);
    setSearch("");
    setFilter("all");
    setMobile(false);
  };
  async function mutate(fn) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      if (!demo) await refresh();
      setModal(null);
    } catch (e) {
      notify(e.message || "Something went wrong. Please try again.", true);
    } finally {
      setBusy(false);
    }
  }
  function enterDemo() {
    setDemo(true);
    setData(loadDemo());
    setLoading(false);
    setOnboard(false);
    navigate("dashboard");
  }
  async function logout() {
    if (!demo) await supabase.auth.signOut();
    setSession(null);
    setData(null);
    setDemo(false);
    navigate("dashboard");
  }
  async function saveCustomer(c) {
    await mutate(async () => {
      if (demo) {
        setData((s) => ({
          ...s,
          customers: c.id
            ? s.customers.map((x) => (x.id === c.id ? { ...x, ...c } : x))
            : [
                {
                  ...c,
                  id: crypto.randomUUID(),
                  business_id: s.business.id,
                  unsubscribed: false,
                },
                ...s.customers,
              ],
        }));
      } else {
        const { id, ...fields } = c;
        unwrap(
          id
            ? await supabase.from("customers").update(fields).eq("id", id)
            : await supabase
                .from("customers")
                .insert({ ...fields, business_id: data.business.id }),
        );
      }
      notify("Customer saved.");
    });
  }
  async function saveQuote(q) {
    await mutate(async () => {
      totalItems(q.items);
      if (q.sent_date > dayKey())
        throw new Error("Use today or an earlier sent date.");
      if (demo) setData((s) => demoSaveQuote(s, q));
      else unwrap(await supabase.rpc("save_quote", { data: q }));
      notify("Quotation saved. Follow-ups will use the current schedule.");
    });
  }
  async function updateStatus(q, status, replied = false) {
    await mutate(async () => {
      if (demo)
        setData((s) => ({
          ...s,
          quotations: s.quotations.map((x) =>
            x.id === q.id
              ? {
                  ...x,
                  status,
                  replied_at: replied ? new Date().toISOString() : x.replied_at,
                  followups_enabled:
                    status !== "pending" || replied
                      ? false
                      : x.followups_enabled,
                }
              : x,
          ),
          reminders: s.reminders.map((r) =>
            r.quotation_id === q.id &&
            r.status !== "sent" &&
            (replied || status !== "pending")
              ? { ...r, status: "cancelled" }
              : r,
          ),
        }));
      else
        unwrap(
          await supabase.rpc("set_quote_status", {
            quote_id: q.id,
            new_status: status,
            mark_replied: replied,
          }),
        );
      notify(
        replied
          ? "Reply recorded. Remaining follow-ups stopped."
          : "Quotation status updated.",
      );
    });
  }
  async function archiveQuote(q, archive = true) {
    await mutate(async () => {
      if (demo)
        setData((s) => ({
          ...s,
          quotations: s.quotations.map((x) =>
            x.id === q.id
              ? {
                  ...x,
                  archived_at: archive ? new Date().toISOString() : null,
                  followups_enabled: archive ? false : x.followups_enabled,
                }
              : x,
          ),
          reminders: s.reminders.map((r) =>
            archive && r.quotation_id === q.id && r.status !== "sent"
              ? { ...r, status: "cancelled" }
              : r,
          ),
        }));
      else
        unwrap(
          await supabase.rpc("archive_quote", { quote_id: q.id, archive }),
        );
      notify(
        archive
          ? "Quotation archived. Remaining follow-ups stopped."
          : "Quotation restored. Stopped follow-ups stay stopped.",
      );
    });
  }
  async function deleteQuote(q) {
    await mutate(async () => {
      if (demo) {
        if (
          data.reminders.some(
            (r) =>
              r.quotation_id === q.id &&
              (r.status === "sent" || r.first_attempt_at),
          ) ||
          data.logs.some((l) => l.quotation_id === q.id)
        )
          throw new Error(
            "This quotation has email history. Archive it instead.",
          );
        setData((s) => ({
          ...s,
          quotations: s.quotations.filter((x) => x.id !== q.id),
          reminders: s.reminders.filter((r) => r.quotation_id !== q.id),
        }));
      } else unwrap(await supabase.rpc("delete_quote", { quote_id: q.id }));
      setSelected(null);
      notify("Quotation deleted.");
    });
  }
  if (loading && !data)
    return (
      <div className="loading">
        <div className="brand-mark">
          Q<span>•</span>
        </div>
        <p>Opening your workspace…</p>
      </div>
    );
  if (!demo && !session)
    return <Auth onDemo={enterDemo} notify={notify} toast={toast} />;
  if (onboard)
    return (
      <Onboard
        busy={busy}
        onSubmit={(name) =>
          mutate(async () => {
            unwrap(
              await supabase.rpc("onboard_business", { business_name: name }),
            );
            unwrap(await supabase.rpc("save_rules", { rules: DEFAULT_RULES }));
            setOnboard(false);
          })
        }
        toast={toast}
      />
    );
  if (!data)
    return (
      <div className="loading">
        <h2>Workspace unavailable</h2>
        <p>{loadError || "Please try again."}</p>
        <Button onClick={refresh}>Retry</Button>
        <Button kind="ghost" onClick={logout}>
          Sign out
        </Button>
      </div>
    );
  const customer = (id) =>
    data.customers.find((c) => c.id === id) || { name: "Unknown customer" };
  const qById = (id) => data.quotations.find((q) => q.id === id);
  const active = data.quotations.filter((q) => !q.archived_at);
  const archivedCount = data.quotations.length - active.length;
  const pending = active.filter((q) => q.status === "pending");
  const pendingValue = pending.reduce((a, q) => a + Number(q.amount_cents), 0);
  const due = data.reminders.filter(
    (r) =>
      r.status === "pending" &&
      dayKey(r.send_at) <= dayKey() &&
      qById(r.quotation_id)?.status === "pending" &&
      !qById(r.quotation_id)?.replied_at,
  );
  const selectedQuote = data.quotations.find((q) => q.id === selected);
  const matchingQuotes = data.quotations.filter(
    (q) =>
      (filter === "archived"
        ? !!q.archived_at
        : !q.archived_at && (filter === "all" || q.status === filter)) &&
      `${q.quote_number} ${q.project} ${customer(q.customer_id).name}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const stats = [
    {
      label: "Pending quotation value",
      value: money(pendingValue),
      sub: `Across ${pending.length} open quotations`,
      icon: FileText,
      color: "purple",
    },
    {
      label: "Follow-ups due",
      value: String(due.length).padStart(2, "0"),
      sub: "Today & overdue · MYT",
      icon: Clock,
      color: "orange",
    },
    {
      label: "Accepted quotations",
      value: String(
        active.filter((q) => q.status === "accepted").length,
      ).padStart(2, "0"),
      sub:
        money(
          active
            .filter((q) => q.status === "accepted")
            .reduce((a, q) => a + Number(q.amount_cents), 0),
        ) + " in accepted work",
      icon: CheckCheck,
      color: "green",
    },
    {
      label: "Total customers",
      value: String(data.customers.length).padStart(2, "0"),
      sub: "People behind your projects",
      icon: Users,
      color: "blue",
    },
  ];
  function quoteTable(quotes) {
    return (
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Quotation / project</th>
              <th>Customer</th>
              <th>Amount</th>
              <th>Sent date</th>
              <th>Status</th>
              <th aria-label="Open quotation" />
            </tr>
          </thead>
          <tbody>
            {quotes.map((q) => (
              <tr key={q.id}>
                <td>
                  <button
                    className="quote-link"
                    onClick={() => {
                      setSelected(q.id);
                      setPage("quotations");
                    }}
                  >
                    {q.quote_number}
                  </button>
                  <span className="subline">{q.project}</span>
                </td>
                <td>
                  <div className="person">
                    <span className="avatar small">
                      {initials(customer(q.customer_id).name)}
                    </span>
                    <span>{customer(q.customer_id).name}</span>
                  </div>
                </td>
                <td className="amount">{money(q.amount_cents)}</td>
                <td className="muted">{dateLabel(q.sent_date)}</td>
                <td>
                  <Badge status={q.status} />
                </td>
                <td>
                  <button
                    className="icon-btn"
                    aria-label={`Open ${q.quote_number}`}
                    onClick={() => {
                      setSelected(q.id);
                      setPage("quotations");
                    }}
                  >
                    <ChevronRight size={17} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!quotes.length && (
          <Empty
            title="No quotations here yet"
            text="Add a sent quotation to start keeping track."
            action={
              <Button onClick={() => setModal({ type: "quote" })}>
                <Plus size={16} />
                New quotation
              </Button>
            }
          />
        )}
      </div>
    );
  }
  return (
    <div className="app-shell">
      <aside className={"sidebar " + (mobile ? "visible" : "")}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate("dashboard");
          }}
        >
          <span className="brand-mark">
            Q<span>•</span>
          </span>
          QuoteFollow
        </a>
        <button className="business-switch" onClick={() => navigate("account")}>
          <span className="business-icon">
            <Building2 size={18} />
          </span>
          <span>
            <strong>{data.business.name}</strong>
            <small>Renovation workspace</small>
          </span>
          <ChevronDown size={15} />
        </button>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {NAV.map(([id, label, Icon]) => (
            <button
              key={id}
              className={page === id ? "active" : ""}
              onClick={() => navigate(id)}
            >
              <Icon size={19} />
              {label}
              {id === "quotations" && (
                <span className="nav-count">{active.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="tiny-icon">
            <Mail size={18} />
          </span>
          <h4>
            Good work deserves
            <br />a follow-up.
          </h4>
          <p>A thoughtful reminder can start your next project.</p>
          <button onClick={() => navigate("followups")}>
            Make it yours <ArrowUpRight size={14} />
          </button>
        </div>
        <div className="sidebar-bottom">
          <button onClick={() => setModal({ type: "help" })}>
            <HelpCircle size={18} />
            Getting started
          </button>
          <button
            className={page === "account" ? "active" : ""}
            onClick={() => navigate("account")}
          >
            <Settings size={18} />
            Account settings
          </button>
          <div className="profile">
            <span className="avatar">
              {demo ? "RR" : initials(session?.user?.email)}
            </span>
            <span>
              <strong>
                {demo
                  ? "Ruang Renovation"
                  : session?.user?.email?.split("@")[0]}
              </strong>
              <small>{demo ? "Demo workspace" : "Business owner"}</small>
            </span>
            <button
              className="icon-btn"
              aria-label={demo ? "Leave demo" : "Sign out"}
              onClick={logout}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <button
            className="icon-btn mobile-menu"
            aria-label="Open navigation"
            onClick={() => setMobile(!mobile)}
          >
            <Menu size={22} />
          </button>
          <div className="breadcrumb">
            Workspace <ChevronRight size={13} />
            <strong>
              {page === "account"
                ? "Account settings"
                : NAV.find((n) => n[0] === page)?.[1]}
            </strong>
          </div>
          <div className="top-meta">
            <span className="timezone">
              <span /> Malaysia · UTC+8
            </span>
            <button
              className="avatar top-avatar"
              aria-label="Account settings"
              onClick={() => navigate("account")}
            >
              {initials(data.business.name)}
            </button>
          </div>
        </header>
        <main>
          <div className="mode-banner">
            <span>
              {demo ? (
                <>
                  <span className="demo-dot" /> DEMO WORKSPACE{" "}
                  <span className="banner-detail">
                    Fictional data. Explore freely — no emails are sent.
                  </span>
                </>
              ) : (
                <>
                  <ShieldCheck size={15} /> Your business workspace{" "}
                  <span className="banner-detail">
                    {data.business.automation_enabled
                      ? "Follow-ups enabled; provider setup required."
                      : "Automatic follow-ups are paused."}
                  </span>
                </>
              )}
            </span>
            <button
              onClick={() => (demo ? setModal({ type: "connect" }) : refresh())}
            >
              {demo ? "Connect your business" : "Refresh"}
              <ArrowRight size={14} />
            </button>
          </div>
          {page === "dashboard" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    A LITTLE FOLLOW-UP. A LOT OF POSSIBILITY.
                  </div>
                  <h1>
                    Keep the conversation going<span>.</span>
                  </h1>
                  <p>Here’s what’s happening with your quotations.</p>
                </div>
                <Button onClick={() => setModal({ type: "quote" })}>
                  <Plus size={17} />
                  New quotation
                </Button>
              </div>
              <div className="stats-grid">
                {stats.map((s) => (
                  <div className="stat-card" key={s.label}>
                    <div className="stat-top">
                      <span>{s.label}</span>
                      <span className={"stat-icon " + s.color}>
                        <s.icon size={18} />
                      </span>
                    </div>
                    <strong>{s.value}</strong>
                    <small>{s.sub}</small>
                  </div>
                ))}
              </div>
              <div className="dashboard-grid">
                <section className="card due-card">
                  <div className="section-head">
                    <div>
                      <h2>
                        Time for a little nudge{" "}
                        <span className="number-chip">{due.length}</span>
                      </h2>
                      <p>These conversations could use your attention.</p>
                    </div>
                    <span className="today-chip">
                      <CalendarDays size={13} />
                      {dateLabel(dayKey())}
                    </span>
                  </div>
                  <div className="due-list">
                    {due.slice(0, 3).map((r) => {
                      const q = qById(r.quotation_id),
                        c = customer(q.customer_id);
                      return (
                        <div className="due-row" key={r.id}>
                          <span className="avatar">{initials(c.name)}</span>
                          <div className="due-info">
                            <strong>{c.name}</strong>
                            <span>{q.project}</span>
                            <small>
                              {q.quote_number} <b>·</b> Day {r.days_after}{" "}
                              follow-up
                            </small>
                          </div>
                          <div className="due-right">
                            <strong>{money(q.amount_cents)}</strong>
                            <button
                              onClick={() =>
                                setModal({
                                  type: "preview",
                                  quote: q,
                                  reminder: r,
                                })
                              }
                            >
                              Review message <ArrowRight size={14} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    {!due.length && (
                      <Empty
                        title="You’re all caught up"
                        text="Due follow-ups will appear here. Keep doing great work."
                      />
                    )}
                  </div>
                  <button
                    className="card-footer-link"
                    onClick={() => {
                      navigate("quotations");
                      setFilter("pending");
                    }}
                  >
                    View all pending quotations <ArrowRight size={16} />
                  </button>
                </section>
                <section className="card pipeline">
                  <div className="section-head">
                    <div>
                      <h2>Your quotation pipeline</h2>
                      <p>A clear picture of where things stand.</p>
                    </div>
                    <FileText size={18} />
                  </div>
                  <div className="pipeline-total">
                    <strong>
                      {money(
                        active.reduce((a, q) => a + Number(q.amount_cents), 0),
                      )}
                    </strong>
                    <span>Total quoted value · all quotations</span>
                  </div>
                  <div className="stack-bar" aria-label="Quotations by status">
                    {Object.keys(LABEL).map((status) => (
                      <span
                        key={status}
                        className={status}
                        style={{
                          flex:
                            active.filter((q) => q.status === status).length ||
                            0,
                        }}
                      />
                    ))}
                  </div>
                  <div className="pipeline-legend">
                    {Object.entries(LABEL).map(([status, label]) => (
                      <button
                        key={status}
                        onClick={() => {
                          navigate("quotations");
                          setFilter(status);
                        }}
                      >
                        <span className={"legend-dot " + status} />
                        <span>{label}</span>
                        <strong>
                          {active.filter((q) => q.status === status).length}
                        </strong>
                        <small>
                          {active.length
                            ? Math.round(
                                (active.filter((q) => q.status === status)
                                  .length /
                                  active.length) *
                                  100,
                              )
                            : 0}
                          %
                        </small>
                      </button>
                    ))}
                  </div>
                  <div className="pipeline-tip">
                    <span>✦</span>
                    <p>
                      Consistency builds trust.
                      <br />
                      Let your follow-ups do the remembering.
                    </p>
                  </div>
                </section>
              </div>
              <section className="card recent">
                <div className="section-head">
                  <div>
                    <h2>Recent quotations</h2>
                    <p>Your latest projects, all in one place.</p>
                  </div>
                  <button
                    className="text-link"
                    onClick={() => navigate("quotations")}
                  >
                    View all quotations <ArrowRight size={15} />
                  </button>
                </div>
                {quoteTable(active.slice(0, 5))}
              </section>
              <div className="page-foot">
                <span>
                  <ShieldCheck size={14} />
                  Built for small teams. Designed for thoughtful follow-ups.
                </span>
                <span>Made for your next yes.</span>
              </div>
            </>
          )}
          {page === "quotations" && !selectedQuote && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">FROM SENT TO SETTLED</div>
                  <h1>
                    Your quotations<span>.</span>
                  </h1>
                  <p>Every opportunity, with a clear next step.</p>
                </div>
                <Button onClick={() => setModal({ type: "quote" })}>
                  <Plus size={17} />
                  New quotation
                </Button>
              </div>
              <section className="card">
                <div className="table-tools">
                  <div className="tabs">
                    {[
                      ["all", "All quotations"],
                      ...Object.entries(LABEL),
                      ["archived", "Archived"],
                    ].map(([id, label]) => (
                      <button
                        key={id}
                        className={filter === id ? "selected" : ""}
                        onClick={() => setFilter(id)}
                      >
                        {label}
                        <small>
                          {id === "all"
                            ? active.length
                            : id === "archived"
                              ? archivedCount
                              : active.filter((q) => q.status === id).length}
                        </small>
                      </button>
                    ))}
                  </div>
                  <div className="search">
                    <Search size={17} />
                    <input
                      aria-label="Search quotations"
                      placeholder="Search quotes or customers…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                </div>
                {quoteTable(matchingQuotes)}
              </section>
            </>
          )}
          {page === "quotations" && selectedQuote && (
            <QuoteDetail
              quote={selectedQuote}
              customer={customer(selectedQuote.customer_id)}
              data={data}
              busy={busy}
              back={() => setSelected(null)}
              edit={() => setModal({ type: "quote", quote: selectedQuote })}
              updateStatus={updateStatus}
              archive={(archive) =>
                archive
                  ? setModal({ type: "archive", quote: selectedQuote })
                  : archiveQuote(selectedQuote, false)
              }
              remove={() => setModal({ type: "delete", quote: selectedQuote })}
              preview={(r) =>
                setModal({ type: "preview", quote: selectedQuote, reminder: r })
              }
            />
          )}
          {page === "customers" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">PEOPLE, BEFORE PROJECTS</div>
                  <h1>
                    Your customers<span>.</span>
                  </h1>
                  <p>Keep the details close and the conversations personal.</p>
                </div>
                <Button onClick={() => setModal({ type: "customer" })}>
                  <Plus size={17} />
                  Add customer
                </Button>
              </div>
              <section className="card">
                <div className="section-head">
                  <h2>{data.customers.length} customers</h2>
                  <div className="search">
                    <Search size={17} />
                    <input
                      aria-label="Search customers"
                      placeholder="Search customers…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Customer</th>
                        <th>Email & phone</th>
                        <th>Company / area</th>
                        <th>Quotations</th>
                        <th>Follow-up permission</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {data.customers
                        .filter((c) =>
                          `${c.name} ${c.email} ${c.company}`
                            .toLowerCase()
                            .includes(search.toLowerCase()),
                        )
                        .map((c) => (
                          <tr key={c.id}>
                            <td>
                              <div className="person">
                                <span className="avatar">
                                  {initials(c.name)}
                                </span>
                                <strong>{c.name}</strong>
                              </div>
                            </td>
                            <td>
                              {c.email || "No email"}
                              <span className="subline">
                                {c.phone || "No phone"}
                              </span>
                            </td>
                            <td className="muted">{c.company || "—"}</td>
                            <td>
                              {
                                data.quotations.filter(
                                  (q) => q.customer_id === c.id,
                                ).length
                              }
                            </td>
                            <td>
                              <span
                                className={
                                  "badge " +
                                  (c.consent && !c.unsubscribed
                                    ? "accepted"
                                    : "no_reply")
                                }
                              >
                                {c.unsubscribed
                                  ? "Blocked"
                                  : c.consent
                                    ? "Confirmed"
                                    : "Not recorded"}
                              </span>
                            </td>
                            <td>
                              <Button
                                kind="ghost"
                                onClick={() =>
                                  setModal({ type: "customer", customer: c })
                                }
                              >
                                Edit
                              </Button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                  {!data.customers.length && (
                    <Empty
                      title="Add your first customer"
                      text="A name and contact details are all you need to begin."
                    />
                  )}
                </div>
              </section>
            </>
          )}
          {page === "followups" && (
            <Rules
              key={JSON.stringify(data.rules)}
              data={data}
              busy={busy}
              onSave={(rules) =>
                mutate(async () => {
                  validateRules(rules);
                  if (demo)
                    setData((s) => ({
                      ...s,
                      rules: rules.map((r) => ({
                        ...r,
                        id: crypto.randomUUID(),
                        business_id: s.business.id,
                      })),
                    }));
                  else unwrap(await supabase.rpc("save_rules", { rules }));
                  notify(
                    "Schedule saved. Applies to newly created or edited quotations.",
                  );
                })
              }
            />
          )}
          {page === "account" && (
            <Account
              key={data.business.id}
              business={data.business}
              demo={demo}
              session={session}
              busy={busy}
              notify={notify}
              onSave={(fields) =>
                mutate(async () => {
                  if (demo)
                    setData((s) => ({
                      ...s,
                      business: { ...s.business, ...fields },
                    }));
                  else
                    unwrap(
                      await supabase
                        .from("businesses")
                        .update(fields)
                        .eq("id", data.business.id),
                    );
                  notify("Business settings saved.");
                })
              }
              onReset={() => setModal({ type: "reset" })}
            />
          )}
        </main>
      </div>
      {toast && (
        <div
          className={"toast " + (toast.error ? "error" : "")}
          role={toast.error ? "alert" : "status"}
        >
          {toast.error ? <AlertCircle size={19} /> : <CheckCircle2 size={19} />}
          <span>{toast.text}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {modal?.type === "customer" && (
        <Modal
          error={toast?.error ? toast.text : null}
          title={modal.customer ? "Edit customer" : "A new connection"}
          onClose={() => !busy && setModal(null)}
        >
          <CustomerForm
            customer={modal.customer}
            busy={busy}
            onSubmit={saveCustomer}
            onCancel={() => setModal(null)}
          />
        </Modal>
      )}
      {modal?.type === "quote" && (
        <Modal
          error={toast?.error ? toast.text : null}
          wide
          title={modal.quote ? "Edit quotation" : "Add a sent quotation"}
          onClose={() => !busy && setModal(null)}
        >
          <QuoteForm
            quote={modal.quote}
            data={data}
            busy={busy}
            onSubmit={saveQuote}
            onCancel={() => setModal(null)}
            addCustomer={() => setModal({ type: "customer" })}
          />
        </Modal>
      )}
      {modal?.type === "preview" && (
        <Modal
          error={toast?.error ? toast.text : null}
          title="A thoughtful follow-up"
          onClose={() => setModal(null)}
        >
          <MessagePreview
            data={data}
            quote={modal.quote}
            reminder={modal.reminder}
            demo={demo}
          />
          <div className="modal-actions">
            <Button
              kind="secondary"
              onClick={() => {
                setSelected(modal.quote.id);
                setPage("quotations");
                setModal(null);
              }}
            >
              Open quotation
            </Button>
            <Button onClick={() => setModal(null)}>Done</Button>
          </div>
        </Modal>
      )}
      {["archive", "delete"].includes(modal?.type) && (
        <Modal
          error={toast?.error ? toast.text : null}
          title={
            modal.type === "archive"
              ? `Archive ${modal.quote.quote_number}?`
              : `Delete ${modal.quote.quote_number}?`
          }
          onClose={() => !busy && setModal(null)}
        >
          <p className="modal-copy">
            {modal.type === "archive"
              ? "Remaining follow-ups will be cancelled and the quotation moves to the Archived tab. You can restore it later, but cancelled follow-ups will not restart."
              : "This permanently removes the quotation and its scheduled follow-ups. This cannot be undone."}
          </p>
          <div className="modal-actions">
            <Button
              kind="secondary"
              disabled={busy}
              onClick={() => setModal(null)}
            >
              Cancel
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                modal.type === "archive"
                  ? archiveQuote(modal.quote, true)
                  : deleteQuote(modal.quote)
              }
            >
              {modal.type === "archive"
                ? "Archive quotation"
                : "Delete quotation"}
            </Button>
          </div>
        </Modal>
      )}
      {modal?.type === "reset" && (
        <Modal
          error={toast?.error ? toast.text : null}
          title="Reset the demo workspace?"
          onClose={() => setModal(null)}
        >
          <p className="modal-copy">
            This replaces your demo edits with the original fictional customers
            and quotations. Connected business data is unaffected.
          </p>
          <div className="modal-actions">
            <Button kind="secondary" onClick={() => setModal(null)}>
              Keep my edits
            </Button>
            <Button
              onClick={() => {
                setData(seedDemo());
                setModal(null);
                notify("Demo reset.");
              }}
            >
              Reset demo
            </Button>
          </div>
        </Modal>
      )}
      {["help", "connect"].includes(modal?.type) && (
        <Modal
          error={toast?.error ? toast.text : null}
          title={
            modal.type === "help"
              ? "Your first follow-up, made simple"
              : "Connect your business"
          }
          onClose={() => setModal(null)}
        >
          <div className="guide-content">
            {modal.type === "connect" ? (
              <>
                <p>
                  This preview uses fictional data. Real accounts, saved
                  quotations, and email delivery require your own Supabase and
                  email provider configuration.
                </p>
                <ol>
                  <li>
                    Create a Supabase project in Singapore and apply the
                    included SQL migration.
                  </li>
                  <li>
                    Set the public frontend environment values and start the
                    Express API.
                  </li>
                  <li>
                    Verify your sending domain, configure inbound email and the
                    signed webhook.
                  </li>
                  <li>
                    Test with your own email address, then enable the email
                    worker.
                  </li>
                </ol>
                <div className="callout">
                  Full instructions are in the project README. Keep the service
                  role and email keys on the server.
                </div>
                <a
                  className="btn secondary"
                  href="/quotefollow-source.zip"
                  download
                >
                  Download source &amp; setup guide
                </a>
                {supabase && (
                  <Button
                    onClick={() => {
                      setModal(null);
                      setDemo(false);
                      setData(null);
                    }}
                  >
                    Go to sign in
                  </Button>
                )}
              </>
            ) : (
              <>
                <div className="guide-steps">
                  {[
                    [
                      "1",
                      "Add your customer",
                      "Confirm they expect follow-ups, and record their email.",
                    ],
                    [
                      "2",
                      "Record a sent quotation",
                      "Add the scope, amount and the date you sent it. This app tracks the quote; it does not email the original quotation.",
                    ],
                    [
                      "3",
                      "Make the wording yours",
                      "Choose follow-up days and personal messages. Preview before enabling.",
                    ],
                    [
                      "4",
                      "Keep the loop closed",
                      "Record a reply or mark accepted/rejected to stop remaining reminders.",
                    ],
                  ].map(([n, title, text]) => (
                    <div key={n}>
                      <span>{n}</span>
                      <section>
                        <h3>{title}</h3>
                        <p>{text}</p>
                      </section>
                    </div>
                  ))}
                </div>
                <div className="callout">
                  <strong>Validate with 5 renovation business owners.</strong>
                  <p>
                    “How many quotations do you send per month, and how many do
                    you forget to follow up?” Record their answers before
                    investing in WhatsApp integration.
                  </p>
                </div>
              </>
            )}
          </div>
          <div className="modal-actions">
            <Button onClick={() => setModal(null)}>
              Got it <Check size={16} />
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
