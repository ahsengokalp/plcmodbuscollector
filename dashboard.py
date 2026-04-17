from datetime import datetime, timedelta

from flask import Flask, jsonify, render_template, request

from config import (
    CRITICAL_VALUE_THRESHOLD,
    DASHBOARD_HOST,
    DASHBOARD_PORT,
    DASHBOARD_STALE_MINUTES,
    WARN_VALUE_THRESHOLD,
)
from db import get_db_connection


app = Flask(__name__)
app.config["TEMPLATES_AUTO_RELOAD"] = True
app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0

FURNACE_FIELDS = {
    "giris_biyet_no": "GIRIS BIYET NO",
    "cikis_biyet_no": "CIKIS BIYET NO",
    "ham_isi": "BIYET HAM ISI",
    "pik_isi": "BIYET PIK ISI",
    "isinma_dk": "BIYET ISINMA SURESI_DK",
    "isinma_sn": "BIYET ISINMA SURESI_SN",
    "v_giris_isi": "V_YATAK GIRIS ISI",
    "v_cikis_isi": "V_YATAK CIKIS ISI",
    "v_yatak_dk": "V_YATAKDA BEKLEME SURESI_DK",
    "v_yatak_sn": "V_YATAKDA BEKLEME SURESI_SN",
}

FURNACES = {
    "f1": {"prefix": "F_1", "title": "F_1"},
    "f2": {"prefix": "F_2", "title": "F_2"},
}

THERMAL_HISTORY_TAGS = {
    "f1": {
        "title": "FIRIN_1 TERMAL VERI GECMISI",
        "tag_name": "FIRIN_1 ORTAM ISI",
        "value_label": "FIRIN_1 ORTAM ISI",
    },
    "f2": {
        "title": "FIRIN_2 TERMAL VERI GECMISI",
        "tag_name": "FIRIN_2 ORTAM ISI",
        "value_label": "FIRIN_2 ORTAM ISI",
    },
}

THERMAL_DASHBOARD_TAGS = {
    "f1": {
        "label": "FIRIN_1 YESIL",
        "tag_name": "FIRIN_1 ORTAM ISI TREND",
        "fallback_tag_name": "FIRIN_1 ORTAM ISI",
        "color": "#22c55e",
    },
    "f2": {
        "label": "FIRIN_2 TURUNCU TREND",
        "tag_name": "FIRIN_2 ORTAM ISI TREND",
        "fallback_tag_name": "FIRIN_2 ORTAM ISI",
        "color": "#f97316",
    },
}


@app.after_request
def add_no_cache_headers(response):
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response


def value_status(value):
    if value >= CRITICAL_VALUE_THRESHOLD:
        return "critical"
    if value >= WARN_VALUE_THRESHOLD:
        return "warning"
    return "ok"


def format_datetime(value):
    if value is None:
        return "-"
    return value.strftime("%d.%m.%Y %H:%M:%S")


def format_date(value):
    if value is None:
        return "-"
    return value.strftime("%d.%m.%Y")


def format_time(value):
    if value is None:
        return "-"
    return value.strftime("%H:%M:%S")


def tag_name(prefix, field_key):
    return f"{prefix} {FURNACE_FIELDS[field_key]}"


def fetch_current_values(cur):
    cur.execute(
        """
        SELECT modbus_address, tag_name, raw_value, updated_at
        FROM plc_current_values
        ORDER BY modbus_address
        """
    )

    values = []
    for modbus_address, tag_name, raw_value, updated_at in cur.fetchall():
        raw_value = int(raw_value)
        values.append(
            {
                "modbus_address": modbus_address,
                "tag_name": tag_name,
                "raw_value": raw_value,
                "updated_at": format_datetime(updated_at),
                "status": value_status(raw_value),
            }
        )

    return values


def fetch_furnace_current_values(cur, prefix):
    cur.execute(
        """
        SELECT tag_name, raw_value, updated_at
        FROM plc_current_values
        WHERE tag_name LIKE %s
        """,
        (f"{prefix} %",),
    )

    values = {}
    for full_tag_name, raw_value, updated_at in cur.fetchall():
        suffix = full_tag_name.replace(f"{prefix} ", "", 1)
        values[suffix] = {
            "value": int(raw_value),
            "updated_at": updated_at,
        }

    return values


