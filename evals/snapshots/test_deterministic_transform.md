---
type: workflow
name: count-headings
description: Scrape a page and return all h2 heading texts and their count.
inputs:
  url:
    type: str
outputs:
  count:
    type: int
    description: "Number of h2 headings found on the page"
  headings:
    type: list
    description: "List of h2 heading text strings"
---

# Count Headings

## Usage

Run this workflow using the run_workflow tool

## Workflow

```python
# Extract all h2 headings from the page
page = await workflow.execute_activity(
    "scrape",
    {"url": url, "selectors": {"headings": "h2"}},
)

headings = page["results"].get("headings", [])

return {"count": len(headings), "headings": headings}
```
