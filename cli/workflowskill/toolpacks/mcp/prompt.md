# Available Actions

When authoring workflows with MCP tools, each tool is called by its native name via `workflow.execute_activity("tool_name", args_dict)`. MCP tool names are portable across platforms — the same name works wherever the server is connected.

**Timeouts:** The default timeout is 30 seconds. Only add `start_to_close_timeout=timedelta(seconds=N)` when you need a value other than 30s.

## `read_file`

Read the contents of a file at the given path.

| Input | Type | Required | Description |
|-------|------|----------|-------------|
| `path` | `str` | yes | Absolute path to the file to read |

Output: `content` (str)

Example:

```python
result = await workflow.execute_activity(
    "read_file",
    {"path": "/tmp/test.txt"},
)
text = result["content"]
```

## `write_file`

Write content to a file at the given path. Creates the file if it doesn't exist, overwrites if it does.

| Input | Type | Required | Description |
|-------|------|----------|-------------|
| `path` | `str` | yes | Absolute path to the file to write |
| `content` | `str` | yes | Content to write to the file |

Output: `success` (bool)

Example:

```python
result = await workflow.execute_activity(
    "write_file",
    {"path": "/tmp/output.txt", "content": "Hello, world!"},
)
```

## `list_directory`

List files and directories at the given path.

| Input | Type | Required | Description |
|-------|------|----------|-------------|
| `path` | `str` | yes | Absolute path to the directory to list |

Output: `entries` (list[str])

Example:

```python
result = await workflow.execute_activity(
    "list_directory",
    {"path": "/tmp"},
)
files = result["entries"]
```

## `search_files`

Search for files matching a pattern within a directory.

| Input | Type | Required | Description |
|-------|------|----------|-------------|
| `path` | `str` | yes | Directory to search in |
| `pattern` | `str` | yes | Search pattern (glob or regex) |

Output: `matches` (list[str])

Example:

```python
result = await workflow.execute_activity(
    "search_files",
    {"path": "/tmp", "pattern": "*.txt"},
)
matched_files = result["matches"]
```

## `get_file_info`

Get metadata about a file (size, modification time, etc.).

| Input | Type | Required | Description |
|-------|------|----------|-------------|
| `path` | `str` | yes | Absolute path to the file |

Output: `size` (int), `modified` (str), `is_directory` (bool)

Example:

```python
info = await workflow.execute_activity(
    "get_file_info",
    {"path": "/tmp/test.txt"},
)
file_size = info["size"]
```
