---
type: workflow
name: scrape-urls
description: Scrape a list of URLs and return all results.
actions: [scrape]
inputs:
  urls:
    type: list
    description: "List of URLs to scrape"
outputs:
  results:
    type: list
    description: "List of scrape results, one per URL"
---

# Scrape URLs

## Usage

Run this workflow using the run_workflow tool

## Workflow

```python
# Scrape each URL and collect results
results = []
for url in urls:
    result = await workflow.execute_activity(
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
    results.append({"url": url, "data": result["results"]})

return {"results": results}
```
