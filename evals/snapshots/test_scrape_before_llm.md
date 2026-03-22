---
type: workflow
name: hiring-landscape
description: Scrapes job titles and company names from a page and summarizes the hiring landscape using an LLM.
inputs:
  url:
    type: str
outputs:
  summary:
    type: str
    description: "A 2-3 sentence summary of the hiring landscape."
---

# Hiring Landscape

## Usage

Run this workflow using the run_workflow tool

## Workflow

```python
# Scrape job titles and company names from the page
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

# Format scraped data for the LLM
listings = "\n".join(
    f"- {title} at {company}"
    for title, company in zip(job_titles, company_names)
)

# Summarize the hiring landscape
result = await workflow.execute_activity(
    "llm",
    {
        "prompt": f"Based on the following job listings, summarize the hiring landscape in 2-3 sentences:\n\n{listings}",
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
