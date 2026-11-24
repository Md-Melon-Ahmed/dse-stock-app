"""Flask backend for the DSE Stock web app.

Serves the single-page frontend and a small JSON API that proxies the
public dsebd.org endpoints (handling caching, normalization and CORS so
the browser never talks to the exchange directly).
"""

from flask import Flask, jsonify, render_template, request

import dse

app = Flask(__name__)


def _wrap(fn):
    """Consistent API envelope: {"data": ...} or {"data": null, "error": ...}."""
    try:
        return jsonify({"data": fn()})
    except Exception as e:  # noqa: BLE001
        app.logger.exception(e)
        return jsonify({"data": None, "error": str(e)}), 502


@app.after_request
def add_cors(resp):
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Cache-Control"] = "no-store"
    return resp


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/prices")
def api_prices():
    return _wrap(dse.get_prices)


@app.route("/api/snapshot")
def api_snapshot():
    return _wrap(dse.get_snapshot)


@app.route("/api/sectors")
def api_sectors():
    return _wrap(dse.get_sectors)


@app.route("/api/history/<code>")
def api_history(code):
    days = request.args.get("days", 180, type=int)
    return _wrap(lambda: dse.get_history(code, days))


@app.route("/api/news")
def api_news():
    limit = request.args.get("limit", 100, type=int)
    q = request.args.get("q", "").strip()
    code = request.args.get("code", "").strip()
    return _wrap(lambda: dse.get_news(limit=limit, q=q or None, code=code or None))


@app.route("/api/search")
def api_search():
    q = request.args.get("q", "").strip()
    return _wrap(lambda: dse.get_search(q))


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
