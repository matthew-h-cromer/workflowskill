---
type: workflow
name: extract-links
description: Extracts all anchor link text and href attributes from a given URL.
inputs:
  url:
    type: str
    default: "https://example.com"
outputs:
  links:
    type: list
    description: "List of objects with 'text' and 'href' for each anchor tag found"
  count:
    type: int
    description: "Total number of links extracted"
---

# Extract Links

## Usage

Run this workflow using the run_workflow tool

## Workflow

```python
# Scrape link text and href attributes in one pass
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

# Pair texts and hrefs, keeping only entries with an href
links = [
    {"text": text, "href": href}
    for text, href in zip(texts, hrefs)
    if href
]

return {"links": links, "count": len(links)}
```
