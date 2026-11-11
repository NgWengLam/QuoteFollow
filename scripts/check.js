import { readFile, readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
async function walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = dir + "/" + e.name;
    if (e.isDirectory()) await walk(p);
    else if (p.endsWith(".js")) {
      const r = spawnSync(process.execPath, ["--check", p], {
        encoding: "utf8",
      });
      assert.equal(r.status, 0, r.stderr);
    }
    if (dir === "src" && e.isFile()) {
      const s = await readFile(p, "utf8");
      assert.ok(
        !/SUPABASE_SERVICE_ROLE_KEY|RESEND_API_KEY|WEBHOOK_SECRET/.test(s),
        `Server secrets in ${p}`,
      );
    }
  }
}
for (const d of ["src", "server", "shared", "scripts"]) await walk(d);
console.log("Syntax and client-secret boundary checks passed.");
