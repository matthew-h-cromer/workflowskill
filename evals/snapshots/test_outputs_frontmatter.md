---
type: workflow
name: classify-text
description: Classifies the sentiment of input text as positive, negative, or neutral.
actions: [llm]
inputs:
  text:
    type: str
    description: "The text to classify"
outputs:
  sentiment:
    type: str
    description: "Sentiment label: positive, negative, or neutral"
  confidence:
    type: str
    description: "Confidence level of the classification: high, medium, or low"
---

# Classify Text

## Usage

Run this workflow using the run_workflow tool

## Details

Classifies the sentiment of any input text using an LLM. Returns a sentiment
label (positive, negative, or neutral) and a confidence level (high, medium,
or low). Requires the `ANTHROPIC_API_KEY` environment variable to be set.

## Workflow

```python
# Classify sentiment using the LLM
result = await workflow.execute_activity(
    "llm",
    {
        "prompt": f"Classify the sentiment of the following text:\n\n{text}",
        "system": "You are a sentiment analysis assistant. Classify text sentiment accurately and concisely.",
        "schema": {
            "type": "object",
            "properties": {
                "sentiment": {
                    "type": "string",
                    "enum": ["positive", "negative", "neutral"],
                    "description": "The sentiment of the text",
                },
                "confidence": {
                    "type": "string",
                    "enum": ["high", "medium", "low"],
                    "description": "Confidence level of the classification",
                },
            },
            "required": ["sentiment", "confidence"],
        },
    },
    start_to_close_timeout=timedelta(seconds=60),
)

return {"sentiment": result["sentiment"], "confidence": result["confidence"]}
```
