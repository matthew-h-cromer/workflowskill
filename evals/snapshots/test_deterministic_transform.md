---
type: workflow
name: count-headings
description: Scrapes a page and returns all H2 headings and their count.
inputs:
  url:
    type: str
    default: "https://example.com"
outputs:
  count:
    type: int
    description: "Number of H2 headings found on the page"
  headings:
    type: list
    description: "List of H2 heading texts found on the page"
---

# Count Headings

## Usage

Run this workflow using the run_workflow tool

## Workflow

```python
# Scrape all H2 headings from the page
page = await workflow.execute_activity(
    "scrape",
    {"url": url, "selectors": {"headings": "h2"}},
)

headings = page["results"].get("headings", [])

return {"count": len(headings), "headings": headings}
```
