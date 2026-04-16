from pymodbus.client import ModbusTcpClient
from dotenv import load_dotenv
import psycopg2
import os
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

    print("Modbus bağlantısı başarılı ✅")

    try:
        result = client.read_holding_registers(
            address=4506,
            count=24,
            device_id=MODBUS_DEVICE_ID
        )

        if result.isError():
            print("Modbus okuma hatası:", result)
            return None

        data = []
        for i, value in enumerate(result.registers):
            modbus_address = 44507 + i
            tag_name = TAGS[i]
            data.append((modbus_address, tag_name, int(value)))

        return data

    finally:
        client.close()


def save_to_postgres(data):
    if not data:
        print("Kaydedilecek veri yok.")
        return

    conn = None
    cur = None

    try:
        conn = get_db_connection()
        cur = conn.cursor()

        insert_query = """
            INSERT INTO plc_readings (modbus_address, tag_name, raw_value, read_time)
            VALUES (%s, %s, %s, %s)
        """

        read_time = datetime.now()

        for modbus_address, tag_name, raw_value in data:
            cur.execute(insert_query, (modbus_address, tag_name, raw_value, read_time))

        conn.commit()
        print(f"{len(data)} kayıt veritabanına yazıldı ✅")

    except Exception as e:
        print("Veritabanı kayıt hatası:", e)
        if conn:
            conn.rollback()

    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


def main():
    data = read_modbus_data()

    if data:
        print("\nOkunan veriler:\n")
        for modbus_address, tag_name, raw_value in data:
            print(f"{modbus_address} | {tag_name} | {raw_value}")

        save_to_postgres(data)


if __name__ == "__main__":
    main()