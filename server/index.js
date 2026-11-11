import { loadConfig, adminClient } from "./config.js";
import { createApp } from "./app.js";
const c = loadConfig();
createApp(adminClient(c), c).listen(c.port, () =>
  console.info(`QuoteFollow API listening on port ${c.port}`),
);
