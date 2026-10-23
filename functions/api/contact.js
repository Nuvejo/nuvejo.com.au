// Contact form endpoint (Cloudflare Pages Function, POST /api/contact).
// Relays the enquiry to Marco via the Brevo API.
//
// Protections, in order:
//   1. Body size and JSON checks
//   2. Honeypot field "bot-field": if filled, answer 200 and send nothing
//   3. Rate limit per IP (in memory, best effort, see note below)
//   4. Optional Cloudflare Turnstile, only when env.TURNSTILE_SECRET is set
//   5. Server-side validation (required fields, email format, length limits)
//   6. HTML escaping of every user value before it goes into the email
// Brevo error details are logged with console.error and never sent to the browser.

const LIMITS = { name: 100, email: 254, business: 150, interest: 60, message: 5000 };
const MAX_BODY_BYTES = 20000;

// Rate limit: max RATE_MAX requests per RATE_WINDOW_MS per IP.
// Limits of this approach (be honest about them): the counter lives in the memory of a
// single Worker isolate. Cloudflare runs many isolates, restarts them at will and does not
// share memory between them or between locations, so this only slows down a bot hammering
// one location. It is not a hard guarantee. For a hard limit use Turnstile (below) and/or
// a Cloudflare WAF rate limiting rule in the dashboard.
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 5;
const RATE_MAP_CAP = 5000;
const hits = new Map();

function rateLimited(ip) {
  const now = Date.now();
  if (hits.size > RATE_MAP_CAP) {
    for (const [k, v] of hits) if (now - v.start > RATE_WINDOW_MS) hits.delete(k);
    if (hits.size > RATE_MAP_CAP) hits.clear();
  }
  const rec = hits.get(ip);
  if (!rec || now - rec.start > RATE_WINDOW_MS) {
    hits.set(ip, { start: now, count: 1 });
    return false;
  }
  rec.count += 1;
  return rec.count > RATE_MAX;
}

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Single-line values (name, business, interest): collapse whitespace and control characters
// so nothing can break the subject line or Reply-To.
function oneLine(value) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f\s]+/g, " ").trim();
}

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;

async function turnstileOk(token, ip, secret) {
  if (!token || typeof token !== "string" || token.length > 2048) return false;
  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: form,
    });
    const out = await res.json();
    return out && out.success === true;
  } catch (err) {
    console.error("Turnstile verification error:", err && err.message);
    return false;
  }
}

export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";

    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return json({ error: "Invalid request" }, 413);

    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      return json({ error: "Invalid request" }, 400);
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return json({ error: "Invalid request" }, 400);
    }

    // Honeypot: real visitors never see this field. Pretend success, send nothing.
    if (typeof data["bot-field"] === "string" ? data["bot-field"].trim() !== "" : data["bot-field"]) {
      return json({ success: true }, 200);
    }

    if (rateLimited(ip)) {
      return json({ error: "Too many requests. Please try again later." }, 429);
    }

    // Turnstile is only enforced when the secret is configured.
    if (env.TURNSTILE_SECRET) {
      const ok = await turnstileOk(data["cf-turnstile-response"], ip, env.TURNSTILE_SECRET);
      if (!ok) return json({ error: "Verification failed. Please try again." }, 400);
    }

    for (const key of ["name", "email", "message", "business", "interest"]) {
      if (data[key] != null && typeof data[key] !== "string") {
        return json({ error: "Invalid request" }, 400);
      }
    }

    const name = oneLine(data.name);
    const email = oneLine(data.email);
    const business = oneLine(data.business);
    const interest = oneLine(data.interest);
    const message = String(data.message || "").replace(/\r\n?/g, "\n").trim();

    if (!name || !email || !message) return json({ error: "Missing fields" }, 400);
    if (
      name.length > LIMITS.name ||
      email.length > LIMITS.email ||
      business.length > LIMITS.business ||
      interest.length > LIMITS.interest ||
      message.length > LIMITS.message
    ) {
      return json({ error: "Input too long" }, 400);
    }
    if (!EMAIL_RE.test(email)) return json({ error: "Invalid email" }, 400);

    const htmlContent = `
      <p><strong>Name:</strong> ${escapeHtml(name)}</p>
      ${business ? `<p><strong>Business:</strong> ${escapeHtml(business)}</p>` : ""}
      <p><strong>Email:</strong> ${escapeHtml(email)}</p>
      ${interest ? `<p><strong>Interested in:</strong> ${escapeHtml(interest)}</p>` : ""}
      <p><strong>Message:</strong><br>${escapeHtml(message).replace(/\n/g, "<br>")}</p>
    `;

    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": env.BREVO_API_KEY,
      },
      body: JSON.stringify({
        sender: { name: "Nuvejo Contact Form", email: "kontakt@nuvejo.com.au" },
        to: [{ email: "marco@nuvejo.com.au", name: "Marco" }],
        replyTo: { email: email, name: name },
        subject: `New enquiry from ${name}`,
        htmlContent: htmlContent,
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      console.error("Brevo send failed:", response.status, errText);
      return json({ error: "Send failed" }, 502);
    }

    return json({ success: true }, 200);
  } catch (err) {
    console.error("Contact function error:", err && err.message);
    return json({ error: "Server error" }, 500);
  }
}