---
name: extract-links
description: Extracts all anchor link text and href attributes from a given URL.
inputs:
  url:
    type: str
    default: "https://example.com"
outputs:
  links:
    type: list
    description: "List of objects with text and href for each anchor tag found"
  count:
    type: int
    description: "Total number of links found"
---

# Extract Links

Scrapes a page and returns all anchor tags, pairing each link's visible text with its href attribute.

```python
# Scrape anchor text and href attributes
page = await workflow.execute_activity(
    "scrape",
    {
        "url": url,
        "selectors": {
            "text": "a",
            "href": "a[href]@href",
        },
    },
)

texts = page["results"].get("text", [])
hrefs = page["results"].get("href", [])

# Pair each href with its corresponding link text
links = [
    {"text": texts[i] if i < len(texts) else "", "href": hrefs[i]}
    for i in range(len(hrefs))
]

return {"links": links, "count": len(links)}
```
