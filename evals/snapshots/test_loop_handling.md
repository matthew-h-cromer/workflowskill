---
type: workflow
name: scrape-urls
description: Scrapes a list of URLs and returns the raw results for each.
inputs:
  urls:
    type: list
    default: []
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
# Scrape each URL sequentially
results = []
for url in urls:
    result = await workflow.execute_activity(
        "scrape",
        {
            "url": url,
            "selectors": {
                "headings": "h1, h2, h3",
                "paragraphs": "p",
                "links": "a",
                "link_hrefs": {"css": "a", "extract": "href"},
            },
        },
    )
    results.append({"url": url, "status": result["status"], "data": result["results"]})

return {"results": results}
```
