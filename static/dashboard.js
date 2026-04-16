const state = {
  currentValues: [],
  recentChanges: [],
  charts: {
    trend: [],
    top_changed_tags: [],
    temperature_highlights: [],
    status_distribution: [],
  },
};

const elements = {
  totalTags: document.getElementById("totalTags"),
  criticalCount: document.getElementById("criticalCount"),
  okCount: document.getElementById("okCount"),
  warningCount: document.getElementById("warningCount"),
  changesToday: document.getElementById("changesToday"),
  lastUpdate: document.getElementById("lastUpdate"),
  connectionState: document.getElementById("connectionState"),
  generatedAt: document.getElementById("generatedAt"),
  alarmQueue: document.getElementById("alarmQueue"),
  recentChangeCount: document.getElementById("recentChangeCount"),
  warningThreshold: document.getElementById("warningThreshold"),
  criticalThreshold: document.getElementById("criticalThreshold"),
  tagList: document.getElementById("tagList"),
  tagFilter: document.getElementById("tagFilter"),
  changesTable: document.getElementById("changesTable"),
  trendChart: document.getElementById("trendChart"),
  statusChart: document.getElementById("statusChart"),
  topTagsChart: document.getElementById("topTagsChart"),
  heatList: document.getElementById("heatList"),
  errorToast: document.getElementById("errorToast"),
  refreshButton: document.getElementById("refreshButton"),
};

function setText(id, value) {
  elements[id].textContent = value;
}

function showError(message) {
  elements.errorToast.textContent = message;
  elements.errorToast.classList.add("is-visible");
}

function hideError() {
  elements.errorToast.classList.remove("is-visible");
}

function pillClass(status) {
  if (status === "critical") return "critical-pill";
  if (status === "warning") return "warning-pill";
  return "ok-pill";
}

function dotClass(status) {
  if (status === "critical") return "status-critical";
  if (status === "warning") return "status-warning";
  return "status-ok";
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function setupCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  const cssHeight = Number(canvas.getAttribute("height")) || 220;
  canvas.style.height = `${cssHeight}px`;
  canvas.width = Math.max(1, Math.floor(rect.width * scale));
  canvas.height = Math.max(1, Math.floor(cssHeight * scale));
  const ctx = canvas.getContext("2d");
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  return { ctx, width: rect.width, height: cssHeight };
}

function chartColor(status) {
  if (status === "critical") return "#dc2626";
  if (status === "warning") return "#d97706";
  if (status === "ok") return "#059669";
  return "#0968e8";
}

function drawEmptyChart(canvas, message) {
  const { ctx, width, height } = setupCanvas(canvas);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#64748b";
  ctx.font = "13px Segoe UI, Arial";
  ctx.textAlign = "center";
  ctx.fillText(message, width / 2, height / 2);
}

function drawTrendChart() {
  const points = state.charts.trend;
  if (points.length < 2) {
    drawEmptyChart(elements.trendChart, "Trend icin yeterli degisim yok.");
    return;
  }

  const { ctx, width, height } = setupCanvas(elements.trendChart);
  const pad = { left: 46, right: 18, top: 18, bottom: 36 };
  const chartWidth = width - pad.left - pad.right;
  const chartHeight = height - pad.top - pad.bottom;
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);

  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 1;
  ctx.font = "11px Segoe UI, Arial";
  ctx.fillStyle = "#64748b";
  ctx.textAlign = "right";

  for (let i = 0; i <= 4; i += 1) {
    const y = pad.top + (chartHeight / 4) * i;
    const value = Math.round(max - (range / 4) * i);
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(width - pad.right, y);
    ctx.stroke();
    ctx.fillText(value, pad.left - 8, y + 4);
  }

  const gradient = ctx.createLinearGradient(0, pad.top, 0, height - pad.bottom);
  gradient.addColorStop(0, "rgba(9, 104, 232, 0.28)");
  gradient.addColorStop(1, "rgba(9, 104, 232, 0)");

  const coords = points.map((point, index) => {
    const x = pad.left + (chartWidth / (points.length - 1)) * index;
    const y = pad.top + chartHeight - ((point.value - min) / range) * chartHeight;
    return { x, y };
  });

  ctx.beginPath();
  coords.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.lineTo(coords[coords.length - 1].x, height - pad.bottom);
  ctx.lineTo(coords[0].x, height - pad.bottom);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.beginPath();
  coords.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.strokeStyle = "#0968e8";
  ctx.lineWidth = 3;
  ctx.stroke();

  coords.forEach((point) => {
    ctx.beginPath();
    ctx.arc(point.x, point.y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = "#0968e8";
    ctx.lineWidth = 2;
    ctx.stroke();
  });

  ctx.fillStyle = "#64748b";
  ctx.textAlign = "center";
  const first = points[0].label;
  const last = points[points.length - 1].label;
  ctx.fillText(first, pad.left, height - 12);
  ctx.fillText(last, width - pad.right, height - 12);
}

