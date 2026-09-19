# Game API WebSocket

Dedicated backend for Game API real-time connections and API-key generation.

## Endpoints

- `GET /` service information
- `GET /health` health check
- `POST /api/keys` generate an API key
- `GET /api/keys` list keys with a valid bearer API key
- `POST /api/keys/:id/revoke` revoke a key
- `WS /realtime` WebSocket connection

The server stores only a SHA-256 hash of each generated secret in memory. The original secret is returned once from `POST /api/keys`.

For production, persist key metadata and hashes in the project's database and protect key-management routes with the site's authenticated user/session layer.
