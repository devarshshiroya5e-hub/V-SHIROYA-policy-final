import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const DATA_FILE = path.join(process.cwd(), "policies_db.json");
const AUDIT_FILE = path.join(process.cwd(), "security_audit.json");

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

function readJson<T>(file: string, fallback: T): T {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) { console.error(`Failed reading ${file}:`, e); }
  return fallback;
}

function writeJson(file: string, value: unknown) {
  try { fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8"); }
  catch (e) { console.error(`Failed writing ${file}:`, e); }
}

function policies() { return readJson<any[]>(DATA_FILE, []); }
function auditLogs() { return readJson<any[]>(AUDIT_FILE, []); }
function audit(action: string, details: string, req: express.Request) {
  const logs = auditLogs();
  logs.unshift({ id: `sec-${Date.now()}`, timestamp: new Date().toISOString(), action, actor: "V Shiroya Insurance Portal", details, ipAddress: req.ip });
  writeJson(AUDIT_FILE, logs.slice(0, 100));
}

function safeJson(text: string): any {
  if (!text) return null;
  const cleaned = text.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
  try { return JSON.parse(cleaned); } catch {}
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try { return JSON.parse(cleaned.slice(start, end + 1)); } catch {}
  }
  return null;
}

const schema = {
  ownerName: null, policyNumber: null, providerCompany: null, policyType: null,
  startDate: null, endDate: null, premiumAmount: null, premiumFrequency: null,
  sumAssured: null, insuredPerson: null, nominee: null, nomineeRelationship: null,
  phoneNumber: null, email: null, address: null, dateOfBirth: null,
  agentName: null, agentPhone: null, branchName: null, paymentMode: null,
  policyStatus: "ACTIVE", maturityDate: null, additionalDetails: [],
  missingFields: [], uncertainFields: [], confidence: 0, extractedText: "",
  fieldConfidenceMap: {}
};

async function callOpenRouter(prompt: string, fileData?: string, mimeType?: string) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY is not configured on Render");

  const clean = fileData?.includes("base64,") ? fileData.split("base64,")[1] : fileData;
  const content: any[] = [{ type: "text", text: prompt }];
  if (clean) {
    content.push({ type: "image_url", image_url: { url: `data:${mimeType || "application/pdf"};base64,${clean}` } });
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.APP_URL || "https://v-shiroya-policy.onrender.com",
      "X-Title": "V Shiroya Insurance Policy Analytics"
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL || "google/gemini-2.5-flash",
      temperature: 0.1,
      max_tokens: Number(process.env.OPENROUTER_MAX_TOKENS || 6000),
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You are an expert insurance policy OCR and audit assistant. Extract only information visible in the supplied document. Never invent values." },
        { role: "user", content }
      ]
    })
  });

  const raw = await response.text();
  if (!response.ok) throw new Error(`OpenRouter ${response.status}: ${raw.slice(0, 500)}`);
  const data = JSON.parse(raw);
  const text = data?.choices?.[0]?.message?.content;
  const result = safeJson(text);
  if (!result) throw new Error("OpenRouter returned invalid JSON");
  return result;
}

function postProcess(result: any) {
  const out = { ...schema, ...result };
  if (typeof out.premiumAmount === "string") out.premiumAmount = Number(out.premiumAmount.replace(/[^0-9.]/g, "")) || null;
  if (typeof out.sumAssured === "string") out.sumAssured = Number(out.sumAssured.replace(/[^0-9.]/g, "")) || null;
  if (out.endDate) {
    const days = Math.ceil((new Date(out.endDate).getTime() - Date.now()) / 86400000);
    out.policyStatus = days < 0 ? "EXPIRED" : days <= 30 ? "EXPIRING SOON" : "ACTIVE";
  }
  return out;
}

app.get("/api/health", (_req, res) => res.json({
  ok: true,
  service: "V Shiroya OpenRouter Backend",
  openRouterConfigured: Boolean(process.env.OPENROUTER_API_KEY),
  model: process.env.OPENROUTER_MODEL || "google/gemini-2.5-flash",
  timestamp: new Date().toISOString()
}));

app.get("/api/auth/me", (_req, res) => res.json({ user: {
  id: "acc-1", name: "VIJAY SHIROYA", email: "vijay.ca@policyai.com",
  firmName: "VIJAY SHIROYA & Co. Chartered Accountants", role: "Senior Accountant / Auditor"
} }));

app.post("/api/analyze-policy", async (req, res) => {
  const { fileData, fileName, mimeType, instruction } = req.body || {};
  if (!fileName) return res.status(400).json({ error: "Filename is required" });
  try {
    const prompt = `Analyze this insurance document (${fileName}) thoroughly. ${instruction || "Extract all policy information."}\n\nReturn ONLY JSON using this exact structure and use null/[] when information is not visible:\n${JSON.stringify(schema)}`;
    const result = postProcess(await callOpenRouter(prompt, fileData, mimeType));
    audit("POLICY_ANALYSIS", `Analyzed ${fileName}`, req);
    res.json({ success: true, extraction: result });
  } catch (e: any) {
    console.error("OpenRouter analysis failed:", e);
    res.status(500).json({ error: "AI analysis failed.", details: e?.message || "Unknown error", fileName });
  }
});

