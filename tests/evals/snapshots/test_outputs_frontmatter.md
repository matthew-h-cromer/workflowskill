---
name: classify-text
description: Classifies the sentiment of input text as positive, negative, or neutral.
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
    description: "Confidence level of the classification: high, medium, or low"
---

# Classify Text

Analyzes the sentiment of the provided text using an LLM and returns a
classification of positive, negative, or neutral along with a confidence level.

```python
result = await workflow.execute_activity(
    "llm",
    {
        "prompt": f"Classify the sentiment of the following text:\n\n{text}",
        "system": (
            "You are a sentiment analysis assistant. "
            "Classify the sentiment of the given text as exactly one of: "
            "positive, negative, or neutral. "
            "Also rate your confidence as exactly one of: high, medium, or low."
        ),
        "schema": {
            "type": "object",
            "properties": {
                "sentiment": {
                    "type": "string",
                    "enum": ["positive", "negative", "neutral"],
                    "description": "The sentiment classification of the text",
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

return {
    "sentiment": result["sentiment"],
    "confidence": result["confidence"],
}
```