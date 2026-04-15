---
version: 1
name: clearbit-contact-enrichment
description: "Enriches a contact from Clearbit and falls back to a minimal record built from the email address if enrichment fails or times out — always returns a contact."
inputs:
  email:
    type: string
    description: "Email address of the contact to enrich"
outputs:
  contact: "{{ steps.enrich_attempt.output }}"
steps:
  - id: enrich_attempt
    description: Enrich contact via Clearbit with fallback to a minimal record on failure
    type: try
    body:
      - id: clearbit_response
        description: Call the Clearbit Person Enrichment API
        type: action
        uses: web.api
        timeout: "10s"
        with:
          url: "{{ 'https://person.clearbit.com/v2/people/find?email=' & input.email }}"
          method: "GET"
          headers:
            Authorization: "{{ 'Bearer ' & env.CLEARBIT_API_KEY }}"
      - id: enriched_contact
        description: Parse the Clearbit JSON response into a structured contact record
        type: transform
        expr: |
          $merge([
            {
              "source": "clearbit",
              "email": input.email,
              "enriched": true
            },
            $exists(steps.clearbit_response.output.body) ?
              $eval(steps.clearbit_response.output.body).{
                "name":        name.fullName,
                "first_name":  name.givenName,
                "last_name":   name.familyName,
                "title":       employment.title,
                "company":     employment.name,
                "linkedin":    linkedin.handle,
                "twitter":     twitter.handle,
                "location":    location,
                "bio":         bio,
                "avatar":      avatar
              }
            : {}
          ])
    catch:
      - id: enriched_contact
        description: Build a minimal contact record from the email address on Clearbit failure
        type: transform
        expr: |
          {
            "source":     "fallback",
            "email":      input.email,
            "enriched":   false,
            "name":       null,
            "first_name": null,
            "last_name":  null,
            "title":      null,
            "company":    $substringAfter(input.email, "@"),
            "error":      error.message
          }
---

Attempts to enrich a contact record using the Clearbit Person Enrichment API.
If the API call fails for any reason (network error, timeout, bad credentials,
rate limit, etc.) the workflow falls back to a minimal contact record derived
purely from the input email address. Either way, a contact object is always
returned — callers never see a missing or null result.

**Integrations used:** Clearbit (via `web.api`).

**Setup:** Set the `CLEARBIT_API_KEY` environment variable to your Clearbit
secret key before running this workflow.
