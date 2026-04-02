---
type: workflow
name: count-headings
description: Scrapes a URL and returns all h2 heading texts and their count.
actions: [web.scrape]
inputs:
  url:
    type: str
    description: "The URL of the page to scrape"
outputs:
  count:
    type: int
    description: "Number of h2 headings found"
  headings:
    type: list
    description: "List of h2 heading text strings"
---

# Count Headings

## Usage

Run this workflow using the run_workflow tool

## Workflow

```python
# Scrape all h2 elements from the target page
scraped = await workflow.execute_activity(
    "web.scrape",
    {"url": url, "selector": "h2"},
)

# Extract heading texts from the results list
headings = [item["text"] for item in scraped.get("results", []) if item.get("text", "").strip()]

return {"count": len(headings), "headings": headings}
```
