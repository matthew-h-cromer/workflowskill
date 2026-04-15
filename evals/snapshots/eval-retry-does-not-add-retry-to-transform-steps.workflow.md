---
version: 1
name: fetch-and-filter-active-users
description: "Fetch all user records from a Google Sheet with automatic retry, then filter to only active users."
inputs:
  spreadsheet_id:
    type: string
    description: "The Google Sheets spreadsheet ID (from the sheet URL)."
  range:
    type: string
    default: "Sheet1"
    description: "A1-notation range or tab name to read, e.g. 'Users' or 'Sheet1!A1:Z1000'."
  status_column_index:
    type: number
    default: 2
    description: "Zero-based column index of the status field (0 = first column). Default 2 assumes columns: name, email, status."
outputs:
  active_users: "{{ steps.filter_active.output }}"
  active_count: "{{ $count(steps.filter_active.output) }}"
  total_scanned: "{{ $count(steps.all_data_rows.output) }}"
steps:
  - id: fetch_users
    description: Fetch all user records from the Google Sheet, retrying up to 3 times on failure
    type: action
    uses: google_sheets.read
    with:
      spreadsheetId: "{{ input.spreadsheet_id }}"
      range: "{{ input.range }}"
    retry:
      max_attempts: 3
      backoff: exponential

  - id: all_data_rows
    description: Extract data rows by skipping the header row
    type: transform
    expr: "$filter(steps.fetch_users.output.values, function($row, $i) { $i > 0 })"

  - id: filter_active
    description: Filter rows to only those whose status column equals 'active' (case-insensitive)
    type: transform
    expr: "$filter(steps.all_data_rows.output, function($row) { $lowercase($string($row[input.status_column_index])) = 'active' })"
---

Fetches every row from a specified Google Sheet tab with up to 3 automatic retries on failure (using exponential back-off). Once the raw data is retrieved, it strips the header row and then filters the remaining data rows to return only those where the designated status column contains the value `"active"` (case-insensitive).

**Inputs**
| Name | Default | Description |
|---|---|---|
| `spreadsheet_id` | *(required)* | The ID from the Google Sheets URL |
| `range` | `Sheet1` | Tab name or A1-notation range to read |
| `status_column_index` | `2` | Zero-based index of the status column (0 = col A, 1 = col B, 2 = col C …) |

**Outputs**
| Name | Description |
|---|---|
| `active_users` | Array of row arrays for active users only |
| `active_count` | Number of active users found |
| `total_scanned` | Total number of data rows scanned (excluding header) |

**Setup needed:** Connect your Google account via the Weldable Google Sheets integration before running.
