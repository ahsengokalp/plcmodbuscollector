const elements = {
  generatedAt: document.getElementById("generatedAt"),
  refreshButton: document.getElementById("refreshButton"),
  errorToast: document.getElementById("errorToast"),
  overallCard: document.getElementById("overallCard"),
  overallState: document.getElementById("overallState"),
  overallMessage: document.getElementById("overallMessage"),
  deviceCard: document.getElementById("deviceCard"),
  deviceState: document.getElementById("deviceState"),
  deviceMessage: document.getElementById("deviceMessage"),
  lastDeviceUpdate: document.getElementById("lastDeviceUpdate"),
  staleLimit: document.getElementById("staleLimit"),
  healthTagCount: document.getElementById("healthTagCount"),
  databaseRow: document.getElementById("databaseRow"),
  databaseState: document.getElementById("databaseState"),
  databaseMessage: document.getElementById("databaseMessage"),
  collectorRow: document.getElementById("collectorRow"),
  collectorState: document.getElementById("collectorState"),
  collectorMessage: document.getElementById("collectorMessage"),
};

function showError(message) {
  elements.errorToast.textContent = message;
  elements.errorToast.classList.add("is-visible");
}

function hideError() {
  elements.errorToast.classList.remove("is-visible");
}

function applyStateClass(element, state) {
  element.classList.remove("primary", "warning", "critical");
  if (state === "ok") {
    element.classList.add("primary");
    return;
  }
  element.classList.add(state === "warning" ? "warning" : "critical");
}

function applyRowState(element, state) {
  element.classList.remove("warning", "critical");
  if (state !== "ok") {
    element.classList.add(state === "warning" ? "warning" : "critical");
  }
}

function renderHealth(payload) {
  const { overall, database, device } = payload;

  elements.generatedAt.textContent = `Guncel: ${payload.generated_at}`;
  elements.overallState.textContent = overall.label;
  elements.overallMessage.textContent = overall.message;
  elements.deviceState.textContent = device.label;
  elements.deviceMessage.textContent = device.message;
  elements.lastDeviceUpdate.textContent = device.last_update;
  elements.staleLimit.textContent = `${device.stale_minutes} dk limit`;
  elements.healthTagCount.textContent = device.tag_count;
  elements.databaseState.textContent = database.label;
  elements.databaseMessage.textContent = database.message;
  elements.collectorState.textContent = device.label;
  elements.collectorMessage.textContent = device.message;

  applyStateClass(elements.overallCard, overall.state);
  applyStateClass(elements.deviceCard, device.state);
  applyRowState(elements.databaseRow, database.state);
  applyRowState(elements.collectorRow, device.state);
}

async function loadHealth() {
  try {
    const response = await fetch("/api/health", { cache: "no-store" });
    const payload = await response.json();

    renderHealth(payload);

    if (!response.ok) {
      throw new Error(
        (payload.overall && payload.overall.message) || "Health verisi alinamadi"
      );
    }

    hideError();
  } catch (error) {
    showError(`Health hatasi: ${error.message}`);
  }
}

elements.refreshButton.addEventListener("click", loadHealth);

loadHealth();
setInterval(loadHealth, 5000);
