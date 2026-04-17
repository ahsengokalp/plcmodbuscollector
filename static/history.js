const elements = {
  generatedAt: document.getElementById("generatedAt"),
  refreshButton: document.getElementById("refreshButton"),
  limitSelect: document.getElementById("limitSelect"),
  sampleStep: document.getElementById("sampleStep"),
  f1LatestValue: document.getElementById("f1LatestValue"),
  f1LatestTime: document.getElementById("f1LatestTime"),
  f1Count: document.getElementById("f1Count"),
  f1Rows: document.getElementById("f1Rows"),
  downloadF1Button: document.getElementById("downloadF1Button"),
  f2LatestValue: document.getElementById("f2LatestValue"),
  f2LatestTime: document.getElementById("f2LatestTime"),
  f2Count: document.getElementById("f2Count"),
  f2Rows: document.getElementById("f2Rows"),
  downloadF2Button: document.getElementById("downloadF2Button"),
  errorToast: document.getElementById("errorToast"),
};

let historyData = {
  f1: [],
  f2: [],
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

  historyData.f1 = f1.rows;
  historyData.f2 = f2.rows;

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

function createCsvLine(values) {
  return values
    .map((value) => `"${String(value).replace(/"/g, '""')}"`)
    .join(",");
}

function downloadCsv(filename, headers, rows) {
  const lines = [createCsvLine(headers)];
  rows.forEach((row) => {
    lines.push(createCsvLine([row.no, row.date, row.time, row.value]));
  });

  const blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function downloadHistory(type) {
  const rows = historyData[type] || [];
  if (!rows.length) {
    showError("Indirmek icin yeterli veri yok.");
    return;
  }

  const headers = ["No", "Tarih", "Saat", "Sicaklik"];
  const filename = type === "f1" ? "firin_1_veri_gecmisi.csv" : "firin_2_veri_gecmisi.csv";
  downloadCsv(filename, headers, rows);
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
elements.downloadF1Button.addEventListener("click", () => downloadHistory("f1"));
elements.downloadF2Button.addEventListener("click", () => downloadHistory("f2"));

loadHistory();
setInterval(loadHistory, 5000);
