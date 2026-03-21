---
type: workflow
name: hiring-landscape
description: Scrapes job titles and company names from a page and summarizes the hiring landscape.
inputs:
  url:
    type: str
    default: ""
outputs:
  summary:
    type: str
    description: "A 2-3 sentence summary of the hiring landscape"
---

# Hiring Landscape

## Usage

Run this workflow using the run_workflow tool

## Workflow

```python
# Extract job titles and company names from the page
page = await workflow.execute_activity(
    "scrape",
    {
        "url": url,
        "selectors": {
            "job_titles": ".job-title",
            "company_names": ".company-name",
        },
    },
)

job_titles = page["results"].get("job_titles", [])
company_names = page["results"].get("company_names", [])

# Format extracted data for the LLM
titles_text = "\n".join(f"- {t}" for t in job_titles) or "No job titles found."
companies_text = "\n".join(f"- {c}" for c in company_names) or "No company names found."

# Summarize the hiring landscape
result = await workflow.execute_activity(
    "llm",
    {
        "prompt": f"""Summarize the hiring landscape based on the following data in 2-3 sentences.

Job Titles:
{titles_text}

Companies Hiring:
{companies_text}""",
        "schema": {
            "type": "object",
            "properties": {
                "summary": {"type": "string"},
            },
            "required": ["summary"],
        },
    },
    start_to_close_timeout=timedelta(seconds=60),
)

return {"summary": result["summary"]}
```