def fetch_tag_change_rows(cur, full_tag_name, limit):
    cur.execute(
        """
        SELECT new_value, changed_at
        FROM plc_readings_history
        WHERE tag_name = %s
        ORDER BY changed_at DESC
        LIMIT %s
        """,
        (full_tag_name, limit),
    )
    return cur.fetchall()


def fetch_thermal_history_rows(cur, tag_name, limit):
    cur.execute(
        """
        SELECT new_value, changed_at
        FROM plc_readings_history
        WHERE tag_name = %s
        ORDER BY changed_at DESC
        LIMIT %s
        """,
        (tag_name, limit),
    )

    return [
        {
            "no": index,
            "date": format_date(changed_at),
            "time": format_time(changed_at),
            "value": int(value),
            "status": value_status(int(value)),
        }
        for index, (value, changed_at) in enumerate(cur.fetchall(), start=1)
    ]


def fetch_thermal_trend_rows(cur, tag_name, fallback_tag_name, limit):
    rows = fetch_tag_change_rows(cur, tag_name, limit)
    source_tag_name = tag_name

    if not rows:
        rows = fetch_tag_change_rows(cur, fallback_tag_name, limit)
        source_tag_name = fallback_tag_name

    points = [
        {
            "date": format_date(changed_at),
            "time": format_time(changed_at),
            "sort_key": changed_at.isoformat() if changed_at else "",
            "timestamp": format_datetime(changed_at),
            "value": int(value),
        }
        for value, changed_at in reversed(rows)
    ]

    return source_tag_name, points


def fetch_latest_tag_value_at(cur, full_tag_name, changed_at):
    cur.execute(
        """
        SELECT new_value
        FROM plc_readings_history
        WHERE tag_name = %s
          AND changed_at <= %s
        ORDER BY changed_at DESC
        LIMIT 1
        """,
        (full_tag_name, changed_at),
    )
    row = cur.fetchone()
    return int(row[0]) if row else 0


def build_furnace_history_rows(cur, prefix, limit=20):
    exit_tag = tag_name(prefix, "cikis_biyet_no")
    exit_changes = fetch_tag_change_rows(cur, exit_tag, limit)
    rows = []

    for cikis_biyet_no, changed_at in exit_changes:
        snapshot = {
            field_key: fetch_latest_tag_value_at(cur, tag_name(prefix, field_key), changed_at)
            for field_key in FURNACE_FIELDS
        }
        rows.append(
            {
                "date": format_date(changed_at),
                "time": format_time(changed_at),
                "cikis_biyet_no": int(cikis_biyet_no),
                "ham_isi": snapshot["ham_isi"],
                "pik_isi": snapshot["pik_isi"],
                "isinma_dk": snapshot["isinma_dk"],
                "isinma_sn": snapshot["isinma_sn"],
                "v_giris_isi": snapshot["v_giris_isi"],
                "v_cikis_isi": snapshot["v_cikis_isi"],
                "v_yatak_dk": snapshot["v_yatak_dk"],
                "v_yatak_sn": snapshot["v_yatak_sn"],
            }
        )

    return rows


def build_entry_history(cur, prefix, limit=8):
    entry_tag = tag_name(prefix, "giris_biyet_no")
    return [
        {
            "date": format_date(changed_at),
            "time": format_time(changed_at),
            "value": int(value),
        }
        for value, changed_at in fetch_tag_change_rows(cur, entry_tag, limit)
    ]


def newest_furnace_update(current_values):
    newest = None
    for item in current_values.values():
        updated_at = item["updated_at"]
        if updated_at is not None and (newest is None or updated_at > newest):
            newest = updated_at
    return newest


