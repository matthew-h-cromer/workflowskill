---
type: workflow
name: classify-text
description: Classifies the sentiment of a text string as positive, negative, or neutral using Anthropic LLM.
actions: [anthropic.llm]
inputs:
  text:
    type: str
    description: "The text to classify"
outputs:
  sentiment:
    type: str
    description: "Classified sentiment: positive, negative, or neutral"
  confidence:
    type: str
    description: "Model's confidence in the classification: low, medium, or high"
---

# Classify Text

## Usage

Run this workflow using the run_workflow tool

## Details

Sends the provided text to Anthropic's LLM and returns a structured sentiment
classification. Requires a connected `anthropic` integration at weldable.ai.

**Outputs:**
- `sentiment` — one of `positive`, `negative`, or `neutral`
- `confidence` — one of `low`, `medium`, or `high`

## Workflow

```python
# Classify sentiment with structured output
result = await workflow.execute_activity(
    "anthropic.llm",
    {
        "prompt": f"Classify the sentiment of the following text.\nRespond with the sentiment (positive, negative, or neutral) and your confidence level (low, medium, or high).\n\nText: {text}",
        "schema": {
            "type": "object",
            "properties": {
                "sentiment": {
                    "type": "string",
                    "enum": ["positive", "negative", "neutral"],
                },
                "confidence": {
                    "type": "string",
                    "enum": ["low", "medium", "high"],
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
