// Tallies packages/e2e/allure-results/*-result.json (one file per test,
// written by the allure-playwright reporter - see playwright.config.ts) by
// status, and posts the summary to the n8n webhook behind
// N8N_ALLURE_WEBHOOK_URL. Reads the raw result files directly rather than
// the generated report's own summary widget, since that's an internal detail
// of the Allure report format this script shouldn't depend on.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const webhookUrl = process.env.N8N_ALLURE_WEBHOOK_URL;
if (!webhookUrl) {
  console.log("N8N_ALLURE_WEBHOOK_URL not set, skipping Allure summary notification");
  process.exit(0);
}

const resultsDir = "packages/e2e/allure-results";
let files;
try {
  files = (await readdir(resultsDir)).filter((f) => f.endsWith("-result.json"));
} catch (err) {
  console.log(`${resultsDir} not readable (${err.message}), skipping Allure summary notification`);
  process.exit(0);
}

const counts = { passed: 0, failed: 0, broken: 0, skipped: 0, unknown: 0 };
for (const file of files) {
  try {
    const result = JSON.parse(await readFile(path.join(resultsDir, file), "utf8"));
    const status = result.status in counts ? result.status : "unknown";
    counts[status] += 1;
  } catch {
    counts.unknown += 1;
  }
}

const payload = {
  repository: process.env.REPOSITORY,
  branch: process.env.BRANCH,
  run_url: process.env.RUN_URL,
  counts,
  total: files.length,
};

try {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  console.log(`Posted Allure summary to n8n: HTTP ${res.status}`);
} catch (err) {
  console.log(`Failed to reach n8n webhook (${err.message}), skipping`);
}
