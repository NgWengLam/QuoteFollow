// DOM component integration checks. These do not replace visual/browser QA.
import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = new URL("../", import.meta.url);
test("Demo UI: navigation, customer/quote creation, filters, reply cancellation, settings and login", async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', {
    url: "http://localhost/",
  });
  for (const key of [
    "window",
    "document",
    "HTMLElement",
    "HTMLInputElement",
    "HTMLTextAreaElement",
    "Event",
    "MouseEvent",
    "FormData",
    "sessionStorage",
  ])
    globalThis[key] = dom.window[key];
  Object.defineProperty(globalThis, "navigator", {
    value: dom.window.navigator,
    configurable: true,
  });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  dom.window.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  dom.window.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  await mkdir(new URL("artifacts/", root), { recursive: true });
  await build({
    entryPoints: [fileURLToPath(new URL("src/App.jsx", root))],
    outfile: fileURLToPath(new URL("artifacts/app-test.mjs", root)),
    bundle: true,
    platform: "node",
    format: "esm",
    jsx: "automatic",
    packages: "external",
    define: { "import.meta.env": "{}" },
    logLevel: "silent",
  });
  const { default: React, act } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { default: App } = await import("../artifacts/app-test.mjs");
  const app = createRoot(document.getElementById("root"));
  const click = async (el) => {
    assert.ok(el, "Clickable element exists");
    await act(async () => {
      el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
  };
  const button = (text) =>
    [...document.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === text,
    );
  const fill = async (selector, value) => {
    const el = document.querySelector(selector);
    assert.ok(el, selector);
    const proto =
      el.tagName === "TEXTAREA"
        ? dom.window.HTMLTextAreaElement.prototype
        : el.tagName === "SELECT"
          ? dom.window.HTMLSelectElement.prototype
          : dom.window.HTMLInputElement.prototype;
    await act(async () => {
      Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
      el.dispatchEvent(
        new Event(el.tagName === "SELECT" ? "change" : "input", {
          bubbles: true,
        }),
      );
    });
  };
  const submit = async () => {
    await act(async () => {
      document
        .querySelector("dialog form")
        .dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        );
    });
  };
  try {
    await act(async () => app.render(React.createElement(App)));
    assert.match(document.body.textContent, /Keep the conversation going/);
    assert.match(document.body.textContent, /Fictional data/);
    await click(button("Customers"));
    await click(button("Add customer"));
    await fill('[name="name"]', "Test Customer");
    await fill('[name="email"]', "test@example.com");
    await fill('[name="phone"]', "+60 12 345 6789");
    await submit();
    assert.match(document.body.textContent, /Test Customer/);
    assert.equal(document.querySelector("dialog"), null);
    await click(
      [...document.querySelectorAll("nav button")].find((b) =>
        b.textContent.startsWith("Quotations"),
      ),
    );
    await click(button("New quotation"));
    await fill('[name="project"]', "Test kitchen");
    await fill('[name="quote_number"]', "TEST-100");
    await fill('[aria-label="Item 1 description"]', "Cabinets");
    await fill('[aria-label="Item 1 unit price"]', "250.00");
    await submit();
    assert.match(document.body.textContent, /TEST-100/);
    assert.equal(document.querySelector("dialog"), null);
    await click(button("TEST-100"));
    assert.match(document.body.textContent, /RM\s*250\.00/);
    await click(button("Mark customer replied"));
    assert.match(document.body.textContent, /Reply recorded/);
    assert.match(document.body.textContent, /cancelled/);
    // TEST-100 has no sent emails: it can be deleted.
    await click(button("Delete"));
    await click(button("Delete quotation"));
    assert.doesNotMatch(document.body.textContent, /TEST-100/);
    // QT-2026-040 has sent follow-ups: no Delete, but Archive works.
    await click(button("QT-2026-040"));
    assert.ok(!button("Delete"), "No Delete when emails were sent");
    const wa = document.querySelector(
      'a[aria-label^="Send day"][href^="https://wa.me/"]',
    );
    assert.ok(wa, "WhatsApp button shows for a customer with a phone number");
    assert.match(
      wa.getAttribute("href"),
      /^https:\/\/wa\.me\/60120000001\?text=/,
    );
    await click(button("Archive"));
    await click(button("Archive quotation"));
    assert.match(document.body.textContent, /Quotation archived/);
    const demoState = JSON.parse(sessionStorage.getItem("nudge-demo-v1"));
    assert.ok(
      demoState.reminders
        .filter((r) => r.quotation_id === "q1")
        .every((r) => ["sent", "cancelled"].includes(r.status)),
    );
    await click(button("All quotations"));
    assert.doesNotMatch(
      document.querySelector("tbody").textContent,
      /QT-2026-040/,
    );
    await click(
      [...document.querySelectorAll(".tabs button")].find((b) =>
        b.textContent.startsWith("Archived"),
      ),
    );
    assert.match(document.querySelector("tbody").textContent, /QT-2026-040/);
    await click(button("Follow-up settings"));
    assert.match(document.body.textContent, /A rhythm that feels right/);
    await fill('[aria-label="Follow-up 1 day"]', "4");
    const remindersBefore = JSON.parse(
      sessionStorage.getItem("nudge-demo-v1"),
    ).reminders;
    const message = () =>
      document.querySelector('[aria-label="Follow-up 1 message"]').value;
    const originalMessage = message();
    await fill(".template-library select", "ms");
    assert.match(
      document.querySelector(".template-sample").textContent,
      /Salam Alex/,
    );
    assert.equal(
      message(),
      originalMessage,
      "Browsing a language preserves custom drafts",
    );
    await click(button("Use these templates"));
    await click(button("Keep my drafts"));
    assert.equal(message(), originalMessage);
    await click(button("Use these templates"));
    await click(button("Replace drafts"));
    assert.match(message(), /Salam \{\{customer_name\}\}/);
    await fill(".template-library select", "zh");
    await click(button("Use these templates"));
    await click(button("Replace drafts"));
    assert.match(message(), /您好/);
    await click(button("Add follow-up"));
    assert.match(
      document.querySelector('[aria-label="Follow-up 4 message"]').value,
      /您好/,
    );
    await click(document.querySelector('[aria-label="Remove follow-up 4"]'));
    await fill('[aria-label="Follow-up 1 message"]', message() + " 欢迎咨询。");
    await act(async () => {
      document
        .querySelector("main form")
        .dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        );
    });
    assert.match(document.body.textContent, /Schedule saved/);
    assert.equal(
      JSON.parse(sessionStorage.getItem("nudge-demo-v1")).rules[0].days_after,
      4,
    );
    const saved = JSON.parse(sessionStorage.getItem("nudge-demo-v1"));
    assert.match(saved.rules[0].template, /欢迎咨询。$/);
    assert.deepEqual(
      saved.reminders,
      remindersBefore,
      "Saving multilingual rules preserves existing schedules",
    );
    await click(button("Account settings"));
    await click(button("Check connection"));
    assert.match(document.body.textContent, /delivery is simulated/);
    await click(button("Follow-up settings"));
    assert.match(message(), /欢迎咨询。$/);
    await click(button("Getting started"));
    assert.match(
      document.querySelector("dialog").textContent,
      /Validate with 5/,
    );
    await click(button("Got it"));
    await click(document.querySelector('[aria-label="Leave demo"]'));
    assert.match(document.body.textContent, /Welcome back/);
    await click(button("Explore the demo"));
    assert.match(document.body.textContent, /Keep the conversation going/);
  } finally {
    await act(async () => app.unmount());
    dom.window.close();
  }
});
