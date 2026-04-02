# Weldable Toolkit

Every `execute_activity()` call is routed to Weldable's cloud, which handles catalog matching, OAuth, and execution. Action names use the format `{integration}.{action}` (e.g. `slack.post_message`, `web.fetch`).

**Authentication:**
- `WELDABLE_API_KEY` is required. Get one at https://weldable.ai/app/agent-setup.
- Integrations that require OAuth (Slack, Gmail, GitHub, Google Sheets, etc.) must be connected at weldable.ai before first use. If not connected, the workflow will fail with a connect URL.

---

## Discovering Actions

Probe the Weldable REST API directly during the Research phase. Read credentials from `.env` and use curl:

```bash
source .env
curl -s -X POST "${WELDABLE_API_URL:-https://weldable.ai}/api/mcp/act" \
  -H "Authorization: Bearer $WELDABLE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"intent": "post a message to a slack channel"}'
```

**Response statuses:**

- `matched` — Action matched but could not execute. Check two sub-cases:
  - `connected: false` — Integration not connected. `connect_url` contains the OAuth link to share with the user. Do not proceed with this action.
  - `connected: true` with `missing_inputs` non-empty — Required arguments are missing. `missing_inputs` lists them; `input_schema` has the full parameter spec. Use these exact parameter names in `execute_activity()`.
- `executed` — Action executed. Inspect the `result` field to learn the response shape.
- `not_found` — No matching action. `message` explains why. Try rephrasing the intent.
- `error` — Server-side failure. `message` explains the error.

**Key response fields:**

- `tool` — The action slug (e.g. `slack.post_message`). **This is the name to use in `execute_activity()`**, not the natural language intent you probed with.
- `input_schema` — Full parameter list with types and descriptions.
- `missing_inputs` — Subset of `input_schema` that was not supplied (only present on `incomplete`).
- `connected` / `connect_url` — Auth status and OAuth link (only present on `incomplete`).

**Always probe before writing.** Never guess parameter names — they must match exactly. A `matched` probe with `connected: true` is the authoritative source of the parameter schema for any action.
