---
name: scrape-urls
description: Scrapes a list of URLs and returns the content from each one.
inputs:
  urls:
    type: list
    default: []
outputs:
  results:
    type: list
    description: "A list of scraped content for each URL"
---

# Scrape URLs

Loops over each URL in the provided list, scrapes its content, and returns all results together.

```python
results = []

# Scrape each URL
for url in urls:
    result = await workflow.execute_activity(
        "scrape",
        {"url": url},
    )
    results.append(result)

return {"results": results}
```
