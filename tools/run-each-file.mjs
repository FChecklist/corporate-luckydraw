// Runs every test file as its OWN process (bun test <file>), a few at a time, and prints one line per file and a total. Exit 1 when any file fails.
// Why: some tests are heavy; run all together in one process they compete for time and a slow one can time out (the audit saw that). Alone, each passes. CI job `each-file` uses this.
// Usage: node tools/run-each-file.mjs [--jobs 4] [--list] [folder ...]   (default folders: packages apps tools/control-worker)
import { spawn } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const args = process.argv.slice(2);
const jobsAt = args.indexOf("--jobs"); const jobs = jobsAt >= 0 ? Math.max(1, Number(args.splice(jobsAt, 2)[1]) || 4) : 4;
const listOnly = args.includes("--list"); const dirs = args.filter((a) => !a.startsWith("--")); if (!dirs.length) dirs.push("packages", "apps", "tools/control-worker");
const ROOT = new URL("..", import.meta.url).pathname;
const walk = (d) => readdirSync(d).flatMap((n) => { if (n === "node_modules" || n.startsWith(".")) return []; const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : /\.test\.(ts|js|mjs)$/.test(n) ? [p] : []; });
const files = dirs.flatMap((d) => walk(join(ROOT, d))).map((p) => relative(ROOT, p)).sort();
if (listOnly) { console.log(files.join("\n")); process.exit(0); }

const results = []; let next = 0;
const one = (f) => new Promise((done) => {
  const t0 = Date.now(), p = spawn("bun", ["test", f], { cwd: ROOT, env: process.env }); let out = "";
  p.stdout.on("data", (b) => (out += b)); p.stderr.on("data", (b) => (out += b));
  p.on("close", (code) => {
    const n = (re) => Number(out.match(re)?.[1] ?? 0);
    const r = { f, code, pass: n(/\n\s*(\d+) pass/), fail: n(/\n\s*(\d+) fail/), ms: Date.now() - t0, out };
    results.push(r); console.log(`${code === 0 ? "ok  " : "FAIL"} ${f}  (${r.pass} pass, ${r.fail} fail, ${(r.ms / 1000).toFixed(1)} s)`); done();
  });
});
const worker = async () => { while (next < files.length) await one(files[next++]); };
await Promise.all(Array.from({ length: jobs }, worker));
const bad = results.filter((r) => r.code !== 0);
for (const r of bad) console.log(`\n===== ${r.f} =====\n${r.out.slice(-6000)}`);
const sum = (k) => results.reduce((a, r) => a + r[k], 0);
console.log(`\n${files.length} files, ${sum("pass")} pass, ${sum("fail")} fail, ${bad.length} file(s) failed`);
process.exit(bad.length ? 1 : 0);
