# PLC Modbus Collector

PLC register degerlerini Modbus TCP ile okuyup PostgreSQL'e yazar ve Flask tabanli bir dashboard ile anlik izleme saglar.

## Calistirma

Collector ve dashboard birlikte:

```powershell
python main.py
```

veya acik sekilde:

```powershell
python main.py all
```

Sadece collector servisi:

```powershell
python main.py collector
```

Sadece dashboard:

```powershell
python main.py dashboard
```

Arayuz varsayilan olarak su adreste acilir:

```text
http://127.0.0.1:5059
```

## Dosya Yapisi

- `collector.py`: PLC/Modbus okuma ve degisimleri veritabanina yazma servisi.
- `dashboard.py`: Flask API ve web dashboard.
- `config.py`: `.env` ayarlari ve sabitler.
- `db.py`: Ortak PostgreSQL baglantisi.
- `templates/`: HTML sayfalari.
- `static/`: CSS ve JavaScript dosyalari.
- `main.py`: Collector ve dashboard icin tek giris dosyasi.
