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

  - id: classify_priority
    type: llm
    model: haiku
    description: Classify each item by priority (high/medium/low)
    each: $steps.fetch_items.output.items
    on_error: ignore
    prompt: |
      Classify the following item by priority level based on its score and content.

      Item:
      - title: $item.title
      - score: $item.score

      Priority guidelines:
      - high: score >= 70 or clearly urgent/important content
      - medium: score 30-69 or moderately important content
      - low: score < 30 or low-importance content

      Respond with exactly one word: high, medium, or low.
    inputs:
      item:
        type: object
        value: $item
    outputs:
      priority:
        type: string
        value: $result

  - id: combine_classified
    type: transform
    operation: map
    description: Zip priority classifications with source item data
    expression:
      title: $item.title
      score: $item.score
      priority: $steps.classify_priority.output[$index].priority
    inputs:
      items:
        type: array
        value: $steps.fetch_items.output.items
    outputs:
      items:
        type: array

  - id: filter_high_priority
    type: transform
    operation: filter
    description: Keep only high-priority items
    where: $item.priority == "high"
    inputs:
      items:
        type: array
        value: $steps.combine_classified.output.items
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
