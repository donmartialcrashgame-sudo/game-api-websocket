import { Router } from "express";
import { requireUser } from "../middleware/auth.js";
import { sendGameApiEmail } from "../services/emailEvents.js";

export const mailRouter = Router();
mailRouter.use(requireUser);

const ROUTES = {
  support: "support@game-api.online",
  developers: "developers@game-api.online",
  billing: "billing@game-api.online",
  security: "security@game-api.online",
  info: "info@game-api.online",
  noReply: "no-reply@game-api.online"
};

function clean(value, max = 4000) {
  return String(value ?? "").trim().slice(0, max);
}

function recipientFor(type) {
  return ROUTES[type] || null;
}

mailRouter.post("/contact", async (req, res) => {
  try {
    const type = clean(req.body?.type, 30);
    const subject = clean(req.body?.subject, 200);
    const message = clean(req.body?.message, 8000);
    const requestedRecipient = recipientFor(type);

    if (!requestedRecipient) return res.status(400).json({ error: "Invalid mail routing type" });
    if (!subject || !message) return res.status(400).json({ error: "subject and message are required" });

    const sender = req.user.email || "Authenticated Game API user";

    const template = type === "support" ? "supportReceived" : type === "developers" ? "developerMessage" : "generalInformation";

    const result = await sendGameApiEmail({
      template,
      to: requestedRecipient,
      subject,
      details: [
        { label: "From", value: sender },
        { label: "User ID", value: req.user.id },
        { label: "Route", value: requestedRecipient },
        { label: "Message", value: message }
      ],
    });

    res.status(202).json({ success: true, routed_to: requestedRecipient, result });
  } catch (error) {
    console.error("MAIL CONTACT ERROR:", error?.message || error);
    res.status(error?.status || 500).json({
      error: error?.message || "Could not send email",
      code: error?.code || null
    });
  }
});
