from datetime import datetime, timedelta

from flask import Flask, jsonify, render_template

from config import (
    CRITICAL_VALUE_THRESHOLD,
    DASHBOARD_HOST,
    DASHBOARD_PORT,
    DASHBOARD_STALE_MINUTES,
    WARN_VALUE_THRESHOLD,
)
from db import get_db_connection


app = Flask(__name__)


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


@app.route("/")
def dashboard_page():
    return render_template("dashboard.html")


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


def run_dashboard():
    app.run(
        host=DASHBOARD_HOST,
        port=DASHBOARD_PORT,
        debug=False,
        use_reloader=False,
    )


if __name__ == "__main__":
    run_dashboard()
