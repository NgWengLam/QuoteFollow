import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const A = "11111111-1111-4111-8111-111111111111",
  B = "22222222-2222-4222-8222-222222222222";
test("Database migration, tenant boundaries, trusted mutations and job recovery", async (t) => {
  const db = new PGlite();
  await db.exec(
    `create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth,public to authenticated,anon,service_role; grant execute on function auth.uid() to authenticated,anon,service_role; insert into auth.users values('${A}'),('${B}');`,
  );
  await db.exec(
    "create function public.test_now() returns timestamptz language sql stable as $$select coalesce(nullif(current_setting('nudge.test_time',true),''),'2026-10-21T02:00:00Z')::timestamptz$$;",
  );
  for (const file of ["001_initial.sql", "002_archive_delete.sql"]) {
    const sql = (
      await readFile(
        new URL("../supabase/migrations/" + file, import.meta.url),
        "utf8",
      )
    )
      .replace("create extension if not exists pgcrypto;", "")
      .replaceAll("now()", "public.test_now()");
    await db.exec(sql);
  }
  const as = async (uid) => {
    await db.exec(
      `reset role;set role authenticated;select set_config('request.jwt.claim.sub','${uid}',false)`,
    );
  };
  const service = async () => {
    await db.exec("reset role;set role service_role;");
  };
  const query = async (s, p = []) => (await db.query(s, p)).rows;
  let bidA, bidB, cA, cB, qid;
  await t.test(
    "Auth required; onboarding binds business to the signed-in owner",
    async () => {
      await db.exec("set role anon");
      await assert.rejects(
        query("select public.onboard_business('Bad')"),
        /permission denied/,
      );
      await as(A);
      bidA = (await query("select public.onboard_business('Business A') id"))[0]
        .id;
      await as(B);
      bidB = (await query("select public.onboard_business('Business B') id"))[0]
        .id;
      assert.notEqual(bidA, bidB);
    },
  );
  await t.test(
    "RLS and column privileges prevent cross-business reads and writes",
    async () => {
      await as(A);
      assert.equal((await query("select * from public.businesses")).length, 1);
      cA = (
        await query(
          "insert into public.customers(business_id,name,email,consent) values($1,$2,$3,true) returning id",
          [bidA, "Alice", "alice@example.com"],
        )
      )[0].id;
      await assert.rejects(
        query("insert into public.customers(business_id,name) values($1,$2)", [
          bidB,
          "Intruder",
        ]),
        /row-level security/,
      );
      await assert.rejects(
        query("update public.businesses set owner_id=$1 where id=$2", [
          B,
          bidA,
        ]),
        /permission denied/,
      );
      await as(B);
      assert.equal((await query("select * from public.customers")).length, 0);
      cB = (
        await query(
          "insert into public.customers(business_id,name,email,consent) values($1,$2,$3,true) returning id",
          [bidB, "Bob", "bob@example.com"],
        )
      )[0].id;
    },
  );
  const draft = () => ({
    customer_id: cA,
    quote_number: "Q-01",
    project: "Kitchen",
    sent_date: "2026-01-01",
    items: [{ description: "Cabinet", quantity: 2.5, unit_price_cents: 1255 }],
    followups_enabled: true,
  });
  await t.test(
    "Quote RPC calculates price and rejects cross-tenant customer references",
    async () => {
      await as(A);
      await query("select public.save_rules($1::jsonb)", [
        JSON.stringify([
          { days_after: 3, template: "Hi {{customer_name}}" },
          { days_after: 7, template: "Checking in" },
        ]),
      ]);
      await assert.rejects(
        query("select public.save_quote($1::jsonb)", [
          JSON.stringify({ ...draft(), customer_id: cB }),
        ]),
        /Customer not found/,
      );
      qid = (
        await query("select public.save_quote($1::jsonb) id", [
          JSON.stringify({ ...draft(), amount_cents: 1 }),
        ])
      )[0].id;
      assert.equal(
        Number(
          (
            await query(
              "select amount_cents from public.quotations where id=$1",
              [qid],
            )
          )[0].amount_cents,
        ),
        3138,
      );
      assert.equal((await query("select * from public.reminders")).length, 2);
      await as(B);
      assert.equal((await query("select * from public.quotations")).length, 0);
      assert.equal((await query("select * from public.reminders")).length, 0);
      await assert.rejects(
        query("select public.set_quote_status($1,'accepted')", [qid]),
        /Quotation not found/,
      );
    },
  );
  await t.test(
    "Users cannot forge delivery status, message logs or invoke worker RPCs",
    async () => {
      await as(A);
      await assert.rejects(
        query("update public.reminders set status='sent'"),
        /permission denied/,
      );
      await assert.rejects(
        query("select public.claim_reminder()"),
        /permission denied/,
      );
      await assert.rejects(
        query(
          "insert into public.message_logs(business_id,quotation_id,content) values($1,$2,'fake')",
          [bidA, qid],
        ),
        /permission denied/,
      );
    },
  );
  // Exercise leasing without relying on the wall clock / send window.
  let rid, token;
  await t.test(
    "Unknown deliveries age into needs_review instead of resending beyond 23h",
    async () => {
      await service();
      await query(
        "update public.reminders set first_attempt_at=public.test_now()-interval '24 hours' where quotation_id=$1",
        [qid],
      );
      await query("select public.claim_reminder()");
      assert.ok(
        (await query("select status from public.reminders")).every(
          (r) => r.status === "needs_review",
        ),
      );
      await query(
        "update public.reminders set status='pending',first_attempt_at=null where quotation_id=$1",
        [qid],
      );
    },
  );
  await t.test(
    "Claims respect quiet hours, tenant pause, and one follow-up per quote",
    async () => {
      await service();
      assert.equal(
        (await query("select * from public.claim_reminder()")).length,
        0,
      );
      await query(
        "update public.businesses set automation_enabled=true where id=$1",
        [bidA],
      );
      await db.exec(
        "select set_config('nudge.test_time','2026-10-21T19:00:00Z',false)",
      );
      assert.equal(
        (await query("select * from public.claim_reminder()")).length,
        0,
      );
      await db.exec(
        "select set_config('nudge.test_time','2026-10-24T02:00:00Z',false)",
      );
      assert.equal(
        (await query("select * from public.claim_reminder()")).length,
        0,
      );
      await db.exec(
        "select set_config('nudge.test_time','2026-10-21T02:00:00Z',false)",
      );
      const [claim] = await query("select * from public.claim_reminder()");
      assert.ok(claim);
      assert.equal(claim.days_after, 3);
      assert.equal(
        (await query("select * from public.claim_reminder()")).length,
        0,
      );
      const payload = { text: "Frozen", subject: "Test" };
      const first = (
        await query("select public.prepare_reminder($1,$2,$3) payload", [
          claim.id,
          claim.claim_token,
          JSON.stringify(payload),
        ])
      )[0].payload;
      const second = (
        await query("select public.prepare_reminder($1,$2,$3) payload", [
          claim.id,
          claim.claim_token,
          JSON.stringify({ text: "Changed" }),
        ])
      )[0].payload;
      assert.deepEqual(first, payload);
      assert.deepEqual(second, payload);
      await query("select public.finish_reminder($1,$2,'retry',null)", [
        claim.id,
        claim.claim_token,
      ]);
      const [retry] = await query(
        "select * from public.reminders where id=$1",
        [claim.id],
      );
      assert.equal(retry.status, "pending");
      assert.ok(retry.first_attempt_at);
    },
  );
  await t.test(
    "Payload is immutable between retries and completed logs are idempotent",
    async () => {
      await service();
      const r = (
        await query(
          'update public.reminders set status=\'processing\',lease_until=public.test_now()+interval \'10 minutes\',claim_token=gen_random_uuid(),payload=\'{"text":"Original message","subject":"Test"}\'::jsonb,first_attempt_at=public.test_now() where quotation_id=$1 returning id,claim_token',
          [qid],
        )
      )[0];
      rid = r.id;
      token = r.claim_token;
      // Completion uses persisted payload and is safe to repeat after an acknowledged send.
      await query("select public.finish_reminder($1,$2,'sent','provider-01')", [
        rid,
        token,
      ]);
      await query("select public.finish_reminder($1,$2,'sent','provider-01')", [
        rid,
        token,
      ]);
      const logs = await query("select * from public.message_logs");
      assert.equal(logs.length, 1);
      assert.equal(logs[0].content, "Original message");
      await as(A);
      await assert.rejects(
        query("select public.save_quote($1::jsonb)", [
          JSON.stringify({ ...draft(), id: qid }),
        ]),
        /already started/,
      );
    },
  );
  await t.test(
    "Verified inbound event stops reminders; foreign sender cannot mark a reply",
    async () => {
      await service();
      const [{ reply_token }] = await query(
        "select reply_token from public.quotations where id=$1",
        [qid],
      );
      await query("select public.record_reply($1,$2,$3)", [
        reply_token,
        "outsider@example.com",
        "event-invalid",
      ]);
      assert.equal(
        (
          await query("select replied_at from public.quotations where id=$1", [
            qid,
          ])
        )[0].replied_at,
        null,
      );
      await query("select public.record_reply($1,$2,$3)", [
        reply_token,
        "alice@example.com",
        "event-1",
      ]);
      await query("select public.record_reply($1,$2,$3)", [
        reply_token,
        "alice@example.com",
        "event-1",
      ]);
      assert.ok(
        (
          await query("select replied_at from public.quotations where id=$1", [
            qid,
          ])
        )[0].replied_at,
      );
      assert.equal(
        (
          await query(
            "select * from public.reminders where quotation_id=$1 and status='processing'",
            [qid],
          )
        ).length,
        0,
      );
      assert.equal(
        (
          await query(
            "select * from public.message_logs where event_id='event-1'",
          )
        ).length,
        1,
      );
    },
  );
  await t.test(
    "Closing a quotation cancels pending reminders and cannot re-enable them by status alone",
    async () => {
      await as(A);
      await query("select public.set_quote_status($1,'accepted')", [qid]);
      await query("select public.set_quote_status($1,'pending')", [qid]);
      assert.equal(
        (
          await query(
            "select followups_enabled from public.quotations where id=$1",
            [qid],
          )
        )[0].followups_enabled,
        false,
      );
    },
  );
  await t.test(
    "Archive cancels pending reminders; delete only works with no email history",
    async () => {
      await as(A);
      const make = async (n) =>
        (
          await query("select public.save_quote($1::jsonb) id", [
            JSON.stringify({ ...draft(), quote_number: n }),
          ])
        )[0].id;
      const fresh = await make("Q-ARCH");
      await as(B);
      await assert.rejects(
        query("select public.archive_quote($1)", [fresh]),
        /Quotation not found/,
      );
      await assert.rejects(
        query("select public.delete_quote($1)", [fresh]),
        /Quotation not found/,
      );
      await as(A);
      await query("select public.archive_quote($1)", [fresh]);
      const rows = await query(
        "select status from public.reminders where quotation_id=$1",
        [fresh],
      );
      assert.ok(rows.length && rows.every((r) => r.status === "cancelled"));
      const [archived] = await query(
        "select archived_at,followups_enabled from public.quotations where id=$1",
        [fresh],
      );
      assert.ok(archived.archived_at);
      assert.equal(archived.followups_enabled, false);
      await assert.rejects(
        query("select public.save_quote($1::jsonb)", [
          JSON.stringify({ ...draft(), quote_number: "Q-ARCH", id: fresh }),
        ]),
        /Unarchive/,
      );
      await query("select public.archive_quote($1,false)", [fresh]);
      assert.equal(
        (
          await query("select archived_at from public.quotations where id=$1", [
            fresh,
          ])
        )[0].archived_at,
        null,
      );
      // qid has a sent email: delete is refused, archive works.
      await assert.rejects(
        query("select public.delete_quote($1)", [qid]),
        /email history/,
      );
      await query("select public.archive_quote($1)", [qid]);
      await query("select public.delete_quote($1)", [fresh]);
      assert.equal(
        (await query("select * from public.quotations where id=$1", [fresh]))
          .length,
        0,
      );
      assert.equal(
        (
          await query("select * from public.reminders where quotation_id=$1", [
            fresh,
          ])
        ).length,
        0,
      );
    },
  );
  await db.close();
});
