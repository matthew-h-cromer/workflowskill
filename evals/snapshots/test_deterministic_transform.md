---
type: workflow
name: count-headings
description: Scrape a page and return all H2 headings with their count.
actions: [scrape]
inputs:
  url:
    type: str
    description: "URL of the page to extract H2 headings from"
outputs:
  count:
    type: int
    description: "Number of H2 headings found"
  headings:
    type: list
    description: "List of H2 heading texts"
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