def build_furnace_payload(furnace_id):
    furnace = FURNACES[furnace_id]
    prefix = furnace["prefix"]

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            current_values = fetch_furnace_current_values(cur, prefix)
            rows = build_furnace_history_rows(cur, prefix)
            entry_history = build_entry_history(cur, prefix)

    last_update = newest_furnace_update(current_values)
    giris = current_values.get(FURNACE_FIELDS["giris_biyet_no"], {}).get("value", 0)
    cikis = current_values.get(FURNACE_FIELDS["cikis_biyet_no"], {}).get("value", 0)

    return {
        "generated_at": format_datetime(datetime.now()),
        "furnace": {
            "id": furnace_id,
            "title": furnace["title"],
        },
        "summary": {
            "giris_biyet_no": giris,
            "cikis_biyet_no": cikis,
            "last_update": format_datetime(last_update),
        },
        "entry_history": entry_history,
        "rows": rows,
    }


def parse_history_limit():
    try:
        limit = int(request.args.get("limit", 50))
    except (TypeError, ValueError):
        limit = 50

    return min(max(limit, 10), 200)


def parse_trend_limit():
    try:
        limit = int(request.args.get("limit", 120))
    except (TypeError, ValueError):
        limit = 120

    return min(max(limit, 10), 500)


def build_history_payload(limit):
    histories = {}

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            for history_id, config in THERMAL_HISTORY_TAGS.items():
                rows = fetch_thermal_history_rows(cur, config["tag_name"], limit)
                histories[history_id] = {
                    "title": config["title"],
                    "tag_name": config["tag_name"],
                    "value_label": config["value_label"],
                    "latest_value": rows[0]["value"] if rows else "-",
                    "latest_time": (
                        f'{rows[0]["date"]} {rows[0]["time"]}' if rows else "-"
                    ),
                    "rows": rows,
                }

    return {
        "generated_at": format_datetime(datetime.now()),
        "limit": limit,
        "histories": histories,
    }


def build_thermal_dashboard_payload(limit):
    series = {}

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            for series_id, config in THERMAL_DASHBOARD_TAGS.items():
                source_tag_name, points = fetch_thermal_trend_rows(
                    cur,
                    config["tag_name"],
                    config["fallback_tag_name"],
                    limit,
                )
                latest = points[-1] if points else None
                series[series_id] = {
                    "label": config["label"],
                    "tag_name": source_tag_name,
                    "color": config["color"],
                    "latest_value": latest["value"] if latest else "-",
                    "latest_time": latest["timestamp"] if latest else "-",
                    "points": points,
                }

    return {
        "generated_at": format_datetime(datetime.now()),
        "limit": limit,
        "y_axis": {
            "min": 0,
            "max": 1000,
            "step": 125,
        },
        "series": series,
    }


def fetch_recent_changes(cur):
    cur.execute(
        """
        SELECT modbus_address, tag_name, old_value, new_value, changed_at
        FROM plc_readings_history
        ORDER BY changed_at DESC
        LIMIT 50
        """
    )

    changes = []
    for modbus_address, tag_name, old_value, new_value, changed_at in cur.fetchall():
        old_value = int(old_value)
        new_value = int(new_value)
        changes.append(
            {
                "modbus_address": modbus_address,
                "tag_name": tag_name,
                "old_value": old_value,
                "new_value": new_value,
                "delta": new_value - old_value,
                "changed_at": format_datetime(changed_at),
                "status": value_status(new_value),
            }
        )

    return changes


def fetch_changes_today(cur):
    cur.execute(
        """
        SELECT COUNT(*)
        FROM plc_readings_history
        WHERE changed_at >= CURRENT_DATE
        """
    )
    return int(cur.fetchone()[0])


def fetch_top_changed_tags(cur):
    cur.execute(
        """
        SELECT tag_name, COUNT(*) AS change_count
        FROM plc_readings_history
        WHERE changed_at >= CURRENT_DATE
        GROUP BY tag_name
        ORDER BY change_count DESC, tag_name ASC
        LIMIT 8
        """
    )

    return [
        {"tag_name": tag_name, "change_count": int(change_count)}
        for tag_name, change_count in cur.fetchall()
    ]


def build_recent_trend(recent_changes):
    return [
        {
            "label": item["changed_at"][11:16],
            "value": item["new_value"],
            "tag_name": item["tag_name"],
        }
        for item in reversed(recent_changes[:30])
    ]


