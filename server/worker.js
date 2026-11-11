import cron from "node-cron";
import { loadConfig, adminClient, deliveryReady } from "./config.js";
import { processDue } from "./delivery.js";
const config = loadConfig(),
  db = adminClient(config);
let running = false;
async function tick() {
  if (running) return;
  running = true;
  try {
    const result = await processDue(db, config);
    console.info(JSON.stringify({ event: "scheduler_tick", ...result }));
  } catch {
    console.error(
      "Scheduler failed. Check database connectivity and migration; customer data omitted.",
    );
  } finally {
    running = false;
  }
}
console.info(
  deliveryReady(config)
    ? "Email worker enabled; tenant schedules still apply."
    : "Email worker disabled until all provider settings and EMAIL_SEND_ENABLED are configured.",
);
const job = cron.schedule("0 * * * *", tick, {
  timezone: "Asia/Kuala_Lumpur",
  noOverlap: true,
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    job.stop();
    process.exit(0);
  });
