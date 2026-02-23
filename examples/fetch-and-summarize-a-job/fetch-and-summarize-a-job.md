---
name: linkedin-first-job-with-description
description: Fetches the first LinkedIn job posting and uses an LLM to generate a short description of the role
version: 0.1.0
tags:
  - linkedin
  - jobs
  - scraping
---

# LinkedIn First Job With Description

```workflow
inputs:
  keywords:
    type: string
    default: "software engineer"
  location:
    type: string
    default: "United States"

outputs:
  description:
    type: string
    value: $steps.describe_job.output.description

steps:
  - id: fetch_html
    type: tool
    tool: http.request
    description: Fetch raw HTML job listings from LinkedIn guest jobs API
    retry:
      max: 3
      delay: "2s"
      backoff: 2.0
    inputs:
      url:
        type: string
        value: "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search"
      method:
        type: string
        value: "GET"
      headers:
        type: object
        value:
          User-Agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
          Accept-Language: "en-US,en;q=0.5"
    outputs:
      body:
        type: string
        value: $result.body

  - id: guard_empty
    type: exit
    description: Exit early if the request returned nothing
    condition: $steps.fetch_html.output.body == ""
    status: success
    output:
      description: ""

  - id: extract_jobs
    type: tool
    tool: html.select
    description: Extract structured job posting fields from the first <li> card
    inputs:
      html:
        type: string
        value: $steps.fetch_html.output.body
      selector:
        type: string
        value: "li"
      limit:
        type: int
        value: 1
      fields:
        type: object
        value:
          title: "h3.base-search-card__title"
          company: "h4.base-search-card__subtitle"
          location: "span.job-search-card__location"
          posted_at: "time"
          url: "a.base-card__full-link @href"
          company_url: "h4 a @href"
    outputs:
      items:
        type: array
        value: $result.results

  - id: guard_no_jobs
    type: exit
    description: Exit early if no job cards were found in the HTML
    condition: $steps.extract_jobs.output.items.length == 0
    status: success
    output:
      description: ""

  - id: describe_job
    type: llm
    model: haiku
    description: Generate a short 1-3 sentence description of the job posting
    prompt: |
      You are given a job posting. Write a short, natural-language description of the role in 1-3 sentences.
      Only output the description — no labels, no JSON, no preamble.

      Job Title: $steps.extract_jobs.output.items[0].title
      Company: $steps.extract_jobs.output.items[0].company
      Location: $steps.extract_jobs.output.items[0].location
      Posted: $steps.extract_jobs.output.items[0].posted_at
    inputs:
      job:
        type: object
        value: $steps.extract_jobs.output.items[0]
    outputs:
      description:
        type: string
        value: $result
```