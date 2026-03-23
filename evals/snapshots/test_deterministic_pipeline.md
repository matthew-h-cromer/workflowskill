---
type: workflow
name: filter-links
description: Scrape all anchor hrefs from a URL and return only those starting with a given prefix.
actions: [scrape]
inputs:
  url:
    type: str
    description: "The URL to scrape for links"
  prefix:
    type: str
    default: "https"
    description: "Only return links starting with this prefix"
outputs:
  links:
    type: list
    description: "Filtered list of href values starting with the prefix"
---

# Filter Links

## Usage

Run this workflow using the run_workflow tool

## Workflow

```python
# Scrape all href attributes from anchor tags
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
links = [href for href in all_hrefs if href.startswith(prefix)]

return {"links": links}
```
