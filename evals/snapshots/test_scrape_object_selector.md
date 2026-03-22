---
type: workflow
name: extract-links
description: Extracts all link text and href attributes from anchor tags on a given page.
inputs:
  url:
    type: str
outputs:
  links:
    type: list
    description: "List of objects with 'text' and 'href' keys for each anchor tag"
  count:
    type: int
    description: "Total number of links found"
---

# Extract Links

## Usage

Run this workflow using the run_workflow tool

## Workflow

```python
# Scrape link text and hrefs in a single call
page = await workflow.execute_activity(
    "scrape",
    {
        "url": url,
        "selectors": {
            "link_texts": "a",
            "link_hrefs": {"css": "a", "extract": "href"},
        },
    },
)

texts = page["results"].get("link_texts", [])
hrefs = page["results"].get("link_hrefs", [])

# Pair texts and hrefs, skip entries with no href
links = [
    {"text": t, "href": h}
    for t, h in zip(texts, hrefs)
    if h
]

return {"links": links, "count": len(links)}
```