def build_temperature_highlights(current_values):
    candidates = [
        item
        for item in current_values
        if "ISI" in item["tag_name"].upper() or "TREND" in item["tag_name"].upper()
    ]
    if not candidates:
        candidates = current_values

    return sorted(candidates, key=lambda item: item["raw_value"], reverse=True)[:8]


def newest_update(current_values):
    last_update = None
    for item in current_values:
        if item["updated_at"] == "-":
            continue

        parsed = datetime.strptime(item["updated_at"], "%d.%m.%Y %H:%M:%S")
        if last_update is None or parsed > last_update:
            last_update = parsed

    return last_update


def build_dashboard_payload():
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            current_values = fetch_current_values(cur)
            recent_changes = fetch_recent_changes(cur)
            changes_today = fetch_changes_today(cur)
            top_changed_tags = fetch_top_changed_tags(cur)

    last_update = newest_update(current_values)
    critical_count = sum(1 for item in current_values if item["status"] == "critical")
    warning_count = sum(1 for item in current_values if item["status"] == "warning")
    ok_count = sum(1 for item in current_values if item["status"] == "ok")
    stale_limit = datetime.now() - timedelta(minutes=DASHBOARD_STALE_MINUTES)
    is_online = last_update is not None and last_update >= stale_limit

    return {
        "generated_at": format_datetime(datetime.now()),
        "stats": {
            "total_tags": len(current_values),
            "ok_count": ok_count,
            "warning_count": warning_count,
            "critical_count": critical_count,
            "changes_today": changes_today,
            "recent_change_count": len(recent_changes),
            "last_update": format_datetime(last_update),
            "connection_state": "Online" if is_online else "Beklemede",
        },
        "current_values": current_values,
        "recent_changes": recent_changes,
        "charts": {
            "trend": build_recent_trend(recent_changes),
            "top_changed_tags": top_changed_tags,
            "temperature_highlights": build_temperature_highlights(current_values),
            "status_distribution": [
                {"label": "Normal", "value": ok_count, "status": "ok"},
                {"label": "Uyari", "value": warning_count, "status": "warning"},
                {"label": "Kritik", "value": critical_count, "status": "critical"},
            ],
        },
        "thresholds": {
            "warning": WARN_VALUE_THRESHOLD,
            "critical": CRITICAL_VALUE_THRESHOLD,
            "stale_minutes": DASHBOARD_STALE_MINUTES,
        },
    }


def health_label(state):
    labels = {
        "ok": "OK",
        "warning": "UYARI",
        "critical": "HATA",
    }
    return labels.get(state, "BILINMIYOR")


def build_health_payload():
    now = datetime.now()

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            current_values = fetch_current_values(cur)

    last_update = newest_update(current_values)
    stale_limit = now - timedelta(minutes=DASHBOARD_STALE_MINUTES)

    if not current_values:
        device_state = "critical"
        device_message = "Cihazdan veri alinamadi; izlenen tag bulunmuyor."
    elif last_update is None:
        device_state = "critical"
        device_message = "Cihaz verisi geldi ancak son guncelleme zamani okunamadi."
    elif last_update < stale_limit:
        device_state = "critical"
        device_message = (
            f"Cihazdan {DASHBOARD_STALE_MINUTES} dakikadan uzun suredir yeni veri gelmiyor."
        )
    else:
        device_state = "ok"
        device_message = "Cihazdan veri akisi normal."

    overall_message = (
        "Sistem calisiyor; cihaz verisi guncel."
        if device_state == "ok"
        else "Cihaz kaynakli veri akisi kontrol edilmeli."
    )

    return {
        "generated_at": format_datetime(now),
        "overall": {
            "state": device_state,
            "label": health_label(device_state),
            "message": overall_message,
        },
        "database": {
            "state": "ok",
            "label": health_label("ok"),
            "message": "Veritabani baglantisi ve okuma sorgusu basarili.",
        },
        "device": {
            "state": device_state,
            "label": health_label(device_state),
            "message": device_message,
            "last_update": format_datetime(last_update),
            "stale_minutes": DASHBOARD_STALE_MINUTES,
            "tag_count": len(current_values),
        },
    }


