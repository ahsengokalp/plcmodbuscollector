import os


def _resolve_env_placeholder(value):
    if not isinstance(value, str):
        return value

    value = value.strip()
    if not (value.startswith("${") and value.endswith("}")):
        return value

    expression = value[2:-1]
    if ":-" in expression:
        name, fallback = expression.split(":-", 1)
    elif "-" in expression:
        name, fallback = expression.split("-", 1)
    else:
        return os.getenv(expression, "")

    resolved = os.getenv(name)
    if isinstance(resolved, str) and resolved.strip().startswith("${"):
        resolved = ""
    return fallback if resolved in (None, "") else resolved


def _env_int(name, default):
    value = os.getenv(name)
    value = _resolve_env_placeholder(value)
    return default if value in (None, "") else int(value)


def _env_str(name, default):
    value = _resolve_env_placeholder(os.getenv(name))
    return default if value in (None, "") else value


TAGS = [
    "F_1 GIRIS BIYET NO",
    "F_1 CIKIS BIYET NO",
    "F_1 BIYET HAM ISI",
    "F_1 BIYET PIK ISI",
    "F_1 BIYET ISINMA SURESI_DK",
    "F_1 BIYET ISINMA SURESI_SN",
    "F_1 V_YATAK GIRIS ISI",
    "F_1 V_YATAK CIKIS ISI",
    "F_1 V_YATAKDA BEKLEME SURESI_DK",
    "F_1 V_YATAKDA BEKLEME SURESI_SN",
    "F_2 GIRIS BIYET NO",
    "F_2 CIKIS BIYET NO",
    "F_2 BIYET HAM ISI",
    "F_2 BIYET PIK ISI",
    "F_2 BIYET ISINMA SURESI_DK",
    "F_2 BIYET ISINMA SURESI_SN",
    "F_2 V_YATAK GIRIS ISI",
    "F_2 V_YATAK CIKIS ISI",
    "F_2 V_YATAKDA BEKLEME SURESI_DK",
    "F_2 V_YATAKDA BEKLEME SURESI_SN",
    "FIRIN_1 ORTAM ISI",
    "FIRIN_2 ORTAM ISI",
    "FIRIN_1 ORTAM ISI TREND",
    "FIRIN_2 ORTAM ISI TREND",
]

MODBUS_HOST = _env_str("MODBUS_HOST", "172.16.48.185")
MODBUS_PORT = _env_int("MODBUS_PORT", 502)
MODBUS_DEVICE_ID = _env_int("MODBUS_DEVICE_ID", 1)
START_ADDRESS = _env_int("START_ADDRESS", 4506)
START_MODBUS_ADDRESS = _env_int("START_MODBUS_ADDRESS", 44507)
REGISTER_COUNT = _env_int("REGISTER_COUNT", 24)
POLL_INTERVAL_SECONDS = _env_int("POLL_INTERVAL_SECONDS", 1)

DB_HOST = _env_str("DB_HOST", "172.16.49.2")
DB_PORT = _env_int("DB_PORT", 5432)
DB_NAME = _env_str("DB_NAME", "modbus")
DB_USER = _env_str("DB_USER", "modbus_user")
DB_PASS = _env_str("DB_PASS", "0D6XdbKh7oH5p9T7")

DASHBOARD_HOST = _env_str("DASHBOARD_HOST", "0.0.0.0")
DASHBOARD_PORT = _env_int("DASHBOARD_PORT", 5059)
DASHBOARD_STALE_MINUTES = _env_int("DASHBOARD_STALE_MINUTES", 5)
WARN_VALUE_THRESHOLD = _env_int("WARN_VALUE_THRESHOLD", 500)
CRITICAL_VALUE_THRESHOLD = _env_int("CRITICAL_VALUE_THRESHOLD", 1000)
