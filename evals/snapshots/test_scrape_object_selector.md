---
type: workflow
name: extract-links
description: Extracts all anchor tag link text and href attributes from a given URL.
actions: [web.scrape]
inputs:
  url:
    type: str
    description: "The URL of the page to extract links from"
outputs:
  links:
    type: list
    description: "List of objects with 'text' and 'href' keys for each anchor tag"
  count:
    type: int
    description: "Total number of links found"
---

# Extract Links

## Usage

Run this workflow using the run_workflow tool

## Details

Scrapes a webpage twice — once to collect anchor tag text, once to collect
`href` attribute values — then zips the two lists into a single result.
Pairs are matched by position, so the output preserves the order links appear
on the page. Entries where either the text or href is missing/empty are
included as-is; no filtering is applied.

## Workflow

```python
# Scrape visible text of every anchor tag
text_result = await workflow.execute_activity(
    "web.scrape",
    {"url": url, "selector": "a"},
)

# Scrape href attribute of every anchor tag
href_result = await workflow.execute_activity(
    "web.scrape",
    {"url": url, "selector": "a::attr(href)"},
)

texts = text_result.get("results", [])
hrefs = href_result.get("results", [])

# Zip both lists into link objects
links = [
    {"text": t, "href": h}
    for t, h in zip(texts, hrefs)
]

return {"links": links, "count": len(links)}
```
