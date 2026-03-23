---
type: workflow
name: extract-links
description: Extracts all anchor link text and href attributes from a given URL.
actions: [scrape]
inputs:
  url:
    type: str
    description: "The URL to extract links from"
outputs:
  links:
    type: list
    description: "List of objects with 'text' and 'href' for each anchor tag"
  count:
    type: int
    description: "Total number of links found"
---

# Extract Links

## Usage

Run this workflow using the run_workflow tool

## Workflow

```python
# Scrape both link text and href in one call
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
