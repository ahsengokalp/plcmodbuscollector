const elements = {
  generatedAt: document.getElementById("generatedAt"),
  refreshButton: document.getElementById("refreshButton"),
  limitSelect: document.getElementById("limitSelect"),
  sampleStep: document.getElementById("sampleStep"),
  f1LatestValue: document.getElementById("f1LatestValue"),
  f1LatestTime: document.getElementById("f1LatestTime"),
  f2LatestValue: document.getElementById("f2LatestValue"),
  f2LatestTime: document.getElementById("f2LatestTime"),
  chartSubtitle: document.getElementById("chartSubtitle"),
  chart: document.getElementById("thermalTrendChart"),
  zoomOutButton: document.getElementById("zoomOutButton"),
  zoomInButton: document.getElementById("zoomInButton"),
  resetZoomButton: document.getElementById("resetZoomButton"),
  downloadChartButton: document.getElementById("downloadChartButton"),
  errorToast: document.getElementById("errorToast"),
};

let lastPayload = null;
let fullDomain = null;
let viewDomain = null;
let isPanning = false;
let panStartX = 0;
let panStartDomain = null;
let followLatest = true;

const CHART_PAD = { left: 72, right: 30, top: 26, bottom: 76 };
const INITIAL_WINDOW_MS = 4 * 60 * 1000;
const ONE_MINUTE_MS = 60 * 1000;

function showError(message) {
  elements.errorToast.textContent = message;
  elements.errorToast.classList.add("is-visible");
}

function hideError() {
  elements.errorToast.classList.remove("is-visible");
}

function setupCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  const cssHeight = Number(canvas.getAttribute("height")) || 620;
  canvas.style.height = `${cssHeight}px`;
  canvas.width = Math.max(1, Math.floor(rect.width * scale));
  canvas.height = Math.max(1, Math.floor(cssHeight * scale));
  const ctx = canvas.getContext("2d");
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  return { ctx, width: rect.width, height: cssHeight };
}

function combinedPoints(series) {
  return [...series.f1.points, ...series.f2.points].sort((a, b) =>
    a.sort_key.localeCompare(b.sort_key)
  );
}

function pointTime(point) {
  return Date.parse(point.sort_key);
}

function domainForPayload(payload) {
  const times = combinedPoints(payload.series)
    .map(pointTime)
    .filter((time) => Number.isFinite(time));

  if (times.length < 2) return null;

  return {
    min: Math.min(...times),
    max: Math.max(...times),
  };
}

function clampDomain(domain, bounds) {
  const fullSpan = bounds.max - bounds.min;
  const span = Math.min(domain.max - domain.min, fullSpan);

  if (span >= fullSpan) {
    return { ...bounds };
  }

  let min = domain.min;
  let max = domain.min + span;

  if (min < bounds.min) {
    min = bounds.min;
    max = min + span;
  }

  if (max > bounds.max) {
    max = bounds.max;
    min = max - span;
  }

  return { min, max };
}

function initialViewDomain(bounds) {
  const fullSpan = bounds.max - bounds.min;

  if (fullSpan <= INITIAL_WINDOW_MS) {
    return { ...bounds };
  }

  return {
    min: bounds.max - INITIAL_WINDOW_MS,
    max: bounds.max,
  };
}

function ensureViewDomain(payload) {
  const nextFullDomain = domainForPayload(payload);
  if (!nextFullDomain) {
    fullDomain = null;
    viewDomain = null;
    return;
  }

  fullDomain = nextFullDomain;
  viewDomain = viewDomain && !followLatest
    ? clampDomain(viewDomain, fullDomain)
    : initialViewDomain(fullDomain);
}

function resetZoom() {
  if (!fullDomain) return;
  followLatest = true;
  viewDomain = initialViewDomain(fullDomain);
  if (lastPayload) drawTrendChart(lastPayload);
}

function drawablePoints(points, domain) {
  const sorted = [...points].sort((a, b) => pointTime(a) - pointTime(b));
  const visible = [];
  let previous = null;

  sorted.forEach((point) => {
    const time = pointTime(point);
    if (!Number.isFinite(time)) return;

    if (time < domain.min) {
      previous = point;
      return;
    }

    if (time <= domain.max) {
      if (previous) {
        visible.push(previous);
        previous = null;
      }
      visible.push(point);
    }
  });

  return visible;
}

function drawEmptyChart(message) {
  const { ctx, width, height } = setupCanvas(elements.chart);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#667085";
  ctx.font = "14px Segoe UI, Arial";
  ctx.textAlign = "center";
  ctx.fillText(message, width / 2, height / 2);
}

