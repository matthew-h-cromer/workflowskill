---
name: count-headings
description: Scrapes a page and returns the count and text of all h2 headings.
inputs:
  url:
    type: str
    default: "https://example.com"
outputs:
  count:
    type: int
    description: "Number of h2 headings found on the page"
  headings:
    type: list
    description: "List of h2 heading texts"
---

# Count Headings

Fetches a URL and extracts all h2 headings using a CSS selector, returning
the heading texts and their count.

```python
page = await workflow.execute_activity(
    "scrape",
    {
        "url": url,
        "selectors": {"headings": "h2"},
    },
)

headings = page["results"].get("headings", [])

return {"count": len(headings), "headings": headings}
```