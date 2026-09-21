import { config } from "../config.js";

const HOSTINGER_ME_URL = "https://api.hostinger.com/api/v1/me";

function requireMailConfig() {
  if (!config.hostingerApiKey) {
    const error = new Error("Hostinger mail service is not configured");
    error.status = 503;
    error.code = "HOSTINGER_MAIL_NOT_CONFIGURED";
    throw error;
  }
  if (!config.hostingerMailboxResourceId) {
    const error = new Error("Hostinger managed mailbox resource ID is not configured");
    error.status = 503;
    error.code = "HOSTINGER_MAILBOX_NOT_CONFIGURED";
    throw error;
  }
}

async function hostingerRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: "Bearer " + config.hostingerApiKey,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = { raw: text }; }

  if (!response.ok) {
    const error = new Error(
      payload?.message ||
      payload?.error ||
      payload?.details ||
      ("Hostinger API request failed with HTTP " + response.status)
    );
    error.status = response.status >= 400 && response.status < 500 ? 502 : 503;
    error.code = "HOSTINGER_API_ERROR";
    error.hostingerStatus = response.status;
    error.hostingerPayload = payload;
    throw error;
  }

  return payload;
}

export async function getHostingerMailboxes() {
  if (!config.hostingerApiKey) return null;
  return hostingerRequest(HOSTINGER_ME_URL);
}

export async function sendEmail({ to, subject, text, html, replyTo }) {
  requireMailConfig();

  const recipients = Array.isArray(to) ? to.filter(Boolean) : [to].filter(Boolean);
  if (!recipients.length) {
    const error = new Error("At least one email recipient is required");
    error.status = 400;
    error.code = "EMAIL_RECIPIENT_REQUIRED";
    throw error;
  }

  const body = {
    to: recipients,
    subject: String(subject || "Game API"),
    text: String(text || ""),
    ...(html ? { html: String(html) } : {}),
    ...(replyTo ? { replyTo: String(replyTo) } : {}),
    ...(config.hostingerDisplayName ? { displayName: config.hostingerDisplayName } : {})
  };

  return hostingerRequest(
    "https://api.hostinger.com/api/v1/mailboxes/" +
    encodeURIComponent(config.hostingerMailboxResourceId) +
    "/send",
    {
      method: "POST",
      body: JSON.stringify(body)
    }
  );
}

export async function sendTemplateEmail({
  to,
  subject,
  intro,
  details = [],
  actionUrl,
  actionLabel,
  footer = "Game API"
}) {
  const rows = details
    .filter(item => item && item.label)
    .map(item => "<tr><td style=\"padding:6px 12px 6px 0;color:#667085;font-weight:600\">" +
      escapeHtml(item.label) +
      "</td><td style=\"padding:6px 0\">" +
      escapeHtml(item.value ?? "") +
      "</td></tr>"
    ).join("");

  const action = actionUrl
    ? '<p style="margin:24px 0"><a href="' + escapeHtml(actionUrl) + '" style="display:inline-block;padding:11px 16px;border-radius:8px;background:#3569e8;color:#fff;text-decoration:none;font-weight:700">' +
      escapeHtml(actionLabel || "Open Game API") +
      "</a></p>"
    : "";

  const html = "<!doctype html><html><body style=\"margin:0;background:#f4f7fb;font-family:Arial,sans-serif;color:#172033\">" +
    "<div style=\"max-width:640px;margin:30px auto;padding:0 16px\">" +
    "<div style=\"background:#0b1523;color:#fff;padding:18px 20px;border-radius:12px 12px 0 0;font-weight:800;font-size:18px\">Game API</div>" +
    "<div style=\"background:#fff;padding:24px 22px;border-radius:0 0 12px 12px\">" +
    "<p style=\"margin:0 0 14px;font-size:16px;font-weight:700\">" + escapeHtml(subject) + "</p>" +
    "<p style=\"line-height:1.7;color:#526078\">" + escapeHtml(intro) + "</p>" +
    (rows ? "<table style=\"width:100%;border-collapse:collapse;margin-top:18px;font-size:14px\">" + rows + "</table>" : "") +
    action +
    "<p style=\"margin-top:26px;color:#98a2b3;font-size:12px\">" + escapeHtml(footer) + "</p>" +
    "</div></div></body></html>";

  const textLines = [
    subject,
    "",
    intro,
    ...details.filter(item => item && item.label).map(item => item.label + ": " + (item.value ?? "")),
    ...(actionUrl ? ["", (actionLabel || "Open Game API") + ": " + actionUrl] : []),
    "",
    footer
  ];

  return sendEmail({ to, subject, text: textLines.join("\n"), html });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}