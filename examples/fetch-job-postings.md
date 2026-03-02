---
name: linkedin-job-postings-scraper
description: Fetches job postings from the LinkedIn guest jobs search API and extracts structured data (title, company, location, URL, posted time) as an array.
version: 0.1.0
tags:
  - linkedin
  - jobs
  - scraping
---

# LinkedIn Job Postings Scraper

```workflow
inputs:
  keywords:
    type: string
    default: "software engineer"
  location:
    type: string
    default: "United States"
  start:
    type: int
    default: 0

outputs:
  jobs:
    type: array
    value: $steps.scrape_jobs.output.items

steps:
  - id: scrape_jobs
    type: tool
    tool: web.scrape
    retry:
      max: 3
      delay: "2s"
      backoff: 1.5
    inputs:
      url:
        type: string
        value: "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${inputs.keywords}&location=${inputs.location}&start=${inputs.start}"
      method:
        type: string
        value: "GET"
      headers:
        type: object
        value: {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36", "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", "Accept-Language": "en-US,en;q=0.5"}
      selector:
        type: string
        value: "li"
      fields:
        type: object
        value:
          title: "h3.base-search-card__title"
          company: "h4.base-search-card__subtitle"
          location: "span.job-search-card__location"
          url: "a.base-card__full-link @href"
          posted_time: "time"
      limit:
        type: int
        value: 25
    outputs:
      items:
        type: array
        value: $result.results

  - id: guard_empty
    type: exit
    condition: $steps.scrape_jobs.output.items.length == 0
    status: success
    output:
      jobs: []
    inputs: {}
    outputs: {}
```
