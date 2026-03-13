---
name: filter-links
description: Scrapes all anchor hrefs from a URL and returns only those starting with a given prefix.
inputs:
  url:
    type: str
  prefix:
    type: str
    default: "https"
outputs:
  links:
    type: list
    description: "Filtered list of hrefs that start with the given prefix"
---

# Filter Links

Fetches a page, extracts all anchor `href` attributes via CSS selector, then
filters the results in pure Python to return only links that start with the
specified prefix.

```python
page = await workflow.execute_activity(
    "scrape",
    {
        "url": url,
        "selectors": {
            "links": {"css": "a", "extract": "href"},
        },
    },
)

all_links = page["results"].get("links", [])
filtered = [link for link in all_links if link.startswith(prefix)]

return {"links": filtered}
```