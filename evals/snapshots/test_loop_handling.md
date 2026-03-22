---
type: workflow
name: scrape-urls
description: Scrapes a list of URLs and returns all results.
inputs:
  urls:
    type: list
outputs:
  results:
    type: list
    description: "List of scrape results, one entry per URL"
---

# Scrape URLs

## Usage

Run this workflow using the run_workflow tool

## Workflow

```python
# Scrape each URL and collect results
results = []
for url in urls:
    page = await workflow.execute_activity(
        "scrape",
        {
            "url": url,
            "selectors": {
                "headings": "h1, h2, h3",
                "paragraphs": "p",
                "links": {"css": "a", "extract": "href"},
            },
        },
    )
    results.append({"url": url, "status": page["status"], "data": page["results"]})

return {"results": results}
```
