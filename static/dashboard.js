const state = {
  currentValues: [],
  recentChanges: [],
  trend: [],
  quickFilter: "all",
};

const elements = {
  totalTags: document.getElementById("totalTags"),
  alarmCount: document.getElementById("alarmCount"),
  changesToday: document.getElementById("changesToday"),
  recentChangeCount: document.getElementById("recentChangeCount"),
  lastUpdate: document.getElementById("lastUpdate"),
  connectionState: document.getElementById("connectionState"),
  generatedAt: document.getElementById("generatedAt"),
  tagList: document.getElementById("tagList"),
  tagFilter: document.getElementById("tagFilter"),
  filterButtons: document.querySelectorAll("[data-filter]"),
  changesTable: document.getElementById("changesTable"),
  trendChart: document.getElementById("trendChart"),
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

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function pillClass(status) {
  if (status === "critical") return "critical-pill";
  if (status === "warning") return "warning-pill";
  return "ok-pill";
}

function itemMatchesText(item) {
  const filter = elements.tagFilter.value.trim().toLocaleLowerCase("tr-TR");
  if (!filter) return true;

  const haystack = `${item.tag_name} ${item.modbus_address}`.toLocaleLowerCase("tr-TR");
  return haystack.includes(filter);
}

function itemMatchesQuickFilter(item) {
  const tagName = item.tag_name.toLocaleUpperCase("tr-TR");

  if (state.quickFilter === "f1") return tagName.includes("F_1");
  if (state.quickFilter === "f2") return tagName.includes("F_2");
  if (state.quickFilter === "isi") return tagName.includes("ISI");
  if (state.quickFilter === "critical") return item.status === "critical";
  return true;
}

function itemMatchesFilters(item) {
  return itemMatchesText(item) && itemMatchesQuickFilter(item);
}

function setQuickFilter(filter) {
  state.quickFilter = filter;
  elements.filterButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.filter === filter);
  });
  renderTagList();
  renderChangesTable();
}

function setupCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  const cssHeight = Number(canvas.getAttribute("height")) || 260;
  canvas.style.height = `${cssHeight}px`;
  canvas.width = Math.max(1, Math.floor(rect.width * scale));
  canvas.height = Math.max(1, Math.floor(cssHeight * scale));
  const ctx = canvas.getContext("2d");
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  return { ctx, width: rect.width, height: cssHeight };
}

function drawEmptyChart(message) {
  const { ctx, width, height } = setupCanvas(elements.trendChart);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#667085";
  ctx.font = "13px Segoe UI, Arial";
  ctx.textAlign = "center";
  ctx.fillText(message, width / 2, height / 2);
}

function drawTrendChart() {
  const points = state.trend;
  if (points.length < 2) {
    drawEmptyChart("Trend icin yeterli degisim yok.");
    return;
  }

  const { ctx, width, height } = setupCanvas(elements.trendChart);
  const pad = { left: 48, right: 18, top: 18, bottom: 36 };
  const chartWidth = width - pad.left - pad.right;
  const chartHeight = height - pad.top - pad.bottom;
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);

  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = "#e4e7ec";
  ctx.lineWidth = 1;
  ctx.fillStyle = "#667085";
  ctx.font = "11px Segoe UI, Arial";
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

  const coords = points.map((point, index) => {
    const x = pad.left + (chartWidth / (points.length - 1)) * index;
    const y = pad.top + chartHeight - ((point.value - min) / range) * chartHeight;
    return { x, y };
  });

  const gradient = ctx.createLinearGradient(0, pad.top, 0, height - pad.bottom);
  gradient.addColorStop(0, "rgba(9, 104, 232, 0.22)");
  gradient.addColorStop(1, "rgba(9, 104, 232, 0)");

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

  ctx.fillStyle = "#667085";
  ctx.textAlign = "center";
  ctx.fillText(points[0].label, pad.left, height - 12);
  ctx.fillText(points[points.length - 1].label, width - pad.right, height - 12);
}

function renderMetrics(payload) {
  const stats = payload.stats;
  const alarmCount = stats.warning_count + stats.critical_count;
  setText("totalTags", stats.total_tags);
  setText("alarmCount", alarmCount);
  setText("changesToday", stats.changes_today);
  setText("recentChangeCount", `${stats.recent_change_count} kayit`);
  setText("lastUpdate", stats.last_update);
  setText("connectionState", stats.connection_state);
  setText("generatedAt", `Guncel: ${payload.generated_at}`);
}

function renderTagList() {
  const values = state.currentValues.filter(itemMatchesFilters);

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
            <span class="tag-meta">Adres ${item.modbus_address} | ${item.updated_at}</span>
          </div>
          <span class="value-pill ${pillClass(item.status)}">${item.raw_value}</span>
        </div>
      `
    )
    .join("");
}

function renderChangesTable() {
  const changes = state.recentChanges.filter(itemMatchesFilters);
  const total = state.recentChanges.length;
  const suffix = changes.length === total ? `${total} kayit` : `${changes.length}/${total} kayit`;
  setText("recentChangeCount", suffix);

  if (changes.length === 0) {
    elements.changesTable.innerHTML = `
      <tr>
        <td colspan="6" class="empty-state">Bu filtreye uygun degisim yok.</td>
      </tr>
    `;
    return;
  }

  elements.changesTable.innerHTML = changes
    .map((item) => {
      const deltaClass = item.delta >= 0 ? "delta-up" : "delta-down";
      const delta = item.delta >= 0 ? `+${item.delta}` : item.delta;
      return `
        <tr>
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
    state.trend = payload.charts.trend;

    renderMetrics(payload);
    renderTagList();
    renderChangesTable();
    drawTrendChart();
  } catch (error) {
    showError(`Dashboard hatasi: ${error.message}`);
  }
}

elements.tagFilter.addEventListener("input", () => {
  renderTagList();
  renderChangesTable();
});
elements.filterButtons.forEach((button) => {
  button.addEventListener("click", () => setQuickFilter(button.dataset.filter));
});
elements.refreshButton.addEventListener("click", loadDashboard);
window.addEventListener("resize", drawTrendChart);

loadDashboard();
setInterval(loadDashboard, 5000);
