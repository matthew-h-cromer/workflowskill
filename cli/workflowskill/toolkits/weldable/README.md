# Weldable Toolkit

[Weldable](https://weldable.ai) is a cloud workflow platform that provides authenticated access to external services. The Weldable toolkit routes every `execute_activity()` call in your workflow to Weldable's REST API, which handles OAuth connections, token refresh, and execution.

## Setup

```sh
workflowskill login --toolkit weldable
```

This opens your browser to authorize your Weldable account. Your API key is saved automatically to `.env` in your project directory — no copy-paste needed.

## Running workflows

```sh
workflowskill run workflows/my-workflow.md --toolkit weldable
```

## Available integrations

Actions that work immediately (no OAuth setup needed):
- `web.fetch`, `web.scrape`, `web.api` — web scraping and HTTP
- `anthropic.llm` — call Claude (API key is platform-managed)

Integrations that require connecting your account at [weldable.ai/app/integrations](https://weldable.ai/app/integrations):
- Slack, Gmail, Google Sheets, Google Docs, Google Drive, Google Calendar
- GitHub, Discord, and more

See the [full integration catalog](https://weldable.ai) for all 264+ available actions.