function timeToX(time, domain, pad, chartWidth) {
  const span = Math.max(1, domain.max - domain.min);
  return pad.left + ((time - domain.min) / span) * chartWidth;
}

function formatChartDate(time) {
  const date = new Date(time);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
}

function formatChartTime(time) {
  const date = new Date(time);
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  const second = String(date.getSeconds()).padStart(2, "0");
  return `${hour}:${minute}:${second}`;
}

function tickIntervalForDomain(domain) {
  const span = domain.max - domain.min;

  if (span <= 6 * ONE_MINUTE_MS) return ONE_MINUTE_MS;
  if (span <= 15 * ONE_MINUTE_MS) return 2 * ONE_MINUTE_MS;
  if (span <= 30 * ONE_MINUTE_MS) return 5 * ONE_MINUTE_MS;
  if (span <= 60 * ONE_MINUTE_MS) return 10 * ONE_MINUTE_MS;
  return 15 * ONE_MINUTE_MS;
}

function buildTimeTicks(domain) {
  const interval = tickIntervalForDomain(domain);
  const ticks = [];
  const firstTick = Math.ceil(domain.min / interval) * interval;

  for (let time = firstTick; time <= domain.max; time += interval) {
    ticks.push(time);
  }

  if (ticks.length === 0 || ticks[0] - domain.min > interval * 0.35) {
    ticks.unshift(domain.min);
  }

  if (domain.max - ticks[ticks.length - 1] > interval * 0.35) {
    ticks.push(domain.max);
  }

  return ticks;
}

function drawStepLine(ctx, coords, color) {
  if (!coords.length) return;

  ctx.beginPath();
  ctx.moveTo(coords[0].x, coords[0].y);

  for (let index = 1; index < coords.length; index += 1) {
    const prev = coords[index - 1];
    const current = coords[index];
    ctx.lineTo(current.x, prev.y);
    ctx.lineTo(current.x, current.y);
  }

  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();
}

function drawTrendChart(payload) {
  ensureViewDomain(payload);
  const allPoints = combinedPoints(payload.series);

  if (allPoints.length < 2 || !viewDomain) {
    drawEmptyChart("Trend cizimi icin yeterli veri yok.");
    return;
  }

  const { ctx, width, height } = setupCanvas(elements.chart);
  const pad = CHART_PAD;
  const chartWidth = width - pad.left - pad.right;
  const chartHeight = height - pad.top - pad.bottom;
  const minValue = payload.y_axis.min;
  const maxValue = payload.y_axis.max;
  const range = Math.max(1, maxValue - minValue);

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#fbfcff";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "#e4e7ec";
  ctx.lineWidth = 1;
  ctx.fillStyle = "#667085";
  ctx.font = "12px Segoe UI, Arial";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";

  for (let value = minValue; value <= maxValue; value += payload.y_axis.step) {
    const y = pad.top + chartHeight - ((value - minValue) / range) * chartHeight;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(width - pad.right, y);
    ctx.stroke();
    ctx.fillText(value, pad.left - 12, y);
  }

  ctx.strokeStyle = "#98a2b3";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(pad.left, pad.top);
  ctx.lineTo(pad.left, height - pad.bottom);
  ctx.lineTo(width - pad.right, height - pad.bottom);
  ctx.stroke();

  const seriesList = [payload.series.f1, payload.series.f2];
  ctx.save();
  ctx.beginPath();
  ctx.rect(pad.left, pad.top, chartWidth, chartHeight);
  ctx.clip();

  seriesList.forEach((item) => {
    const coords = drawablePoints(item.points, viewDomain).map((point) => ({
      x: timeToX(pointTime(point), viewDomain, pad, chartWidth),
      y: pad.top + chartHeight - ((point.value - minValue) / range) * chartHeight,
    }));
    drawStepLine(ctx, coords, item.color);
  });
  ctx.restore();

  ctx.fillStyle = "#344054";
  ctx.font = "13px Segoe UI, Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  buildTimeTicks(viewDomain).forEach((time) => {
    const x = timeToX(time, viewDomain, pad, chartWidth);
    ctx.strokeStyle = "#e4e7ec";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, height - pad.bottom);
    ctx.lineTo(x, height - pad.bottom + 8);
    ctx.stroke();
    ctx.fillText(formatChartTime(time), x, height - pad.bottom + 16);
    ctx.fillText(formatChartDate(time), x, height - pad.bottom + 38);
  });
}

