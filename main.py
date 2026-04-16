import argparse
from threading import Thread

from collector import run_collector
from config import DASHBOARD_HOST, DASHBOARD_PORT
from dashboard import run_dashboard


def run_all():
    collector_thread = Thread(
        target=run_collector,
        name="plc-collector",
        daemon=True,
    )
    collector_thread.start()

    print(f"Dashboard starting at http://{DASHBOARD_HOST}:{DASHBOARD_PORT}")
    run_dashboard()


def main():
    parser = argparse.ArgumentParser(description="PLC Modbus Collector launcher")
    parser.add_argument(
        "service",
        choices=("all", "collector", "dashboard"),
        nargs="?",
        default="all",
        help="Run collector, dashboard, or both together. Default: all",
    )
    args = parser.parse_args()

    if args.service == "all":
        run_all()
        return

    if args.service == "dashboard":
        run_dashboard()
        return

    run_collector()


if __name__ == "__main__":
    main()
