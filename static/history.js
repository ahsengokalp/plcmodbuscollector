const elements = {
  generatedAt: document.getElementById("generatedAt"),
  refreshButton: document.getElementById("refreshButton"),
  limitSelect: document.getElementById("limitSelect"),
  sampleStep: document.getElementById("sampleStep"),
  f1LatestValue: document.getElementById("f1LatestValue"),
  f1LatestTime: document.getElementById("f1LatestTime"),
  f1Count: document.getElementById("f1Count"),
  f1Rows: document.getElementById("f1Rows"),
  f2LatestValue: document.getElementById("f2LatestValue"),
  f2LatestTime: document.getElementById("f2LatestTime"),
  f2Count: document.getElementById("f2Count"),
  f2Rows: document.getElementById("f2Rows"),
  errorToast: document.getElementById("errorToast"),
};

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

function valueClass(status) {
  if (status === "critical") return "history-value critical";
  if (status === "warning") return "history-value warning";
  return "history-value ok";
}

function renderRows(target, rows, emptyMessage) {
  if (!rows.length) {
    target.innerHTML = `
      <tr>
        <td colspan="4" class="empty-state">${emptyMessage}</td>
      </tr>
    `;
    return;
  }

  target.innerHTML = rows
    .map(
      (row) => `
        <tr>
          <td>${row.no}</td>
          <td>${escapeHtml(row.date)}</td>
          <td>${escapeHtml(row.time)}</td>
          <td><span class="${valueClass(row.status)}">${row.value}</span></td>
        </tr>
      `
    )
    .join("");
}

function renderHistory(payload) {
  const f1 = payload.histories.f1;
  const f2 = payload.histories.f2;

  elements.generatedAt.textContent = `Guncel: ${payload.generated_at}`;
  elements.sampleStep.textContent = payload.limit;

  elements.f1LatestValue.textContent = f1.latest_value;
  elements.f1LatestTime.textContent = f1.latest_time;
  elements.f1Count.textContent = `${f1.rows.length} kayit`;
  renderRows(elements.f1Rows, f1.rows, "FIRIN_1 icin termal veri yok.");

  elements.f2LatestValue.textContent = f2.latest_value;
  elements.f2LatestTime.textContent = f2.latest_time;
  elements.f2Count.textContent = `${f2.rows.length} kayit`;
  renderRows(elements.f2Rows, f2.rows, "FIRIN_2 icin termal veri yok.");
}

async function loadHistory() {
  try {
    const limit = encodeURIComponent(elements.limitSelect.value);
    const response = await fetch(`/api/history?limit=${limit}`, { cache: "no-store" });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.detail || payload.error || "Veri alinamadi");
    }

    hideError();
    renderHistory(payload);
  } catch (error) {
    showError(`Veri gecmisi hatasi: ${error.message}`);
  }
}

elements.refreshButton.addEventListener("click", loadHistory);
elements.limitSelect.addEventListener("change", loadHistory);

loadHistory();
setInterval(loadHistory, 5000);
