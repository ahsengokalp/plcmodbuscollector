from datetime import datetime, timedelta, timezone

from config import APP_TIME_OFFSET_HOURS


DB_TZ = timezone.utc
APP_TZ = timezone(timedelta(hours=APP_TIME_OFFSET_HOURS))


def db_now():
    return datetime.now(DB_TZ).replace(tzinfo=None)


def app_now():
    return datetime.now(DB_TZ).astimezone(APP_TZ)


def db_to_app_time(value):
    if value is None:
        return None

    if value.tzinfo is None:
        value = value.replace(tzinfo=DB_TZ)
    else:
        value = value.astimezone(DB_TZ)

    return value.astimezone(APP_TZ)
