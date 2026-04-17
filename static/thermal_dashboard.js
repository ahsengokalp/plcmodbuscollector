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
  zoomLevel: document.getElementById("zoomLevel"),
  downloadChartButton: document.getElementById("downloadChartButton"),
  errorToast: document.getElementById("errorToast"),
};

let lastPayload = null;
let zoomLevel = 1;

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.5;

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
  const baseHeight = Number(canvas.dataset.baseHeight) || Number(canvas.getAttribute("height")) || 620;
  const cssHeight = Math.round(baseHeight * Math.min(zoomLevel, 2.2));
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

function zoomedPoints(points) {
  if (zoomLevel <= 1 || points.length <= 2) return points;

  const visibleCount = Math.max(2, Math.ceil(points.length / zoomLevel));
  return points.slice(-visibleCount);
}

function zoomedPayload(payload) {
  const f1Points = zoomedPoints(payload.series.f1.points);
  const f2Points = zoomedPoints(payload.series.f2.points);
  const visibleValues = [...f1Points, ...f2Points].map((point) => point.value);
  const minValue = visibleValues.length ? Math.min(...visibleValues) : payload.y_axis.min;
  const maxValue = visibleValues.length ? Math.max(...visibleValues) : payload.y_axis.max;
  const padding = Math.max(25, Math.round((maxValue - minValue) * 0.16));
  const yMin = zoomLevel > 1 ? Math.max(0, Math.floor((minValue - padding) / 25) * 25) : payload.y_axis.min;
  const yMax = zoomLevel > 1
    ? Math.max(yMin + 125, Math.ceil((maxValue + padding) / 25) * 25)
    : payload.y_axis.max;

  return {
    ...payload,
    y_axis: {
      ...payload.y_axis,
      min: yMin,
      max: yMax,
      step: zoomLevel > 1 ? Math.max(25, Math.ceil((yMax - yMin) / 8 / 25) * 25) : payload.y_axis.step,
    },
    series: {
      f1: { ...payload.series.f1, points: f1Points },
      f2: { ...payload.series.f2, points: f2Points },
    },
  };
}

function drawEmptyChart(message) {
  const { ctx, width, height } = setupCanvas(elements.chart);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#667085";
  ctx.font = "14px Segoe UI, Arial";
  ctx.textAlign = "center";
  ctx.fillText(message, width / 2, height / 2);
}

function pointX(index, count, pad, chartWidth) {
  if (count <= 1) return pad.left;
  return pad.left + (chartWidth / (count - 1)) * index;
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
  const chartPayload = zoomedPayload(payload);
  const allPoints = combinedPoints(chartPayload.series);

  if (allPoints.length < 2) {
    drawEmptyChart("Trend cizimi icin yeterli veri yok.");
    return;
  }

  const { ctx, width, height } = setupCanvas(elements.chart);
  const pad = { left: 72, right: 30, top: 26, bottom: 76 };
  const chartWidth = width - pad.left - pad.right;
  const chartHeight = height - pad.top - pad.bottom;
  const minValue = chartPayload.y_axis.min;
  const maxValue = chartPayload.y_axis.max;
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

  for (let value = minValue; value <= maxValue; value += chartPayload.y_axis.step) {
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

  const seriesList = [chartPayload.series.f1, chartPayload.series.f2];
  seriesList.forEach((item) => {
    const coords = item.points.map((point, index) => ({
      x: pointX(index, item.points.length, pad, chartWidth),
      y: pad.top + chartHeight - ((point.value - minValue) / range) * chartHeight,
    }));
    drawStepLine(ctx, coords, item.color);
  });

  const first = allPoints[0];
  const middle = allPoints[Math.floor(allPoints.length / 2)];
  const last = allPoints[allPoints.length - 1];
  const tickPoints = [
    { point: first, x: pad.left },
    { point: middle, x: pad.left + chartWidth / 2 },
    { point: last, x: width - pad.right },
  ];

  ctx.fillStyle = "#344054";
  ctx.font = "13px Segoe UI, Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  tickPoints.forEach(({ point, x }) => {
    ctx.fillText(point.time, x, height - pad.bottom + 16);
    ctx.fillText(point.date, x, height - pad.bottom + 38);
  });
}

function updateZoomControls() {
  elements.zoomLevel.textContent = `${Math.round(zoomLevel * 100)}%`;
  elements.zoomOutButton.disabled = zoomLevel <= MIN_ZOOM;
  elements.zoomInButton.disabled = zoomLevel >= MAX_ZOOM;
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
  updateZoomControls();
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

function setZoom(nextZoom) {
  zoomLevel = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom));
  updateZoomControls();

  if (lastPayload) {
    drawTrendChart(lastPayload);
  }
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
elements.limitSelect.addEventListener("change", loadDashboard);
elements.zoomOutButton.addEventListener("click", () => setZoom(zoomLevel - ZOOM_STEP));
elements.zoomInButton.addEventListener("click", () => setZoom(zoomLevel + ZOOM_STEP));
elements.resetZoomButton.addEventListener("click", () => setZoom(1));
elements.downloadChartButton.addEventListener("click", downloadChart);
window.addEventListener("resize", () => {
  if (lastPayload) drawTrendChart(lastPayload);
});

updateZoomControls();
loadDashboard();
setInterval(loadDashboard, 5000);
