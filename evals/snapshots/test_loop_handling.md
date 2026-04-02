---
type: workflow
name: scrape-urls
description: Scrapes each URL in a list and returns all results.
actions: [web.scrape]
inputs:
  urls:
    type: list
    description: "List of URLs to scrape"
outputs:
  results:
    type: list
    description: "Scraped content for each URL, in input order"
---

# Scrape URLs

## Usage

Run this workflow using the run_workflow tool

## Workflow

```python
# Scrape each URL sequentially
results = []
for url in urls:
    result = await workflow.execute_activity(
        "web.scrape",
        {"url": url},
    )
    results.append(result)

return {"results": results}
```
