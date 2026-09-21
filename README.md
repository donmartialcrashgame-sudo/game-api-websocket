# Game API WebSocket Backend

Node.js API gateway and realtime WebSocket backend for Game API.

## Endpoints

- `GET /` service information
- `GET /health` health check
- `POST /api/keys` generate an API key
- `GET /api/keys` list keys with a valid authenticated Supabase session
- `GET /api/keys/:id/secret` recover a stored encrypted API key secret
- `POST /api/keys/:id/revoke` revoke a key
- `GET /api/payments/subscription` read the current subscription
- `POST /api/payments/demo/activate` activate a demo subscription
- `POST /api/payments/cancel` cancel a paid subscription
- `POST /api/mail/contact` send a routed account message
- `WS /realtime` WebSocket connection

## Hostinger mail configuration

Configure these as Render environment variables. Never commit their values to GitHub:

- `HOSTINGER_API_KEY` — Hostinger API token.
- `HOSTINGER_MAILBOX_RESOURCE_ID` — the managed Hostinger mailbox resource ID used for sending.
- `HOSTINGER_DISPLAY_NAME` — optional sender display name; defaults to `Game API`.

The Hostinger API token remains server-side and is never sent to browser clients.

## Routed mail aliases

The authenticated mail endpoint supports:

- `support` → `support@game-api.online`
- `developers` → `developers@game-api.online`
- `billing` → `billing@game-api.online`
- `security` → `security@game-api.online`
- `info` → `info@game-api.online`
- `noReply` → `no-reply@game-api.online`

Example request:

```http
POST /api/mail/contact
Authorization: Bearer SUPABASE_ACCESS_TOKEN
Content-Type: application/json

{
  "type": "billing",
  "subject": "Plan upgrade question",
  "message": "Please help with my upgrade."
}
```