def build_health_error_payload(error):
    message = f"Veritabani veya uygulama verisi okunamadi: {error}"
    return {
        "generated_at": format_datetime(datetime.now()),
        "overall": {
            "state": "critical",
            "label": health_label("critical"),
            "message": "Health kontrolu hata verdi.",
        },
        "database": {
            "state": "critical",
            "label": health_label("critical"),
            "message": message,
        },
        "device": {
            "state": "critical",
            "label": health_label("critical"),
            "message": "Veritabani okunamadigi icin cihaz verisi dogrulanamadi.",
            "last_update": "-",
            "stale_minutes": DASHBOARD_STALE_MINUTES,
            "tag_count": 0,
        },
    }


@app.route("/")
def dashboard_page():
    return render_template(
        "dashboard.html",
        asset_version=datetime.now().strftime("%Y%m%d%H%M%S"),
    )


@app.route("/dashboard")
def thermal_dashboard_page():
    return render_template(
        "thermal_dashboard.html",
        asset_version=datetime.now().strftime("%Y%m%d%H%M%S"),
    )


@app.route("/f1")
def furnace_one_page():
    return render_template(
        "furnace.html",
        furnace_id="f1",
        furnace_title="F_1",
        asset_version=datetime.now().strftime("%Y%m%d%H%M%S"),
    )


@app.route("/f2")
def furnace_two_page():
    return render_template(
        "furnace.html",
        furnace_id="f2",
        furnace_title="F_2",
        asset_version=datetime.now().strftime("%Y%m%d%H%M%S"),
    )


@app.route("/history")
def history_page():
    return render_template(
        "history.html",
        asset_version=datetime.now().strftime("%Y%m%d%H%M%S"),
    )


@app.route("/health")
def health_page():
    return render_template(
        "health.html",
        asset_version=datetime.now().strftime("%Y%m%d%H%M%S"),
    )


@app.route("/api/dashboard")
def dashboard_api():
    try:
        return jsonify(build_dashboard_payload())
    except Exception as exc:
        return (
            jsonify(
                {
                    "error": "Dashboard verisi alinamadi",
                    "detail": str(exc),
                    "generated_at": format_datetime(datetime.now()),
                }
            ),
            500,
        )


@app.route("/api/health")
def health_api():
    try:
        return jsonify(build_health_payload())
    except Exception as exc:
        return jsonify(build_health_error_payload(exc)), 503


@app.route("/api/thermal-dashboard")
def thermal_dashboard_api():
    try:
        return jsonify(build_thermal_dashboard_payload(parse_trend_limit()))
    except Exception as exc:
        return (
            jsonify(
                {
                    "error": "Dashboard trend verisi alinamadi",
                    "detail": str(exc),
                    "generated_at": format_datetime(datetime.now()),
                }
            ),
            500,
        )


@app.route("/api/furnace/<furnace_id>")
def furnace_api(furnace_id):
    furnace_id = furnace_id.lower()
    if furnace_id not in FURNACES:
        return jsonify({"error": "Firin bulunamadi"}), 404

    try:
        return jsonify(build_furnace_payload(furnace_id))
    except Exception as exc:
        return (
            jsonify(
                {
                    "error": "Firin verisi alinamadi",
                    "detail": str(exc),
                    "generated_at": format_datetime(datetime.now()),
                }
            ),
            500,
        )


@app.route("/api/history")
def history_api():
    try:
        return jsonify(build_history_payload(parse_history_limit()))
    except Exception as exc:
        return (
            jsonify(
                {
                    "error": "Veri gecmisi alinamadi",
                    "detail": str(exc),
                    "generated_at": format_datetime(datetime.now()),
                }
            ),
            500,
        )


def run_dashboard():
    app.run(
        host=DASHBOARD_HOST,
        port=DASHBOARD_PORT,
        debug=False,
        use_reloader=False,
    )


if __name__ == "__main__":
    run_dashboard()