function drawStatusChart() {
  const data = state.charts.status_distribution.filter((item) => item.value > 0);
  if (data.length === 0) {
    drawEmptyChart(elements.statusChart, "Anlik veri yok.");
    return;
  }

  const { ctx, width, height } = setupCanvas(elements.statusChart);
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const centerX = width / 2;
  const centerY = height / 2 - 4;
  const radius = Math.min(width, height) * 0.26;
  let start = -Math.PI / 2;

  ctx.clearRect(0, 0, width, height);
  data.forEach((item) => {
    const angle = (item.value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, start, start + angle);
    ctx.closePath();
    ctx.fillStyle = chartColor(item.status);
    ctx.fill();
    start += angle;
  });

  ctx.beginPath();
  ctx.arc(centerX, centerY, radius * 0.58, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.fillStyle = "#0f172a";
  ctx.font = "700 24px Segoe UI, Arial";
  ctx.textAlign = "center";
  ctx.fillText(total, centerX, centerY + 8);

  const legendY = height - 34;
  let legendX = 18;
  ctx.font = "12px Segoe UI, Arial";
  data.forEach((item) => {
    ctx.fillStyle = chartColor(item.status);
    ctx.fillRect(legendX, legendY, 10, 10);
    ctx.fillStyle = "#64748b";
    ctx.textAlign = "left";
    ctx.fillText(`${item.label}: ${item.value}`, legendX + 15, legendY + 10);
    legendX += 96;
  });
}

function drawTopTagsChart() {
  const data = state.charts.top_changed_tags;
  if (data.length === 0) {
    drawEmptyChart(elements.topTagsChart, "Bugun degisen tag yok.");
    return;
  }

  const { ctx, width, height } = setupCanvas(elements.topTagsChart);
  const pad = { left: 116, right: 22, top: 14, bottom: 20 };
  const barGap = 8;
  const barHeight = Math.max(12, (height - pad.top - pad.bottom) / data.length - barGap);
  const max = Math.max(...data.map((item) => item.change_count));

  ctx.clearRect(0, 0, width, height);
  ctx.font = "11px Segoe UI, Arial";

  data.forEach((item, index) => {
    const y = pad.top + index * (barHeight + barGap);
    const barWidth = ((width - pad.left - pad.right) * item.change_count) / max;
    const label = item.tag_name.length > 19 ? `${item.tag_name.slice(0, 18)}...` : item.tag_name;

    ctx.fillStyle = "#334155";
    ctx.textAlign = "right";
    ctx.fillText(label, pad.left - 9, y + barHeight - 2);
    ctx.fillStyle = "#dbeafe";
    ctx.fillRect(pad.left, y, width - pad.left - pad.right, barHeight);
    ctx.fillStyle = "#0968e8";
    ctx.fillRect(pad.left, y, Math.max(3, barWidth), barHeight);
    ctx.fillStyle = "#0f172a";
    ctx.textAlign = "left";
    ctx.fillText(item.change_count, pad.left + barWidth + 6, y + barHeight - 2);
  });
}

function renderHeatList() {
  const data = state.charts.temperature_highlights;
  if (data.length === 0) {
    elements.heatList.innerHTML = '<div class="empty-state">Isi tagi bulunamadi.</div>';
    return;
  }

  const max = Math.max(...data.map((item) => item.raw_value), 1);
  elements.heatList.innerHTML = data
    .map((item) => {
      const width = Math.max(4, Math.round((item.raw_value / max) * 100));
      return `
        <div class="heat-row">
          <div>
            <div class="heat-label">
              <strong title="${escapeHtml(item.tag_name)}">${escapeHtml(item.tag_name)}</strong>
            </div>
            <div class="heat-bar">
              <div class="heat-fill" style="width: ${width}%"></div>
            </div>
          </div>
          <span class="value-pill ${pillClass(item.status)}">${item.raw_value}</span>
        </div>
      `;
    })
    .join("");
}

function renderCharts() {
  drawTrendChart();
  drawStatusChart();
  drawTopTagsChart();
  renderHeatList();
}

function renderMetrics(payload) {
  const stats = payload.stats;
  setText("totalTags", stats.total_tags);
  setText("criticalCount", stats.critical_count);
  setText("okCount", stats.ok_count);
  setText("warningCount", stats.warning_count);
  setText("changesToday", stats.changes_today);
  setText("lastUpdate", stats.last_update);
  setText("connectionState", stats.connection_state);
  setText("generatedAt", `Guncel: ${payload.generated_at}`);
  setText("alarmQueue", stats.critical_count + stats.warning_count);
  setText("recentChangeCount", stats.recent_change_count);
  setText("warningThreshold", payload.thresholds.warning);
  setText("criticalThreshold", payload.thresholds.critical);
}

function renderTagList() {
  const filter = elements.tagFilter.value.trim().toLocaleLowerCase("tr-TR");
  const values = state.currentValues.filter((item) => {
    const haystack = `${item.tag_name} ${item.modbus_address}`.toLocaleLowerCase("tr-TR");
    return haystack.includes(filter);
  });

  if (values.length === 0) {
    elements.tagList.innerHTML = '<div class="empty-state">Kayit bulunamadi.</div>';
    return;
  }

  elements.tagList.innerHTML = values
    .map(
      (item) => `
        <div class="tag-item">
          <div>
            <span class="tag-name" title="${escapeHtml(item.tag_name)}">${escapeHtml(item.tag_name)}</span>
            <span class="tag-meta">Adres: ${item.modbus_address} | ${item.updated_at}</span>
          </div>
          <span class="value-pill ${pillClass(item.status)}">${item.raw_value}</span>
        </div>
      `
    )
    .join("");
}

function renderChangesTable() {
  if (state.recentChanges.length === 0) {
    elements.changesTable.innerHTML = `
      <tr>
        <td colspan="7" class="empty-state">Henuz degisim kaydi yok.</td>
      </tr>
    `;
    return;
  }

  elements.changesTable.innerHTML = state.recentChanges
    .map((item) => {
      const deltaClass = item.delta >= 0 ? "delta-up" : "delta-down";
      const delta = item.delta >= 0 ? `+${item.delta}` : item.delta;
      return `
        <tr>
          <td><span class="status-dot ${dotClass(item.status)}"></span></td>
          <td>${item.modbus_address}</td>
          <td title="${escapeHtml(item.tag_name)}">${escapeHtml(item.tag_name)}</td>
          <td>${item.old_value}</td>
          <td>${item.new_value}</td>
          <td class="${deltaClass}">${delta}</td>
          <td>${item.changed_at}</td>
        </tr>
      `;
    })
    .join("");
}

async function loadDashboard() {
  try {
    const response = await fetch("/api/dashboard", { cache: "no-store" });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.detail || payload.error || "Veri alinamadi");
    }

    hideError();
    state.currentValues = payload.current_values;
    state.recentChanges = payload.recent_changes;
    state.charts = payload.charts;
    renderMetrics(payload);
    renderTagList();
    renderChangesTable();
    renderCharts();
  } catch (error) {
    showError(`Dashboard hatasi: ${error.message}`);
  }
}

elements.tagFilter.addEventListener("input", renderTagList);
elements.refreshButton.addEventListener("click", loadDashboard);
window.addEventListener("resize", renderCharts);

loadDashboard();
setInterval(loadDashboard, 5000);
