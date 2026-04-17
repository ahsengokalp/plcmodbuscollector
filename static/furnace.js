const furnaceId = document.body.dataset.furnaceId;

const elements = {
  generatedAt: document.getElementById("generatedAt"),
  refreshButton: document.getElementById("refreshButton"),
  entryHistory: document.getElementById("entryHistory"),
  girisBiyetNo: document.getElementById("girisBiyetNo"),
  cikisBiyetNo: document.getElementById("cikisBiyetNo"),
  furnaceRows: document.getElementById("furnaceRows"),
  lastUpdate: document.getElementById("lastUpdate"),
  entryCount: document.getElementById("entryCount"),
  rowCount: document.getElementById("rowCount"),
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

function renderEntryHistory(rows) {
  elements.entryCount.textContent = `${rows.length} kayit`;

  if (!rows.length) {
    elements.entryHistory.innerHTML = `
      <tr>
        <td colspan="3" class="empty-state">Giris kaydi yok.</td>
      </tr>
    `;
    return;
  }

  elements.entryHistory.innerHTML = rows
    .map(
      (row) => `
        <tr>
          <td>${escapeHtml(row.date)}</td>
          <td>${escapeHtml(row.time)}</td>
          <td>${row.value}</td>
        </tr>
      `
    )
    .join("");
}

function renderFurnaceRows(rows) {
  elements.rowCount.textContent = `${rows.length} kayit`;

  if (!rows.length) {
    elements.furnaceRows.innerHTML = `
      <tr>
        <td colspan="11" class="empty-state">Cikis biyet kaydi yok.</td>
      </tr>
    `;
    return;
  }

  elements.furnaceRows.innerHTML = rows
    .map(
      (row) => `
        <tr>
          <td>${escapeHtml(row.date)}</td>
          <td>${escapeHtml(row.time)}</td>
          <td>${row.cikis_biyet_no}</td>
          <td>${row.ham_isi}</td>
          <td>${row.pik_isi}</td>
          <td>${row.isinma_dk}</td>
          <td>${row.isinma_sn}</td>
          <td>${row.v_giris_isi}</td>
          <td>${row.v_cikis_isi}</td>
          <td>${row.v_yatak_dk}</td>
          <td>${row.v_yatak_sn}</td>
        </tr>
      `
    )
    .join("");
}

function renderPayload(payload) {
  elements.generatedAt.textContent = `Guncel: ${payload.generated_at}`;
  elements.girisBiyetNo.textContent = payload.summary.giris_biyet_no;
  elements.cikisBiyetNo.textContent = payload.summary.cikis_biyet_no;
  elements.lastUpdate.textContent = payload.summary.last_update;
  renderEntryHistory(payload.entry_history);
  renderFurnaceRows(payload.rows);
}

async function loadFurnace() {
  try {
    const response = await fetch(`/api/furnace/${furnaceId}`, { cache: "no-store" });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.detail || payload.error || "Veri alinamadi");
    }

    hideError();
    renderPayload(payload);
  } catch (error) {
    showError(`Firin ekrani hatasi: ${error.message}`);
  }
}

elements.refreshButton.addEventListener("click", loadFurnace);

loadFurnace();
setInterval(loadFurnace, 5000);
