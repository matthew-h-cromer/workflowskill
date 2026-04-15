---
version: 1
name: wait-for-signal
description: Wait for a signal with a short timeout; continue on timeout
steps:
  - id: signal_result
    description: Wait for the test.ready signal, continuing if it times out
    type: wait_for_signal
    signal: "test.ready"
    timeout: "100ms"
    on_timeout: continue
outputs:
  timed_out: "{{ steps.signal_result.output = null }}"
---

Wait for an inbound signal and continue gracefully if the timeout expires.
