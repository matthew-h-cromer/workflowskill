---
type: workflow
name: hiring-landscape
description: "Scrapes job titles and company names from a page and summarizes the hiring landscape in 2-3 sentences."
actions: [web.scrape, anthropic.llm]
inputs:
  url:
    type: str
    description: "URL of the hiring/jobs page to analyze"
outputs:
  summary:
    type: str
    description: "2-3 sentence summary of the hiring landscape"
---

# Hiring Landscape

## Usage

Run this workflow using the run_workflow tool

## Details

Scrapes a jobs or hiring page using two CSS selectors (`.job-title` and `.company-name`), then asks an Anthropic LLM to summarize the hiring landscape in 2–3 sentences.

**Prerequisites:**
- `WELDABLE_API_KEY` must be set in your environment.
- The Anthropic integration must be connected at weldable.ai.
- The target page must expose `.job-title` and `.company-name` CSS classes.

## Workflow

```python
# Scrape job titles and company names in parallel
titles_result, companies_result = await asyncio.gather(
    workflow.execute_activity(
        "web.scrape",
        {"url": url, "selector": ".job-title"},
    ),
    workflow.execute_activity(
        "web.scrape",
        {"url": url, "selector": ".company-name"},
    ),
)

# Build a structured prompt from the scraped data
titles = titles_result.get("text", "")
companies = companies_result.get("text", "")

# Summarize the hiring landscape with structured output
llm_result = await workflow.execute_activity(
    "anthropic.llm",
    {
        "prompt": f"You are a hiring analyst. Based on the following job titles and company names scraped from a jobs page, write a 2-3 sentence summary of the current hiring landscape — covering dominant roles, active industries, and any notable trends.\n\nJob Titles:\n{titles}\n\nCompany Names:\n{companies}",
        "schema": {
            "type": "object",
            "properties": {
                "summary": {
                    "type": "string",
                    "description": "2-3 sentence summary of the hiring landscape",
                }
            },
            "required": ["summary"],
        },
    },
    start_to_close_timeout=timedelta(seconds=60),
)

return {"summary": llm_result["summary"]}
```
