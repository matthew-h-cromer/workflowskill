---
name: extract-links
description: Extracts all anchor tag link text and href attributes from a given URL.
inputs:
  url:
    type: str
    default: "https://example.com"
outputs:
  texts:
    type: list
    description: "Link text content from each anchor tag"
  hrefs:
    type: list
    description: "href attribute values from each anchor tag"
---

# Extract Links

Scrapes a URL and returns all anchor tag link texts and href attributes using CSS selectors.

```python
page = await workflow.execute_activity(
    "scrape",
    {
        "url": url,
        "selectors": {
            "texts": "a",
            "hrefs": {"css": "a", "extract": "href"},
        },
    },
)

texts = page["results"].get("texts", [])
hrefs = page["results"].get("hrefs", [])

return {"texts": texts, "hrefs": hrefs}
```