app.get("/api/policies", (req, res) => {
  let list = policies();
  const q = String(req.query.q || "").toLowerCase().trim();
  if (q) list = list.filter(p => [p.ownerName, p.policyNumber, p.phoneNumber, p.providerCompany, p.policyType].some(v => String(v || "").toLowerCase().includes(q)));
  if (req.query.status && req.query.status !== "ALL") list = list.filter(p => p.policyStatus === req.query.status);
  if (req.query.provider && req.query.provider !== "ALL") list = list.filter(p => p.providerCompany === req.query.provider);
  res.json({ success: true, count: list.length, policies: list });
});

app.post("/api/policies/check-duplicate", (req, res) => {
  const { policyNumber, ownerName, phoneNumber } = req.body || {};
  const found = policies().find(p =>
    (policyNumber && String(p.policyNumber || "").toLowerCase() === String(policyNumber).toLowerCase()) ||
    (ownerName && phoneNumber && String(p.ownerName || "").toLowerCase() === String(ownerName).toLowerCase() && p.phoneNumber === phoneNumber)
  );
  res.json({ isDuplicate: Boolean(found), existingPolicy: found || null });
});

app.post("/api/policies", (req, res) => {
  const list = policies();
  const item = { ...req.body, id: req.body?.id || `pol-${Date.now()}`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), userId: "acc-1" };
  list.unshift(item); writeJson(DATA_FILE, list); audit("POLICY_CREATED", `Saved ${item.policyNumber || item.id}`, req);
  res.json({ success: true, policy: item });
});

app.put("/api/policies/:id", (req, res) => {
  const list = policies(); const i = list.findIndex(p => p.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: "Policy record not found" });
  list[i] = { ...list[i], ...req.body, updatedAt: new Date().toISOString() }; writeJson(DATA_FILE, list);
  audit("POLICY_UPDATED", `Updated ${list[i].policyNumber || list[i].id}`, req); res.json({ success: true, policy: list[i] });
});

app.delete("/api/policies/:id", (req, res) => {
  const list = policies(); const existing = list.find(p => p.id === req.params.id);
  if (!existing) return res.status(404).json({ error: "Policy not found" });
  writeJson(DATA_FILE, list.filter(p => p.id !== req.params.id)); audit("POLICY_DELETED", `Deleted ${existing.policyNumber || existing.id}`, req);
  res.json({ success: true, message: "Policy deleted successfully" });
});

app.get("/api/stats", (_req, res) => {
  const list = policies();
  res.json({
    totalPolicies: list.length,
    activePolicies: list.filter(p => p.policyStatus === "ACTIVE").length,
    expiredPolicies: list.filter(p => p.policyStatus === "EXPIRED").length,
    expiringSoonPolicies: list.filter(p => p.policyStatus === "EXPIRING SOON").length,
    totalPremiumValue: list.reduce((s, p) => s + (Number(p.premiumAmount) || 0), 0),
    policiesAddedThisMonth: list.filter(p => String(p.createdAt || "").startsWith(new Date().toISOString().slice(0, 7))).length
  });
});

app.get("/api/security/audit", (_req, res) => res.json({ success: true, logs: auditLogs() }));

let notificationHistoryLogs: any[] = [];
app.post("/api/notifications/send-alert", (req, res) => {
  const list = policies(); const ids = Array.isArray(req.body?.policyIds) ? req.body.policyIds : [];
  const today = Date.now();
  const targets = list.filter(p => ids.length ? ids.includes(p.id) : p.endDate && ((new Date(p.endDate).getTime() - today) / 86400000) >= 0 && ((new Date(p.endDate).getTime() - today) / 86400000) <= 30);
  if (!targets.length) return res.status(400).json({ success: false, message: "No policies found for alert dispatch." });
  const alerts = targets.map(p => ({ id: `notif-${Date.now()}-${Math.random().toString(36).slice(2,7)}`, policyId: p.id, policyNumber: p.policyNumber, ownerName: p.ownerName, recipientEmail: p.email || "N/A", recipientPhone: p.phoneNumber || "N/A", channel: req.body?.channel || "EMAIL", status: "READY", sentAt: new Date().toISOString(), daysLeft: Math.ceil((new Date(p.endDate).getTime() - today) / 86400000) }));
  notificationHistoryLogs.unshift(...alerts); audit("30DAY_EXPIRY_ALERT_DISPATCH", `Prepared ${alerts.length} expiry alerts`, req);
  res.json({ success: true, countSent: alerts.length, alerts, message: `Prepared ${alerts.length} notification(s).` });
});
app.get("/api/notifications/history", (_req, res) => res.json({ success: true, count: notificationHistoryLogs.length, logs: notificationHistoryLogs }));

app.listen(PORT, "0.0.0.0", () => console.log(`V Shiroya OpenRouter backend listening on 0.0.0.0:${PORT}`));
