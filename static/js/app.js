/* DSE Stock — frontend application */
(function () {
  "use strict";

  const state = {
    prices: null,
    sectors: null,
    news: null,
    snapshot: null,
    boardSort: { key: "value", dir: -1 },
    chart: { code: null, days: 180 },
  };

  /* ---------------- API ---------------- */
  async function api(path) {
    const res = await fetch(path);
    const body = await res.json().catch(() => null);
    if (!res.ok || !body || body.data === null) {
      throw new Error(body && body.error ? body.error : `Request failed (${res.status})`);
    }
    return body.data;
  }

  /* ---------------- formatting ---------------- */
  const fmtNum = (v, d = 2) =>
    v == null ? "—" : Number(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

  const fmtPct = (v) => {
    if (v == null) return "—";
    const s = Number(v).toFixed(2);
    return (v > 0 ? "+" : "") + s + "%";
  };

  const signClass = (v) => (v == null ? "flat" : v > 0 ? "up" : v < 0 ? "down" : "flat");

  const fmtCompact = (v) => {
    if (v == null) return "—";
    if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(2) + "B";
    if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(2) + "M";
    if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1) + "K";
    return Number(v).toFixed(0);
  };

  const fmtCr = (v) => (v == null ? "—" : fmtNum(v / 1e7, 0));

  /* ---------------- routing ---------------- */
  function showView(name) {
    document.querySelectorAll(".view").forEach((el) => el.classList.add("hidden"));
    const view = document.getElementById("view-" + name);
    if (view) view.classList.remove("hidden");
    document.querySelectorAll(".nav a").forEach((a) => a.classList.toggle("active", a.dataset.view === name));
    if (name === "chart") window.dispatchEvent(new Event("resize"));
    window.scrollTo({ top: 0 });
  }

  document.addEventListener("click", (e) => {
    const trigger = e.target.closest("[data-view]");
    if (!trigger) return;
    e.preventDefault();
    showView(trigger.dataset.view);
  });

  /* ---------------- home ---------------- */
  function renderIndices(snapshot) {
    const m = snapshot.market || {};
    const grid = document.getElementById("indexGrid");
    const cards = (m.indices || []).map((ix) => {
      const cls = signClass(ix.change);
      return `<div class="card index-card">
        <div class="label">${ix.key}</div>
        <div class="value">${fmtNum(ix.value, 2)}</div>
        <div class="delta ${cls}">${fmtPct(ix.change)} (${fmtPct(ix.percent)})</div>
      </div>`;
    });
    const totals = m.totals || {};
    const breadth = m.breadth || {};
    const extras = `
      <div class="card index-card">
        <div class="label">Turnover</div>
        <div class="value">${fmtNum(totals.turnover, 0)}</div>
        <div class="delta muted">Tk million</div>
      </div>
      <div class="card index-card">
        <div class="label">Advance / Decline</div>
        <div class="value"><span class="up">${breadth.advanced ?? "—"}</span> / <span class="down">${breadth.declined ?? "—"}</span></div>
        <div class="delta muted">${breadth.unchanged ?? "—"} unchanged</div>
      </div>`;
    grid.innerHTML = cards.join("") + extras;
  }

  function renderMovers(prices) {
    const traded = prices.filter((p) => p.ltp != null && p.ltp > 0);
    const sorted = [...traded].sort((a, b) => (b.percent || 0) - (a.percent || 0));
    const gainers = sorted.slice(0, 8);
    const losers = sorted.slice(-8).reverse();
    document.getElementById("topGainers").innerHTML = moversHtml(gainers);
    document.getElementById("topLosers").innerHTML = moversHtml(losers);
  }

  function moversHtml(rows) {
    return rows.map((r) => `
      <div class="list-row">
        <span class="code">${esc(r.code)}</span>
        <span class="name">${esc(r.name)}</span>
        <span class="price">${fmtNum(r.ltp)}</span>
        <span class="pill ${signClass(r.percent)}">${fmtPct(r.percent)}</span>
      </div>`).join("");
  }

  function renderNewsPreview(news) {
    const el = document.getElementById("homeNews");
    if (!news.length) { el.innerHTML = '<div class="skeleton">No news available.</div>'; return; }
    el.innerHTML = news.slice(0, 6).map(newsItemHtml).join("");
  }

  /* ---------------- price board ---------------- */
  function boardFiltered() {
    let rows = state.prices || [];
    const q = (document.getElementById("boardSearch").value || "").trim().toLowerCase();
    const cat = document.getElementById("boardCategory").value;
    const asset = document.getElementById("boardAsset").value;
    if (q) rows = rows.filter((r) => (r.code || "").toLowerCase().includes(q) || (r.name || "").toLowerCase().includes(q));
    if (cat) rows = rows.filter((r) => r.category === cat);
    if (asset) rows = rows.filter((r) => (r.assetType || "").toLowerCase().includes(asset.toLowerCase()));
    const { key, dir } = state.boardSort;
    return rows.slice().sort((a, b) => {
      const av = a[key], bv = b[key];
      const an = typeof av === "number" ? av : (av == null ? -Infinity : av);
      const bn = typeof bv === "number" ? bv : (bv == null ? -Infinity : bv);
      if (an < bn) return -1 * dir;
      if (an > bn) return 1 * dir;
      return 0;
    });
  }

  function renderBoard() {
    const rows = boardFiltered();
    const body = document.getElementById("boardBody");
    const count = document.getElementById("boardCount");
    if (!rows.length) { body.innerHTML = '<tr><td colspan="13" class="skeleton">No matching rows.</td></tr>'; count.textContent = ""; return; }
    body.innerHTML = rows.map((r) => `
      <tr>
        <td class="code-cell">${esc(r.code)}</td>
        <td class="name-cell" title="${esc(r.name)}">${esc(r.name)}</td>
        <td class="num">${fmtNum(r.ltp)}</td>
        <td class="num ${signClass(r.percent)}">${fmtPct(r.percent)}</td>
        <td class="num">${fmtNum(r.open)}</td>
        <td class="num">${fmtNum(r.high)}</td>
        <td class="num">${fmtNum(r.low)}</td>
        <td class="num">${fmtNum(r.close)}</td>
        <td class="num">${fmtCompact(r.volume)}</td>
        <td class="num">${fmtNum(r.value, 0)}</td>
        <td class="num">${fmtNum(r.trades, 0)}</td>
        <td class="num">${fmtNum(r.pe, 2)}</td>
        <td class="muted">${esc(r.sector || "—")}</td>
      </tr>`).join("");
    count.textContent = `${rows.length} instruments`;
  }

  function bindBoardControls() {
    document.getElementById("boardSearch").addEventListener("input", renderBoard);
    document.getElementById("boardCategory").addEventListener("change", renderBoard);
    document.getElementById("boardAsset").addEventListener("change", renderBoard);
    document.querySelectorAll("#boardTable thead th[data-sort]").forEach((th) => {
      th.addEventListener("click", () => {
        const key = th.dataset.sort;
        if (state.boardSort.key === key) state.boardSort.dir *= -1;
        else state.boardSort = { key, dir: key === "code" || key === "name" || key === "sector" ? 1 : -1 };
        renderBoard();
      });
    });
  }

  /* ---------------- charts ---------------- */
  let chart = null;
  let candleSeries = null;

  function initChart() {
    if (chart) return;
    const el = document.getElementById("chartContainer");
    chart = LightweightCharts.createChart(el, {
      height: 460,
      layout: { background: { type: "solid", color: "#ffffff" }, textColor: "#6b7280", fontSize: 12 },
      grid: { vertLines: { color: "#eef0f4" }, horzLines: { color: "#eef0f4" } },
      timeScale: { borderColor: "#e6e8ee", timeVisible: false },
      rightPriceScale: { borderColor: "#e6e8ee" },
    });
    candleSeries = chart.addCandlestickSeries({
      upColor: "#16a34a", downColor: "#dc2626",
      wickUpColor: "#16a34a", wickDownColor: "#dc2626", borderVisible: false,
    });
  }

  function renderChart(data) {
    initChart();
    const candles = data.map((d) => ({
      time: d.date, open: d.open, high: d.high, low: d.low, close: d.close,
    }));
    candleSeries.setData(candles);
    chart.timeScale().fitContent();
    document.getElementById("chartContainer").style.display = "";
    document.getElementById("chartEmpty").style.display = "none";
  }

  async function selectCompany(code, name) {
    state.chart.code = code;
    document.getElementById("chartToolbar").style.display = "";
    document.getElementById("chartCode").textContent = code;
    document.getElementById("chartName").textContent = name || code;
    const meta = (state.prices || []).find((p) => p.code === code);
    document.getElementById("chartMeta").textContent = meta
      ? `${meta.sector || "—"} · LTP ${fmtNum(meta.ltp)} · ${fmtPct(meta.percent)} · Mkt cap Tk ${fmtCr(meta.marketCap)} cr`
      : "Loading…";
    try {
      const data = await api(`/api/history/${encodeURIComponent(code)}?days=${state.chart.days}`);
      if (!data.length) throw new Error("No history for " + code);
      renderChart(data);
    } catch (err) {
      showChartError(err.message);
    }
  }

  function showChartError(msg) {
    document.getElementById("chartContainer").style.display = "none";
    const el = document.getElementById("chartEmpty");
    el.style.display = "flex";
    el.textContent = "Error loading chart: " + msg;
  }

  async function chartSearch() {
    const q = document.getElementById("chartSearch").value.trim();
    if (q.length < 1) return;
    try {
      const rows = await api("/api/search?q=" + encodeURIComponent(q));
      if (!rows.length) { showChartError("No company found for '" + q + "'"); return; }
      const top = rows[0];
      await selectCompany(top.code, top.name);
    } catch (err) {
      showChartError(err.message);
    }
  }

  function bindChartControls() {
    const input = document.getElementById("chartSearch");
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") chartSearch(); });
    document.querySelectorAll("#chartRange button").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#chartRange button").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        state.chart.days = parseInt(btn.dataset.days, 10);
        if (state.chart.code) selectCompany(state.chart.code);
      });
    });
  }

  /* ---------------- news ---------------- */
  function newsItemHtml(n) {
    const date = (n.filedAt || "") + (n.time ? " " + n.time : "");
    return `<article class="card news-card">
      <div class="news-top">
        <span class="news-type">${esc(n.type || "News")}</span>
        <span class="chip" style="font-size:12px">${esc(n.code || "DSE")}</span>
        <span class="news-date">${esc(date)}</span>
      </div>
      <h3>${esc(n.summary || n.name || "")}</h3>
      <p>${esc(n.body || "")}</p>
    </article>`;
  }

  function renderNews() {
    const rows = state.news || [];
    const el = document.getElementById("newsList");
    if (!rows.length) { el.innerHTML = '<div class="card skeleton">No news found.</div>'; return; }
    el.innerHTML = rows.map(newsItemHtml).join("");
  }

  async function loadNews() {
    const q = document.getElementById("newsSearch").value.trim();
    const type = document.getElementById("newsType").value;
    let url = "/api/news?limit=100";
    if (q) url += "&q=" + encodeURIComponent(q);
    try {
      state.news = await api(url);
      if (type) state.news = state.news.filter((n) => (n.type || "").toLowerCase() === type.toLowerCase());
      renderNews();
    } catch (err) {
      document.getElementById("newsList").innerHTML = `<div class="error-banner">${esc(err.message)}</div>`;
    }
  }

  /* ---------------- sectors ---------------- */
  function renderSectors() {
    const rows = state.sectors || [];
    const body = document.getElementById("sectorBody");
    if (!rows.length) { body.innerHTML = '<tr><td colspan="9" class="skeleton">No data.</td></tr>'; return; }
    body.innerHTML = rows.map((s) => `
      <tr>
        <td><strong>${esc(s.sector)}</strong></td>
        <td class="num">${s.companies}</td>
        <td class="num">${s.traded}</td>
        <td class="num up">${s.adv}</td>
        <td class="num down">${s.dec}</td>
        <td class="num ${signClass(s.avgChange)}">${fmtPct(s.avgChange)}</td>
        <td class="num">${fmtNum(s.value, 0)}</td>
        <td class="num">${fmtCompact(s.volume)}</td>
        <td class="num">${fmtCr(s.marketCap)}</td>
      </tr>`).join("");
  }

  /* ---------------- market status ---------------- */
  function renderStatus(snapshot) {
    const s = (snapshot && snapshot.market && snapshot.market.session) || {};
    const el = document.getElementById("marketStatus");
    const txt = document.getElementById("marketStatusText");
    const phase = (s.phase || "").toLowerCase();
    el.classList.remove("open", "closed");
    if (s.isOpen) {
      el.classList.add("open");
      txt.textContent = "Market Open";
    } else if (phase.includes("pre")) {
      el.classList.add("open");
      txt.textContent = "Pre-open";
    } else if (phase.includes("post")) {
      el.classList.add("closed");
      txt.textContent = "Post-close";
    } else {
      el.classList.add("closed");
      txt.textContent = "Market Closed";
    }
  }

  /* ---------------- util ---------------- */
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  async function loadHome() {
    try {
      state.snapshot = await api("/api/snapshot");
      renderStatus(state.snapshot);
      renderIndices(state.snapshot);
    } catch (e) {
      document.getElementById("indexGrid").innerHTML = `<div class="error-banner">${esc(e.message)}</div>`;
    }
    try {
      state.prices = await api("/api/prices");
      renderMovers(state.prices);
    } catch (e) {
      /* ignore; board view will surface its own error */
    }
    try {
      const news = await api("/api/news?limit=6");
      renderNewsPreview(news);
    } catch (e) {
      document.getElementById("homeNews").innerHTML = `<div class="error-banner">${esc(e.message)}</div>`;
    }
  }

  async function loadBoard() {
    if (state.prices) { renderBoard(); return; }
    try {
      state.prices = await api("/api/prices");
      renderBoard();
    } catch (e) {
      document.getElementById("boardBody").innerHTML = `<tr><td colspan="13"><div class="error-banner">${esc(e.message)}</div></td></tr>`;
    }
  }

  async function loadSectors() {
    try {
      state.sectors = await api("/api/sectors");
      renderSectors();
    } catch (e) {
      document.getElementById("sectorBody").innerHTML = `<tr><td colspan="9"><div class="error-banner">${esc(e.message)}</div></td></tr>`;
    }
  }

  function bindNewsControls() {
    let timer;
    document.getElementById("newsSearch").addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(loadNews, 350);
    });
    document.getElementById("newsType").addEventListener("change", loadNews);
  }

  window.addEventListener("resize", () => {
    if (chart && document.getElementById("view-chart").offsetParent) {
      chart.applyOptions({ width: document.getElementById("chartContainer").clientWidth });
    }
  });

  /* ---------------- boot ---------------- */
  async function boot() {
    bindBoardControls();
    bindChartControls();
    bindNewsControls();
    await loadHome();
    await loadBoard();
    await loadNews();
    await loadSectors();
  }

  boot();
})();
