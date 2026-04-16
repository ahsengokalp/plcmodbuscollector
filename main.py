from collector import run_collector
from dashboard import run_dashboard
import argparse


def main():
    parser = argparse.ArgumentParser(description="PLC Modbus Collector launcher")
    parser.add_argument(
        "service",
        choices=("collector", "dashboard"),
        nargs="?",
        default="collector",
        help="Run collector service or dashboard web app. Default: collector",
    )
    args = parser.parse_args()

    if args.service == "dashboard":
        run_dashboard()
        return

    run_collector()


if __name__ == "__main__":
    main()
