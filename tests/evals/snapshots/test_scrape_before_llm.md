---
name: hiring-landscape
description: Scrapes job titles and company names from a page and summarizes the hiring landscape.
inputs:
  url:
    type: str
    default: ""
outputs:
  summary:
    type: str
    description: "A 2-3 sentence summary of the hiring landscape on the page"
---

# Hiring Landscape

Extracts job titles and company names from a jobs page, then summarizes the overall hiring landscape in 2-3 sentences.

```python
# Scrape job titles and company names
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

titles_text = ", ".join(job_titles) if job_titles else "none found"
companies_text = ", ".join(company_names) if company_names else "none found"

# Summarize the hiring landscape
result = await workflow.execute_activity(
    "llm",
    {
        "prompt": f"""Summarize the hiring landscape based on the following data in 2-3 sentences.

Job Titles: {titles_text}

Companies Hiring: {companies_text}""",
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
