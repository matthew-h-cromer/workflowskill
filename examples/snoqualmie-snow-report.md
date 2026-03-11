---
name: snoqualmie-snow-report
description: "Fetches live weather and snowpack data for Snoqualmie Pass and generates a concise 1-3 sentence snow report for snowboarders."
outputs:
  report:
    type: str
    description: "1-3 sentence snow report covering ride quality, overall conditions, and visibility/fog."
---

# Snoqualmie Snow Report

Fetches current conditions from NOAA/NWS (temperature, visibility, forecast) and the NWAC
mountain weather forecast (snowpack, precipitation, wind), then uses Claude to synthesize a
concise snow report for snowboarders. Flags fog and visibility issues specifically.

NWS page uses `web_scrape` with CSS selectors to extract only the relevant conditions fields —
temperature, visibility, and forecast text — rather than dumping the full page into the LLM
prompt. NWAC provides a JSON API without zone-level filtering params, so the full response is
forwarded (tradeoff acknowledged).

```python
# Fetch NWS current conditions via web_scrape (targeted extraction) and
# NWAC mountain weather JSON in parallel
nws, nwac = await asyncio.gather(
    workflow.execute_activity(
        "web_scrape",
        {
            "url": "https://forecast.weather.gov/MapClick.php?CityName=Snoqualmie+Pass&state=WA&site=SEW&textField1=47.4248&textField2=-121.4138",
            "selectors": {
                "temperature": "#current_conditions-summary p.myforecast-current",
                "visibility": "td[data-label='Visibility']",
                "wind": "td[data-label='Wind Speed']",
                "conditions": "#current_conditions-summary p.myforecast-current-lrg",
                "forecast": ".forecast-tombstone .short-desc",
            },
        },
    ),
    workflow.execute_activity(
        "web_fetch_raw",
        # NOTE: NWAC API has no zone-filter param — full response required.
        # The LLM prompt scopes it to the Snoqualmie Pass region explicitly.
        {"url": "https://nwac.us/api/v1/mountain-weather-forecast"},
    ),
)

# Extract first match for each NWS field (deterministic Python, no LLM)
r = nws["results"]
temperature = (r.get("temperature") or ["unknown"])[0]
visibility = (r.get("visibility") or ["unknown"])[0]
wind = (r.get("wind") or ["unknown"])[0]
conditions = (r.get("conditions") or ["unknown"])[0]
forecast_snippets = r.get("forecast") or []
forecast = ", ".join(forecast_snippets[:4]) if forecast_snippets else "no forecast available"

report = await workflow.execute_activity(
    "llm",
    {
        "system": (
            "You are an expert snow conditions reporter for Snoqualmie Pass, WA. "
            "Write a concise 1–3 sentence snow report for a snowboarder. Cover all three: "
            "(1) how the snow will feel to ride today (e.g. fresh powder, wind-affected slab, "
            "wet and heavy, icy, groomed hardpack), "
            "(2) whether it's worth going riding today, and "
            "(3) visibility — this rider frequently encounters fog at Snoqualmie, so explicitly "
            "mention whether visibility is good, limited, or poor. "
            "Base your report strictly on the data provided. Plain prose, no bullet points."
        ),
        "prompt": (
            f"NWS current conditions for Snoqualmie Pass:\n"
            f"  Temperature: {temperature}\n"
            f"  Visibility: {visibility}\n"
            f"  Wind: {wind}\n"
            f"  Conditions: {conditions}\n"
            f"  Forecast: {forecast}\n\n"
            f"NWAC mountain weather forecast JSON (find the Snoqualmie Pass region, "
            f"field region_name = 'Snoqualmie Pass'):\n\n{nwac['content']}"
        ),
        "schema": {
            "type": "object",
            "properties": {"report": {"type": "string"}},
            "required": ["report"],
        },
    },
    start_to_close_timeout=timedelta(seconds=60),
)

return {"report": report["report"]}
```
