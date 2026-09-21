const DEFAULTS = {
  brand: "Game API",
  dashboardUrl: "https://game-api.online/dashboard.html",
  supportEmail: "support@game-api.online",
  developersEmail: "developers@game-api.online",
  billingEmail: "billing@game-api.online",
  securityEmail: "security@game-api.online",
  infoEmail: "info@game-api.online"
};

export const EMAIL_TEMPLATES = {
  welcome: {
    subject: "Welcome to Game API",
    from: "info",
    intro: "Welcome to Game API. Your developer account is ready to use.",
    actionLabel: "Open Game API",
    footer: "Game API · Welcome"
  },
  loginAlert: {
    subject: "New sign-in to your Game API account",
    from: "security",
    intro: "A successful sign-in to your Game API account was detected. If this was not you, secure your account immediately.",
    actionLabel: "Review account security",
    footer: "Game API · Sign-in security alert"
  },
  emailVerification: {
    subject: "Verify your Game API email address",
    from: "security",
    intro: "Please verify your email address to complete your Game API account setup.",
    actionLabel: "Verify email",
    footer: "Game API · Email verification"
  },
  passwordReset: {
    subject: "Reset your Game API password",
    from: "security",
    intro: "A password reset was requested for your Game API account. If you made this request, continue using the secure link below.",
    actionLabel: "Reset password",
    footer: "Game API · Password security"
  },
  mfaEnabled: {
    subject: "Multi-factor authentication enabled",
    from: "security",
    intro: "Multi-factor authentication has been enabled on your Game API account.",
    actionLabel: "Review security",
    footer: "Game API · Security alert"
  },
  mfaRemoved: {
    subject: "Multi-factor authentication removed",
    from: "security",
    intro: "Multi-factor authentication has been removed from your Game API account. If you did not make this change, review your account security immediately.",
    actionLabel: "Review security",
    footer: "Game API · Security alert"
  },
  apiKeyCreated: {
    subject: "New Game API key created",
    from: "developers",
    intro: "A new API key was created for your Game API account.",
    actionLabel: "Manage API keys",
    footer: "Game API · Developer notification"
  },
  apiKeyRevoked: {
    subject: "Game API key revoked",
    from: "security",
    intro: "An API key on your Game API account has been revoked.",
    actionLabel: "Manage API keys",
    footer: "Game API · Security notification"
  },
  subscriptionActivated: {
    subject: "Game API subscription activated",
    from: "billing",
    intro: "Your Game API subscription has been activated successfully.",
    actionLabel: "Open billing",
    footer: "Game API · Billing notification"
  },
  subscriptionCancelled: {
    subject: "Game API subscription cancelled",
    from: "billing",
    intro: "Your paid Game API subscription has been cancelled and your account has been moved to the Starter plan.",
    actionLabel: "Open billing",
    footer: "Game API · Billing notification"
  },
  subscriptionExpiring: {
    subject: "Your Game API subscription is expiring soon",
    from: "billing",
    intro: "Your current Game API subscription is approaching its expiry date.",
    actionLabel: "Manage plan",
    footer: "Game API · Billing reminder"
  },
  paymentReceived: {
    subject: "Game API payment received",
    from: "billing",
    intro: "We received your Game API payment.",
    actionLabel: "View account",
    footer: "Game API · Payment receipt"
  },
  paymentFailed: {
    subject: "Game API payment could not be completed",
    from: "billing",
    intro: "Your Game API payment could not be completed. Review the payment details and try again if needed.",
    actionLabel: "Review payment",
    footer: "Game API · Payment notification"
  },
  supportReceived: {
    subject: "Game API support request received",
    from: "support",
    intro: "Your support request has been received by the Game API support team.",
    actionLabel: "Open Game API",
    footer: "Game API · Support"
  },
  developerMessage: {
    subject: "Message from Game API",
    from: "developers",
    intro: "You have received a developer message from Game API.",
    actionLabel: "Open Game API",
    footer: "Game API · Developer communication"
  },
  broadcast: {
    subject: "Game API announcement",
    from: "info",
    intro: "Here is an important announcement from Game API.",
    actionLabel: "Open Game API",
    footer: "Game API · Announcement"
  },
  generalInformation: {
    subject: "Game API information",
    from: "info",
    intro: "Here is information from Game API.",
    actionLabel: "Open Game API",
    footer: "Game API · Information"
  }
};

function replaceVariables(value, variables) {
  return String(value ?? "").replace(/{{\\s*([a-zA-Z0-9_]+)\\s*}}/g, (_, key) => String(variables?.[key] ?? ""));
}

export function getEmailTemplate(name) {
  const template = EMAIL_TEMPLATES[name];
  if (!template) {
    const error = new Error("Unknown Game API email template: " + name);
    error.status = 400;
    error.code = "UNKNOWN_EMAIL_TEMPLATE";
    throw error;
  }
  return template;
}

export function renderEmailTemplate(name, variables = {}) {
  const template = getEmailTemplate(name);
  const merged = { ...DEFAULTS, ...variables };
  return {
    name,
    from: template.from,
    subject: replaceVariables(variables.subject || template.subject, merged),
    intro: replaceVariables(template.intro, merged),
    actionUrl: replaceVariables(variables.actionUrl || DEFAULTS.dashboardUrl, merged),
    actionLabel: replaceVariables(variables.actionLabel || template.actionLabel, merged),
    footer: replaceVariables(template.footer, merged)
  };
}

export function getTemplateSender(type) {
  const map = {
    support: DEFAULTS.supportEmail,
    developers: DEFAULTS.developersEmail,
    billing: DEFAULTS.billingEmail,
    security: DEFAULTS.securityEmail,
    noReply: "no-reply@game-api.online",
    info: DEFAULTS.infoEmail
  };
  return map[type] || DEFAULTS.infoEmail;
}

export function listEmailTemplates() {
  return Object.keys(EMAIL_TEMPLATES);
}
