---
type: workflow
name: classify-text
description: Classifies the sentiment of input text as positive, negative, or neutral
inputs:
  text:
    type: str
    default: ""
outputs:
  sentiment:
    type: str
    description: "The sentiment classification: positive, negative, or neutral"
  confidence:
    type: str
    description: "The model's confidence in the classification: high, medium, or low"
---

# Classify Text

## Usage

Run this workflow using the run_workflow tool

## Workflow

```python
# Classify sentiment using LLM inference
result = await workflow.execute_activity(
    "llm",
    {
        "prompt": f"Classify the sentiment of the following text:\n\n{text}",
        "system": "You are a sentiment analysis assistant. Classify the sentiment of the given text as exactly one of: positive, negative, or neutral. Also rate your confidence as high, medium, or low.",
        "schema": {
            "type": "object",
            "properties": {
                "sentiment": {
                    "type": "string",
                    "enum": ["positive", "negative", "neutral"],
                    "description": "The sentiment classification",
                },
                "confidence": {
                    "type": "string",
                    "enum": ["high", "medium", "low"],
                    "description": "Confidence level in the classification",
                },
            },
            "required": ["sentiment", "confidence"],
        },
    },
    start_to_close_timeout=timedelta(seconds=60),
)

return {
    "sentiment": result["sentiment"],
    "confidence": result["confidence"],
}
```
