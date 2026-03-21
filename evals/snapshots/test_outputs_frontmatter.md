---
type: workflow
name: classify-text
description: Classifies the sentiment of a text string as positive, negative, or neutral.
inputs:
  text:
    type: str
    default: ""
outputs:
  sentiment:
    type: str
    description: "The sentiment of the text: positive, negative, or neutral"
  confidence:
    type: str
    description: "The model's confidence in the classification: high, medium, or low"
---

# Classify Text

## Usage

Run this workflow using the run_workflow tool

## Workflow

```python
# Classify sentiment using structured LLM output
result = await workflow.execute_activity(
    "llm",
    {
        "prompt": f"Classify the sentiment of the following text as positive, negative, or neutral. Also rate your confidence as high, medium, or low.\n\nText: {text}",
        "schema": {
            "type": "object",
            "properties": {
                "sentiment": {
                    "type": "string",
                    "enum": ["positive", "negative", "neutral"],
                },
                "confidence": {
                    "type": "string",
                    "enum": ["high", "medium", "low"],
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
