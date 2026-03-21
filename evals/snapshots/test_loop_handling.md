---
type: workflow
name: scrape-urls
description: Scrapes a list of URLs and returns the content from each one.
inputs:
  urls:
    type: list
    default: []
outputs:
  results:
    type: list
    description: "A list of scraped content, one entry per URL"
---

# Scrape URLs

## Usage

Run this workflow using the run_workflow tool

## Workflow

```python
# Scrape each URL in sequence
results = []
for url in urls:
    page = await workflow.execute_activity(
        "scrape",
        {"url": url},
    )
    results.append(page)

return {"results": results}
```
