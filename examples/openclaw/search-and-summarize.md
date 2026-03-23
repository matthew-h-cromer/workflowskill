---
type: workflow
name: search-and-summarize
description: Search the web for a topic and return a concise summary of the top results.
actions: [web_search, web_fetch, llm_task]
inputs:
  query:
    type: str
    default: "latest developments in AI agents"
  result_count:
    type: int
    default: 5
outputs:
  summary:
    type: str
    description: "A concise summary of the top search results"
  sources:
    type: list
    description: "URLs of the pages that were summarized"
---

# Search and Summarize

## Usage

Run this workflow using the run_workflow tool

## Workflow

```python
# Search the web for the topic
search = await workflow.execute_activity(
    "web_search",
    {"query": query, "count": result_count},
    start_to_close_timeout=timedelta(seconds=15),
)

results = search["results"]
if not results:
    return {"summary": "No results found.", "sources": []}

# Fetch content from top results (parallel)
fetch_tasks = [
    workflow.execute_activity(
        "web_fetch",
        {"url": r["url"], "maxChars": 3000},
        start_to_close_timeout=timedelta(seconds=30),
    )
    for r in results[:3]
]
pages = await asyncio.gather(*fetch_tasks, return_exceptions=True)

# Collect readable content, skipping failures
snippets = []
sources = []
for r, page in zip(results[:3], pages):
    if isinstance(page, Exception):
        continue
    snippets.append(f"Source: {r['title']}\n{page['content'][:1500]}")
    sources.append(r["url"])

if not snippets:
    return {"summary": "Could not fetch content from results.", "sources": []}

combined = "\n\n---\n\n".join(snippets)

# Summarize with LLM
result = await workflow.execute_activity(
    "llm_task",
    {
        "prompt": f"Summarize the key findings from these search results about: {query}",
        "input": combined,
        "schema": {
            "type": "object",
            "properties": {"summary": {"type": "string"}},
            "required": ["summary"],
        },
    },
    start_to_close_timeout=timedelta(seconds=60),
)

return {"summary": result["summary"], "sources": sources}
```
