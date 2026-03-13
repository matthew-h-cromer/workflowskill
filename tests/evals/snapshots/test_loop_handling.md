---
name: scrape-urls
description: Scrapes a list of URLs and returns the combined results.
inputs:
  urls:
    type: list
    default: []
outputs:
  results:
    type: list
    description: "List of scrape results, one entry per URL."
---

# Scrape URLs

Loops over each URL in the input list, calls `scrape` on it, and returns all results.

```python
results = []
for url in urls:
    result = await workflow.execute_activity(
        "scrape",
        {
            "url": url,
            "selectors": {
                "title": "title",
                "headings": "h1",
                "text": "p",
                "links": {"css": "a", "extract": "href"},
            },
        },
    )
    results.append({"url": url, "status": result["status"], "data": result["results"]})
return {"results": results}
```