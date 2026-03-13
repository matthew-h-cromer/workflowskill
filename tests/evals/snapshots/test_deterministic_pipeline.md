---
name: filter-links
description: Scrapes all links from a page and returns only those starting with a given prefix.
inputs:
  url:
    type: str
  prefix:
    type: str
    default: "https"
outputs:
  links:
    type: list
    description: "Links found on the page that start with the given prefix"
---

# Filter Links

Fetches a page, extracts every anchor tag's href, and returns only the links
that begin with the specified prefix.

```python
# Scrape all anchor href attributes from the page
page = await workflow.execute_activity(
    "scrape",
    {
        "url": url,
        "selectors": {
            "links": {"selector": "a", "attribute": "href"},
        },
    },
)

# Filter to only links starting with the prefix
all_links = page["results"].get("links", [])
filtered = [link for link in all_links if link.startswith(prefix)]

return {"links": filtered}
```
