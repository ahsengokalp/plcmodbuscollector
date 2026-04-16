from pymodbus.client import ModbusTcpClient
from dotenv import load_dotenv
import psycopg2
import os
import time
from datetime import datetime

load_dotenv()

TAGS = [
    "F_1 GİRİŞ BİYET NO",
    "F_1 ÇIKIŞ BİYET NO",
    "F_1 BİYET HAM ISI",
    "F_1 BİYET PİK ISI",
    "F_1 BİYET ISINMA SÜRESİ_DK",
    "F_1 BİYET ISINMA SÜRESİ_SN",
    "F_1 V_YATAK GİRİŞ ISI",
    "F_1 V_YATAK ÇIKIŞ ISI",
    "F_1 V_YATAK'DA BEKLEME SÜRESİ_DK",
    "F_1 V_YATAKDA BEKLEME SÜRESİ_SN",
    "F_2 GİRİŞ BİYET NO",
    "F_2 ÇIKIŞ BİYET NO",
    "F_2 BİYET HAM ISI",
    "F_2 BİYET PİK ISI",
    "F_2 BİYET ISINMA SÜRESİ_DK",
    "F_2 BİYET ISINMA SÜRESİ_SN",
    "F_2 V_YATAK GİRİŞ ISI",
    "F_2 V_YATAK ÇIKIŞ ISI",
    "F_2 V_YATAK'DA BEKLEME SÜRESİ_DK",
    "F_2 V_YATAKDA BEKLEME SÜRESİ_SN",
    "FIRIN_1 ORTAM ISI",
    "FIRIN_2 ORTAM ISI",
    "FIRIN_1 ORTAM ISI TREND",
    "FIRIN_2 ORTAM ISI TREND",
]

MODBUS_HOST = os.getenv("MODBUS_HOST", "172.16.48.185")
MODBUS_PORT = int(os.getenv("MODBUS_PORT", 502))
MODBUS_DEVICE_ID = int(os.getenv("MODBUS_DEVICE_ID", 1))

DB_HOST = os.getenv("DB_HOST")
DB_PORT = int(os.getenv("DB_PORT", 5432))
DB_NAME = os.getenv("DB_NAME")
DB_USER = os.getenv("DB_USER")
DB_PASS = os.getenv("DB_PASS")

START_ADDRESS = 4506
START_MODBUS_ADDRESS = 44507
REGISTER_COUNT = 24
POLL_INTERVAL_SECONDS = 1


def get_db_connection():
    return psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        dbname=DB_NAME,
        user=DB_USER,
        password=DB_PASS
    )


def read_modbus_data():
    client = ModbusTcpClient(MODBUS_HOST, port=MODBUS_PORT)

    if not client.connect():
        print("Modbus bağlantısı başarısız ❌")
        return None

    try:
        result = client.read_holding_registers(
            address=START_ADDRESS,
            count=REGISTER_COUNT,
            device_id=MODBUS_DEVICE_ID
        )

        if result.isError():
            print("Modbus okuma hatası:", result)
            return None

        data = []
        for i, value in enumerate(result.registers):
            modbus_address = START_MODBUS_ADDRESS + i
            tag_name = TAGS[i]
            raw_value = int(value)
            data.append((modbus_address, tag_name, raw_value))

        return data

    except Exception as e:
        print("Modbus exception:", e)
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
        cur.execute("""
            SELECT modbus_address, raw_value
            FROM plc_current_values
        """)
        rows = cur.fetchall()

        for modbus_address, raw_value in rows:
            current_values[modbus_address] = raw_value

    except Exception as e:
        print("Current değerler yüklenemedi:", e)

    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()

    return current_values


def insert_initial_current_values(data):
    conn = None
    cur = None

    try:
        conn = get_db_connection()
        cur = conn.cursor()

        upsert_query = """
            INSERT INTO plc_current_values (modbus_address, tag_name, raw_value, updated_at)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (modbus_address)
            DO UPDATE SET
                tag_name = EXCLUDED.tag_name,
                raw_value = EXCLUDED.raw_value,
                updated_at = EXCLUDED.updated_at
        """

        now = datetime.now()

        for modbus_address, tag_name, raw_value in data:
            cur.execute(upsert_query, (modbus_address, tag_name, raw_value, now))

        conn.commit()
        print(f"İlk yükleme yapıldı: {len(data)} current kayıt ✅")

    except Exception as e:
        print("İlk current yükleme hatası:", e)
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

        current_upsert_query = """
            INSERT INTO plc_current_values (modbus_address, tag_name, raw_value, updated_at)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (modbus_address)
            DO UPDATE SET
                tag_name = EXCLUDED.tag_name,
                raw_value = EXCLUDED.raw_value,
                updated_at = EXCLUDED.updated_at
        """

        now = datetime.now()

        for modbus_address, tag_name, new_value in data:
            old_value = current_values.get(modbus_address)

            if old_value is None:
                cur.execute(
                    current_upsert_query,
                    (modbus_address, tag_name, new_value, now)
                )
                current_values[modbus_address] = new_value
                continue

            if new_value != old_value:
                cur.execute(
                    history_insert_query,
                    (modbus_address, tag_name, old_value, new_value, now)
                )

                cur.execute(
                    current_upsert_query,
                    (modbus_address, tag_name, new_value, now)
                )

                current_values[modbus_address] = new_value
                change_count += 1

        conn.commit()

        if change_count > 0:
            print(f"Değişiklik kaydedildi ✅ Adet: {change_count}")
        else:
            print("Değişiklik yok.")

    except Exception as e:
        print("Değişiklik işleme hatası:", e)
        if conn:
            conn.rollback()

    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


def main():
    print("Servis başlıyor...")

    current_values = load_current_values()

    first_data = read_modbus_data()
    if first_data is None:
        print("İlk Modbus verisi alınamadı. Servis durduruldu.")
        return

    if not current_values:
        print("Current tablo boş. İlk yükleme yapılıyor...")
        insert_initial_current_values(first_data)
        current_values = {modbus_address: raw_value for modbus_address, _, raw_value in first_data}
    else:
        print("Current değerler DB'den yüklendi.")

    while True:
        data = read_modbus_data()

        if data is not None:
            process_changes(data, current_values)
        else:
            print("Bu turda veri okunamadı.")

        time.sleep(POLL_INTERVAL_SECONDS)


if __name__ == "__main__":
    main()