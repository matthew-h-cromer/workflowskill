---
version: 1
name: company-profile-enrichment
description: "Look up a company in Clearbit and LinkedIn simultaneously, then merge both profiles into a single enriched record."
inputs:
  company_name:
    type: string
    description: "The name of the company to look up"
outputs:
  profile: "{{ steps.merge.output }}"
steps:
  - id: lookup
    description: In parallel, fetch the company profile from Clearbit and LinkedIn
    type: parallel
    branches:
      clearbit:
        - id: clearbit_data
          description: Fetch company enrichment data from the Clearbit API
          type: action
          uses: web.api
          with:
            url: "{{ 'https://company.clearbit.com/v2/companies/find?name=' & $encodeUrlComponent(input.company_name) }}"
            method: GET
            headers:
              Authorization: "{{ 'Bearer ' & env.CLEARBIT_API_KEY }}"
      linkedin:
        - id: linkedin_data
          description: Fetch the company profile from the LinkedIn Companies API
          type: action
          uses: web.api
          with:
            url: "{{ 'https://api.linkedin.com/v2/organizations?q=vanityName&vanityName=' & $encodeUrlComponent(input.company_name) }}"
            method: GET
            headers:
              Authorization: "{{ 'Bearer ' & env.LINKEDIN_ACCESS_TOKEN }}"
              X-Restli-Protocol-Version: "2.0.0"

  - id: parse_responses
    description: Parse JSON response bodies from both API calls
    type: transform
    expr: |
      {
        "clearbit": $eval(steps.lookup.branches.clearbit.clearbit_data.output.body),
        "linkedin": $eval(steps.lookup.branches.linkedin.linkedin_data.output.body)
      }

  - id: merge
    description: Merge Clearbit and LinkedIn data into a single enriched company record
    type: transform
    expr: |
      {
        "name": steps.parse_responses.output.clearbit.name,
        "domain": steps.parse_responses.output.clearbit.domain,
        "description": steps.parse_responses.output.clearbit.description,
        "industry": steps.parse_responses.output.clearbit.category.industry,
        "employee_count": steps.parse_responses.output.clearbit.metrics.employees,
        "founded_year": steps.parse_responses.output.clearbit.foundedYear,
        "location": steps.parse_responses.output.clearbit.location,
        "logo_url": steps.parse_responses.output.clearbit.logo,
        "website": steps.parse_responses.output.clearbit.url,
        "linkedin": {
          "id": steps.parse_responses.output.linkedin.elements[0].id,
          "localized_name": steps.parse_responses.output.linkedin.elements[0].localizedName,
          "vanity_name": steps.parse_responses.output.linkedin.elements[0].vanityName,
          "website": steps.parse_responses.output.linkedin.elements[0].localizedWebsite,
          "follower_count": steps.parse_responses.output.linkedin.elements[0].followersCount
        },
        "sources": {
          "clearbit_status": steps.lookup.branches.clearbit.clearbit_data.output.status,
          "linkedin_status": steps.lookup.branches.linkedin.linkedin_data.output.status
        }
      }
---

Looks up a company by name in both the **Clearbit Company Enrichment API** and the **LinkedIn Companies API** at the same time using a `parallel` block, so neither lookup waits for the other. Once both responses arrive, a `transform` step merges them into a single enriched record covering firmographic details (industry, size, location, website) from Clearbit and LinkedIn profile data (vanity name, follower count, organization ID) from LinkedIn.

## Integrations used

| Integration | API endpoint |
|---|---|
| **Clearbit** | `https://company.clearbit.com/v2/companies/find` |
| **LinkedIn** | `https://api.linkedin.com/v2/organizations` |

## Required secrets

Set these in your environment before running:

| Secret | Description |
|---|---|
| `CLEARBIT_API_KEY` | Clearbit secret key (from clearbit.com dashboard) |
| `LINKEDIN_ACCESS_TOKEN` | LinkedIn OAuth 2.0 access token with `r_organization_social` scope |

## Inputs

| Name | Type | Description |
|---|---|---|
| `company_name` | string | The company name to search for (e.g. `"Stripe"`) |

## Output

A merged `profile` object with fields sourced from both databases:
- `name`, `domain`, `description`, `industry`, `employee_count`, `founded_year`, `location`, `logo_url`, `website` — from Clearbit
- `linkedin.id`, `linkedin.localized_name`, `linkedin.vanity_name`, `linkedin.website`, `linkedin.follower_count` — from LinkedIn
- `sources.clearbit_status` and `sources.linkedin_status` — HTTP status codes from each call, useful for diagnosing partial failures
