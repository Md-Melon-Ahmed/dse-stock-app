# DSE Stock

A web app for the Bangladesh share market, inspired by [stocknow.com.bd](https://stocknow.com.bd/). It shows live Dhaka Stock Exchange (DSE) data with a clean, mobile-friendly interface.

## Features

- **Home** — market indices (DSEX, DS30, DSES), turnover, advance/decline breadth, top gainers/losers and latest news.
- **Price Board** — searchable, sortable table of all listed instruments (LTP, change, OHLC, volume, value, trades, P/E, sector).
- **Charts** — candlestick chart (TradingView lightweight-charts) for any company with 1M–2Y ranges.
- **News** — market news & disclosures with search and type filter.
- **Sectors** — sector-wise performance (advance/decline, turnover, market cap).

## Data source

All data is fetched live from the public Dhaka Stock Exchange endpoints (`dsebd.org`), cached in-memory, and served through a small Flask API:

| Endpoint | Purpose |
| --- | --- |
| `/api/snapshot` | indices, totals, breadth, session |
| `/api/prices` | merged price board (price + fundamentals) |
| `/api/history/<code>?days=` | day-end OHLC history |
| `/api/news?q=&code=` | news & disclosures |
| `/api/sectors` | sector aggregation |
| `/api/search?q=` | company search |

## Run locally

```bash
pip install -r requirements.txt
python app.py
```

Then open http://localhost:5000

## Project structure

```
dse-stock-app/
├── app.py                 # Flask app + JSON API
├── dse.py                 # DSE data client (fetch + cache)
├── requirements.txt
├── templates/index.html   # single-page frontend
└── static/
    ├── css/style.css
    └── js/app.js
```

## Disclaimer

For informational purposes only — not investment advice. Data is sourced from the Dhaka Stock Exchange.