function renderDashboard(payload) {
  lastPayload = payload;

  elements.generatedAt.textContent = `Guncel: ${payload.generated_at}`;
  elements.sampleStep.textContent = payload.limit;

  elements.f1LatestValue.textContent = payload.series.f1.latest_value;
  elements.f1LatestTime.textContent = payload.series.f1.latest_time;
  elements.f2LatestValue.textContent = payload.series.f2.latest_value;
  elements.f2LatestTime.textContent = payload.series.f2.latest_time;
  elements.chartSubtitle.textContent = `${payload.series.f1.tag_name} / ${payload.series.f2.tag_name}`;

  drawTrendChart(payload);
}

async function loadDashboard() {
  try {
    const limit = encodeURIComponent(elements.limitSelect.value);
    const response = await fetch(`/api/thermal-dashboard?limit=${limit}`, { cache: "no-store" });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.detail || payload.error || "Veri alinamadi");
    }

    hideError();
    renderDashboard(payload);
  } catch (error) {
    showError(`Dashboard hatasi: ${error.message}`);
  }
}

function zoomAt(clientX, zoomFactor) {
  if (!fullDomain || !viewDomain || !lastPayload) return;

  const rect = elements.chart.getBoundingClientRect();
  const chartLeft = rect.left + CHART_PAD.left;
  const chartWidth = rect.width - CHART_PAD.left - CHART_PAD.right;
  const mouseRatio = Math.min(1, Math.max(0, (clientX - chartLeft) / chartWidth));
  const currentSpan = viewDomain.max - viewDomain.min;
  const fullSpan = fullDomain.max - fullDomain.min;
  const minSpan = Math.max(60 * 1000, fullSpan / 80);
  const nextSpan = Math.min(fullSpan, Math.max(minSpan, currentSpan * zoomFactor));
  const anchorTime = viewDomain.min + currentSpan * mouseRatio;
  const nextMin = anchorTime - nextSpan * mouseRatio;

  followLatest = false;
  viewDomain = clampDomain({ min: nextMin, max: nextMin + nextSpan }, fullDomain);
  drawTrendChart(lastPayload);
}

function panTo(clientX) {
  if (!fullDomain || !panStartDomain || !lastPayload) return;

  const rect = elements.chart.getBoundingClientRect();
  const chartWidth = rect.width - CHART_PAD.left - CHART_PAD.right;
  const span = panStartDomain.max - panStartDomain.min;
  const deltaPx = clientX - panStartX;
  const deltaMs = -(deltaPx / chartWidth) * span;

  followLatest = false;
  viewDomain = clampDomain(
    {
      min: panStartDomain.min + deltaMs,
      max: panStartDomain.max + deltaMs,
    },
    fullDomain
  );
  drawTrendChart(lastPayload);
}

function zoomFromCenter(zoomFactor) {
  const rect = elements.chart.getBoundingClientRect();
  zoomAt(rect.left + rect.width / 2, zoomFactor);
}

function downloadChart() {
  if (!lastPayload) return;

  const link = document.createElement("a");
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  link.download = `firin-trend-dashboard-${timestamp}.png`;
  link.href = elements.chart.toDataURL("image/png");
  link.click();
}

elements.refreshButton.addEventListener("click", loadDashboard);
elements.limitSelect.addEventListener("change", () => {
  viewDomain = null;
  followLatest = true;
  loadDashboard();
});
elements.resetZoomButton.addEventListener("click", resetZoom);
elements.zoomOutButton.addEventListener("click", () => zoomFromCenter(1.22));
elements.zoomInButton.addEventListener("click", () => zoomFromCenter(0.82));
elements.downloadChartButton.addEventListener("click", downloadChart);
elements.chart.addEventListener("wheel", (event) => {
  event.preventDefault();
  zoomAt(event.clientX, event.deltaY < 0 ? 0.82 : 1.22);
});
elements.chart.addEventListener("pointerdown", (event) => {
  if (!viewDomain || !fullDomain || event.button !== 0) return;
  isPanning = true;
  panStartX = event.clientX;
  panStartDomain = { ...viewDomain };
  elements.chart.classList.add("is-panning");
  elements.chart.setPointerCapture(event.pointerId);
});
elements.chart.addEventListener("pointermove", (event) => {
  if (!isPanning) return;
  panTo(event.clientX);
});
elements.chart.addEventListener("pointerup", (event) => {
  isPanning = false;
  panStartDomain = null;
  elements.chart.classList.remove("is-panning");
  elements.chart.releasePointerCapture(event.pointerId);
});
elements.chart.addEventListener("pointercancel", () => {
  isPanning = false;
  panStartDomain = null;
  elements.chart.classList.remove("is-panning");
});
window.addEventListener("resize", () => {
  if (lastPayload) drawTrendChart(lastPayload);
});

loadDashboard();
setInterval(loadDashboard, 5000);
