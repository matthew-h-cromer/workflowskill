---
name: count-headings
description: Scrapes a page and returns all H2 headings and their count.
inputs:
  url:
    type: str
    default: "https://example.com"
outputs:
  count:
    type: int
    description: "The number of H2 headings found on the page"
  headings:
    type: list
    description: "The list of H2 heading texts found on the page"
---

# Count Headings

Fetches a page and extracts all H2 headings using a CSS selector, then returns the heading texts and a total count.

```python
# Scrape all H2 headings from the page
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
