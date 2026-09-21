import { config } from "../config.js";
import { sendTemplateEmail } from "./email.js";
import { renderEmailTemplate, getTemplateSender } from "./emailTemplates.js";

export async function sendGameApiEmail({ template, to, variables = {}, details = [], replyTo }) {
  if (!to) return null;
  const rendered = renderEmailTemplate(template, variables);
  return sendTemplateEmail({
    to,
    subject: rendered.subject,
    intro: rendered.intro,
    details,
    actionUrl: rendered.actionUrl,
    actionLabel: rendered.actionLabel,
    footer: rendered.footer,
    replyTo
  });
}

export async function sendAccountTemplateEmail(user, template, variables = {}, details = []) {
  try {
    if (!user?.email || !config.hostingerApiKey) return null;
    return await sendGameApiEmail({
      template,
      to: user.email,
      variables: {
        name: user.user_metadata?.full_name || user.email,
        email: user.email,
        ...variables
      },
      details
    });
  } catch (error) {
    console.error("ACCOUNT EMAIL ERROR:", error?.message || error);
    return null;
  }
}

export function getEmailRoute(template) {
  const security = new Set(["loginAlert", "emailVerification", "passwordReset", "mfaEnabled", "mfaRemoved", "apiKeyRevoked"]);
  const billing = new Set(["subscriptionActivated", "subscriptionCancelled", "subscriptionExpiring", "paymentReceived", "paymentFailed"]);
  const developers = new Set(["apiKeyCreated", "developerMessage"]);
  const support = new Set(["supportReceived"]);
  if (security.has(template)) return getTemplateSender("security");
  if (billing.has(template)) return getTemplateSender("billing");
  if (developers.has(template)) return getTemplateSender("developers");
  if (support.has(template)) return getTemplateSender("support");
  return getTemplateSender("info");
}

export async function sendLoginAlert(user, details = []) {
  return sendAccountTemplateEmail(user, "loginAlert", {}, details);
}
