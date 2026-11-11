import test from "node:test";
import assert from "node:assert/strict";
import { processDue } from "../server/delivery.js";
import { createApp } from "../server/app.js";
import { Webhook } from "svix";
const config = {
  sendEnabled: true,
  emailKey: "test-key",
  from: "Nudge <sender@test.invalid>",
  replyDomain: "reply.test.invalid",
  webhookSecret: "whsec_" + Buffer.alloc(32, 1).toString("base64"),
  origin: "http://localhost:4173",
};
function fakeDb() {
  let claimed = false;
  const rpcCalls = [];
  return {
    rpcCalls,
    rpc: async (name, args) => {
      rpcCalls.push([name, args]);
      if (name === "claim_reminder") {
        if (claimed) return { data: [] };
        claimed = true;
        return {
          data: [
            {
              id: "r-1",
              claim_token: "token",
              quotation_id: "q-1",
              template: "Hi {{customer_name}}",
              business_id: "b-1",
            },
          ],
        };
      }
      if (name === "prepare_reminder") return { data: args.email_payload };
      return { data: null };
    },
    from: (table) => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data:
              table === "quotations"
                ? {
                    customer_id: "c-1",
                    business_id: "b-1",
                    quote_number: "Q-1",
                    project: "Kitchen",
                    reply_token: "token",
                    amount_cents: 1000,
                  }
                : table === "customers"
                  ? { name: "Alice", email: "alice@example.com" }
                  : { name: "Renovation", phone: "123" },
          }),
        }),
      }),
    }),
  };
}
test("Worker is inert without explicit provider enablement", async () => {
  let called = false;
  const result = await processDue(
    {},
    { ...config, sendEnabled: false },
    {
      request: async () => {
        called = true;
      },
    },
  );
  assert.equal(result.disabled, true);
  assert.equal(called, false);
});
test("Worker submits plain-text email with stable idempotency and quote-specific reply address", async () => {
  const db = fakeDb();
  let captured;
  await processDue(db, config, {
    request: async (url, options) => {
      captured = { url, options };
      return { ok: true, json: async () => ({ id: "email-123" }) };
    },
  });
  assert.equal(
    captured.options.headers["Idempotency-Key"],
    "nudge/reminder/r-1",
  );
  const payload = JSON.parse(captured.options.body);
  assert.equal(payload.reply_to, "quote+token@reply.test.invalid");
  assert.match(payload.text, /Hi Alice/);
  assert.equal(payload.html, undefined);
  assert.equal(db.rpcCalls.at(-2)[1].outcome, "sent");
});
test("Network uncertainty retries; permanent provider rejection fails without false sent record", async () => {
  for (const [response, outcome] of [
    [
      async () => {
        throw new Error("timeout");
      },
      "retry",
    ],
    [async () => ({ ok: false, status: 422 }), "failed"],
  ]) {
    const db = fakeDb();
    await processDue(db, config, { request: response });
    assert.equal(
      db.rpcCalls.find(([n]) => n === "finish_reminder")[1].outcome,
      outcome,
    );
  }
});
test("API authenticates readiness and verifies/deduplicates webhook event IDs", async () => {
  const events = [];
  const db = {
    auth: {
      getUser: async (token) => ({
        data: { user: token === "good" ? { id: "owner" } : null },
        error: null,
      }),
    },
    rpc: async (name, args) => {
      events.push([name, args]);
      return { data: null, error: null };
    },
  };
  const server = createApp(db, config).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(base + "/api/readiness")).status, 401);
    assert.equal(
      (
        await fetch(base + "/api/readiness", {
          headers: { Authorization: "Bearer wrong" },
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await fetch(base + "/api/readiness", {
          headers: { Authorization: "Bearer good" },
        })
      ).status,
      200,
    );
    const body = JSON.stringify({
      type: "email.received",
      data: {
        to: ["quote+11111111-1111-4111-8111-111111111111@reply.test.invalid"],
        from: "Alice <alice@example.com>",
      },
    });
    assert.equal(
      (
        await fetch(base + "/api/webhooks/email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        })
      ).status,
      400,
    );
    assert.equal(events.length, 0);
    const id = "msg_test_01",
      timestamp = new Date(),
      signature = new Webhook(config.webhookSecret).sign(id, timestamp, body);
    const response = await fetch(base + "/api/webhooks/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "svix-id": id,
        "svix-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
        "svix-signature": signature,
      },
      body,
    });
    assert.equal(response.status, 200);
    assert.equal(events[0][0], "record_reply");
    assert.equal(events[0][1].sender_email, "alice@example.com");
    assert.equal(events[0][1].webhook_event_id, id);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
