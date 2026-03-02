---
name: classify-filter-sort
description: Fetches a list of items from an API, uses an LLM to classify each item by priority (high/medium/low), filters to keep only high-priority items, sorts by score descending, and returns the result
---

# Classify, Filter, and Sort Items by Priority

```workflow
inputs:
  api_url:
    type: string
    default: "https://api.example.com/items"

outputs:
  items:
    type: array
    value: $steps.sort_by_score.output.items

steps:
  - id: fetch_items
    type: tool
    tool: http.request
    description: Fetch the list of items from the API
    retry:
      max: 3
      delay: "1s"
      backoff: 1.5
    inputs:
      url:
        type: string
        value: $inputs.api_url
      method:
        type: string
        value: "GET"
    outputs:
      items:
        type: array
        value: $result.body

  - id: classify_items
    type: llm
    model: haiku
    description: Classify each item by priority (high/medium/low) and return the item with its classification
    each: $steps.fetch_items.output.items
    prompt: |
      You are a priority classifier. Classify the following item by priority level.

      Item:
      $steps.fetch_items.output.items

      The current item to classify is:
      - title: $item.title
      - score: $item.score
      - id: $item.id

      Respond with raw JSON only — no markdown fences, no commentary. Return an object with these fields:
      {
        "id": <the item id>,
        "title": <the item title>,
        "score": <the item score as a number>,
        "priority": "<high|medium|low>"
      }

      Priority guidelines:
      - high: score >= 70 or clearly urgent/important content
      - medium: score 30-69 or moderately important content
      - low: score < 30 or low-importance content
    inputs:
      item:
        type: object
        value: $item
    outputs:
      id:
        type: string
        value: $result.id
      title:
        type: string
        value: $result.title
      score:
        type: float
        value: $result.score
      priority:
        type: string
        value: $result.priority

  - id: filter_high_priority
    type: transform
    operation: filter
    description: Keep only high-priority items
    where: $item.priority == "high"
    inputs:
      items:
        type: array
        value: $steps.classify_items.output
    outputs:
      items:
        type: array

  - id: sort_by_score
    type: transform
    operation: sort
    description: Sort high-priority items by score descending
    field: score
    direction: desc
    inputs:
      items:
        type: array
        value: $steps.filter_high_priority.output.items
    outputs:
      items:
        type: array
```
