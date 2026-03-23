---
type: workflow
name: read-and-search
description: Lists files in a directory and reads the content of the first file found.
inputs:
  directory:
    type: str
outputs:
  content:
    type: str
    description: "The content of the first file in the directory"
---

# Read and Search

## Usage

Run this workflow using the run_workflow tool

## Workflow

```python
# List all files in the given directory
listing = await workflow.execute_activity(
    "list_directory",
    {"path": directory},
)

entries = listing["entries"]
if not entries:
    return {"content": ""}

# Read the first file from the listing
file_result = await workflow.execute_activity(
    "read_file",
    {"path": entries[0]},
)

return {"content": file_result["content"]}
```
