---
type: workflow
name: filter-links
description: Scrapes all anchor tags from a URL and returns only the links that start with a given prefix.
actions: [web.scrape]
inputs:
  url:
    type: str
    description: "The page URL to scrape for links"
  prefix:
    type: str
    default: "https"
    description: "Only return links that start with this prefix"
outputs:
  links:
    type: list
    description: "Filtered list of href values that start with the prefix"
---

# Filter Links

## Usage

Run this workflow using the run_workflow tool

## Details

Scrapes every anchor tag on the given page and returns only the `href` values
that begin with the specified prefix. Useful for extracting absolute links,
mailto addresses, or any other scheme-filtered subset of a page's links.

**Prerequisites:** A valid `WELDABLE_API_KEY` environment variable.

**Input guidance:**
- `url` — any publicly accessible web page
- `prefix` — defaults to `"https"`, but can be any string (e.g. `"http"`, `"mailto"`, `"/"`)

## Workflow

```python
# Scrape all anchor tags from the target page
scraped = await workflow.execute_activity(
    "web.scrape",
    {"url": url, "selector": "a"},
)

# Normalise the result into a flat list of elements
elements = scraped if isinstance(scraped, list) else scraped.get("results", [])

# Extract href values, checking both top-level key and attributes dict
hrefs = []
for el in elements:
    if isinstance(el, dict):
        href = el.get("href") or el.get("attributes", {}).get("href") or ""
    else:
        href = str(el)
    if href:
        hrefs.append(href)

# Keep only links that start with the requested prefix
links = [h for h in hrefs if h.startswith(prefix)]

return {"links": links}
```
