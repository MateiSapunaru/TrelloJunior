// Summarizes the ZAP baseline scan's report_json.json (written to the
// workspace root by zaproxy/action-baseline - see the security job) into
// counts by risk level, and posts that to the n8n webhook behind
// N8N_ZAP_WEBHOOK_URL. Never fails the job: a missing report or webhook URL
// is a reason to skip, not a reason to fail a security scan step over a
// notification.
import { readFile } from "node:fs/promises";

const webhookUrl = process.env.N8N_ZAP_WEBHOOK_URL;
if (!webhookUrl) {
  console.log("N8N_ZAP_WEBHOOK_URL not set, skipping ZAP findings notification");
  process.exit(0);
}

let report;
try {
  report = JSON.parse(await readFile("report_json.json", "utf8"));
} catch (err) {
  console.log(`report_json.json not readable (${err.message}), skipping ZAP findings notification`);
  process.exit(0);
}

const alerts = report.site?.[0]?.alerts ?? [];
const counts = { high: 0, medium: 0, low: 0, informational: 0 };
for (const alert of alerts) {
  // riskdesc looks like "Medium (High)" - risk level, then confidence in
  // parentheses. Only the risk level matters for this summary.
  const level = alert.riskdesc?.split(" ")[0]?.toLowerCase();
  if (level && level in counts) counts[level] += 1;
}

const payload = {
  repository: process.env.REPOSITORY,
  branch: process.env.BRANCH,
  run_url: process.env.RUN_URL,
  counts,
  total: alerts.length,
};

try {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  console.log(`Posted ZAP findings summary to n8n: HTTP ${res.status}`);
} catch (err) {
  console.log(`Failed to reach n8n webhook (${err.message}), skipping`);
}
