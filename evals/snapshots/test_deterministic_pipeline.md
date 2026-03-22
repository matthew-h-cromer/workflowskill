---
type: workflow
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
    description: "Filtered list of href values starting with the given prefix"
---

# Filter Links

## Usage

Run this workflow using the run_workflow tool

## Workflow

```python
# Extract href attributes from all anchor tags
page = await workflow.execute_activity(
    "scrape",
    {
        "url": url,
        "selectors": {
            "hrefs": {"css": "a", "extract": "href"},
        },
    },
)

# Filter to only links starting with the prefix
all_hrefs = page["results"].get("hrefs", [])
filtered = [href for href in all_hrefs if href.startswith(prefix)]

return {"links": filtered}
```
