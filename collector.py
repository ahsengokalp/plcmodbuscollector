from datetime import datetime
import time

from pymodbus.client import ModbusTcpClient

from config import (
    MODBUS_DEVICE_ID,
    MODBUS_HOST,
    MODBUS_PORT,
    POLL_INTERVAL_SECONDS,
    REGISTER_COUNT,
    START_ADDRESS,
    START_MODBUS_ADDRESS,
    TAGS,
)
from db import get_db_connection


def read_modbus_data():
    client = ModbusTcpClient(MODBUS_HOST, port=MODBUS_PORT)

    if not client.connect():
        print("Modbus connection failed")
        return None

    try:
        result = client.read_holding_registers(
            address=START_ADDRESS,
            count=REGISTER_COUNT,
            device_id=MODBUS_DEVICE_ID,
        )

        if result.isError():
            print("Modbus read error:", result)
            return None

        data = []
        for index, value in enumerate(result.registers):
            modbus_address = START_MODBUS_ADDRESS + index
            tag_name = TAGS[index]
            raw_value = int(value)
            data.append((modbus_address, tag_name, raw_value))

        return data

    except Exception as exc:
        print("Modbus exception:", exc)
        return None

    finally:
        client.close()


def load_current_values():
    conn = None
    cur = None
    current_values = {}

    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            """
            SELECT modbus_address, raw_value
            FROM plc_current_values
            """
        )

        for modbus_address, raw_value in cur.fetchall():
            current_values[modbus_address] = raw_value

    except Exception as exc:
        print("Current values could not be loaded:", exc)

    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()

    return current_values


def upsert_current_values(cur, data, now):
    query = """
        INSERT INTO plc_current_values (modbus_address, tag_name, raw_value, updated_at)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (modbus_address)
        DO UPDATE SET
            tag_name = EXCLUDED.tag_name,
            raw_value = EXCLUDED.raw_value,
            updated_at = EXCLUDED.updated_at
    """

    for modbus_address, tag_name, raw_value in data:
        cur.execute(query, (modbus_address, tag_name, raw_value, now))


def insert_initial_current_values(data):
    conn = None
    cur = None

    try:
        conn = get_db_connection()
        cur = conn.cursor()
        upsert_current_values(cur, data, datetime.now())
        conn.commit()
        print(f"Initial current load completed: {len(data)} records")

    except Exception as exc:
        print("Initial current load failed:", exc)
        if conn:
            conn.rollback()

    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


def process_changes(data, current_values):
    conn = None
    cur = None
    change_count = 0

    try:
        conn = get_db_connection()
        cur = conn.cursor()

        history_insert_query = """
            INSERT INTO plc_readings_history (
                modbus_address, tag_name, old_value, new_value, changed_at
            )
            VALUES (%s, %s, %s, %s, %s)
        """

        now = datetime.now()

        for modbus_address, tag_name, new_value in data:
            old_value = current_values.get(modbus_address)

            if old_value is None:
                upsert_current_values(cur, [(modbus_address, tag_name, new_value)], now)
                current_values[modbus_address] = new_value
                continue

            if new_value != old_value:
                cur.execute(
                    history_insert_query,
                    (modbus_address, tag_name, old_value, new_value, now),
                )
                upsert_current_values(cur, [(modbus_address, tag_name, new_value)], now)
                current_values[modbus_address] = new_value
                change_count += 1

        conn.commit()
        print(f"Changes saved: {change_count}" if change_count else "No change")

    except Exception as exc:
        print("Change processing failed:", exc)
        if conn:
            conn.rollback()

    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


def run_collector():
    print("Collector starting...")
    current_values = load_current_values()

    first_data = read_modbus_data()
    if first_data is None:
        print("First Modbus read failed. Collector stopped.")
        return

    if not current_values:
        print("Current table is empty. Loading first snapshot...")
        insert_initial_current_values(first_data)
        current_values = {
            modbus_address: raw_value
            for modbus_address, _, raw_value in first_data
        }
    else:
        print("Current values loaded from database.")

    while True:
        data = read_modbus_data()
        if data is not None:
            process_changes(data, current_values)
        else:
            print("No data read in this cycle.")

        time.sleep(POLL_INTERVAL_SECONDS)


if __name__ == "__main__":
    run_collector()
