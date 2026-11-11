import express from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { Webhook } from "svix";
import { deliveryReady } from "./config.js";
export function createApp(db, config) {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.post(
    "/api/webhooks/email",
    express.raw({ type: "application/json", limit: "256kb" }),
    async (req, res) => {
      if (!config.webhookSecret)
        return res.status(503).json({ error: "Webhook not configured" });
      let event;
      try {
        event = new Webhook(config.webhookSecret).verify(
          req.body.toString("utf8"),
          {
            "svix-id": req.get("svix-id"),
            "svix-timestamp": req.get("svix-timestamp"),
            "svix-signature": req.get("svix-signature"),
          },
        );
      } catch {
        return res.status(400).json({ error: "Invalid signature" });
      }
      try {
        if (event.type === "email.received") {
          const recipients = Array.isArray(event.data?.to) ? event.data.to : [];
          const match = recipients
            .map((x) => String(x).match(/quote\+([0-9a-f-]{36})@([^>\s]+)/i))
            .find(
              (m) =>
                m && m[2].toLowerCase() === config.replyDomain?.toLowerCase(),
            );
          const from = String(event.data?.from || "");
          const sender = (from.match(/<([^>]+)>/)?.[1] || from).trim();
          if (match) {
            const { error } = await db.rpc("record_reply", {
              reply_address_token: match[1],
              sender_email: sender,
              webhook_event_id: req.get("svix-id"),
            });
            if (error) throw error;
          }
        }
        if (["email.bounced", "email.complained"].includes(event.type)) {
          const { error } = await db.rpc("stop_bounced_contact", {
            email_id: event.data.email_id,
            webhook_event_id: req.get("svix-id"),
          });
          if (error) throw error;
        }
        res.json({ received: true });
      } catch {
        res.status(503).json({ error: "Could not process event; retry later" });
      }
    },
  );
  app.use(
    cors({
      origin: config.origin,
      methods: ["GET", "POST"],
      allowedHeaders: ["Authorization", "Content-Type"],
    }),
  );
  app.use(express.json({ limit: "32kb" }));
  app.use(
    rateLimit({
      windowMs: 60000,
      limit: 120,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );
  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.use("/api", async (req, res, next) => {
    try {
      const token = req.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
      if (!token) return res.status(401).json({ error: "Sign in required" });
      const { data, error } = await db.auth.getUser(token);
      if (error || !data.user)
        return res.status(401).json({ error: "Session expired" });
      req.user = data.user;
      next();
    } catch {
      res.status(503).json({ error: "Authentication unavailable" });
    }
  });
  app.get("/api/readiness", (_req, res) =>
    res.json({
      emailReady: deliveryReady(config),
      timezone: "Asia/Kuala_Lumpur",
      schedule: "Hourly; business send window enforced",
      whatsappReady: false,
    }),
  );
  app.use((_req, res) => res.status(404).json({ error: "Not found" }));
  app.use((err, _req, res, _next) =>
    res
      .status(err.type === "entity.too.large" ? 413 : 400)
      .json({ error: "Invalid request" }),
  );
  return app;
}
