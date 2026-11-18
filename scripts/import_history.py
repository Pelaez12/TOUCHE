"""Read-only Excel extraction. Ambiguous dates are retained but excluded."""
import argparse
import hashlib
import json
import re
from collections import Counter
from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo
import openpyxl

def key(value):
    return re.sub(r'\s+', ' ', str(value or '').strip()).upper()

def raw(value):
    return value.isoformat() if isinstance(value, (date, datetime)) else value

def extract(path, today):
    workbook = openpyxl.load_workbook(path, read_only=True, data_only=True)
    clients = {}
    issues = []
    def person(name):
        normalized = key(name)
        if normalized not in clients:
            clients[normalized] = {'id': hashlib.sha256(normalized.encode()).hexdigest()[:20],
                'name': str(name).strip(), 'phone': '', 'birthdayRaw': None, 'sources': [], 'inDirectory': False}
        return clients[normalized]
    for row_number, row in enumerate(workbook['CLIENTAS'].values, 1):
        if row_number == 1 or not row[0]:
            continue
        client = person(row[0])
        if client['inDirectory']:
            issues.append({'sheet': 'CLIENTAS', 'cell': f'A{row_number}', 'name': str(row[0]),
                'reasons': ['Nombre repetido en directorio; identidad pendiente de revisión'], 'clientId': client['id']})
        client['inDirectory'] = True
        client['sources'].append({'sheet': 'CLIENTAS', 'row': row_number})
        if len(row)>2 and row[2] and key(row[2]) != 'FALTA RELLENAR':
            client['birthdayRaw'] = str(raw(row[2]))
        phone = str(row[1] or '').strip()
        if phone and key(phone) != 'FALTA RELLENAR':
            if client['phone'] and client['phone'] != phone:
                issues.append({'sheet': 'CLIENTAS', 'cell': f'B{row_number}', 'name': str(row[0]),
                    'reasons': ['Teléfonos distintos para el mismo nombre'], 'clientId': client['id']})
            else:
                client['phone'] = phone
    events = []
    for sheet in list(workbook)[2:-1]:
        rows = iter(sheet.values)
        headers = next(rows)
        for row_number, row in enumerate(rows, 2):
            if not row or not row[0]:
                continue
            client = person(row[0])
            for col, value in enumerate(row[2:], 2):
                if value is None or value == '':
                    continue
                header = headers[col] if col < len(headers) else None
                cell = f'{openpyxl.utils.get_column_letter(col + 1)}{row_number}'
                reasons = []
                event_date = value.date() if isinstance(value, datetime) else value if isinstance(value, date) else None
                if not event_date:
                    reasons.append('Valor sin fecha Excel reconocida')
                elif isinstance(header, datetime):
                    if (event_date.year, event_date.month) != (header.year, header.month):
                        reasons.append('La fecha no coincide con el mes o año de la columna')
                elif isinstance(header, (int, float)) and int(header) == header and 1900 <= header <= 2100:
                    if event_date.year != int(header):
                        reasons.append('La fecha no coincide con el año de la columna')
                else:
                    reasons.append('Encabezado temporal sin interpretar')
                if event_date and event_date > today:
                    reasons.append('Fecha futura: no confirma una atención realizada')
                record = {'id': f'{sheet.title}:{cell}', 'clientId': client['id'],
                    'name': client['name'], 'service': str(row[1] or sheet.title).strip(),
                    'category': sheet.title, 'date': event_date.isoformat() if event_date else None,
                    'sheet': sheet.title, 'cell': cell, 'raw': raw(value), 'header': raw(header)}
                if reasons:
                    issues.append({**record, 'reasons': reasons})
                else:
                    events.append(record)
    services = []
    for row_number, row in enumerate(workbook['SERVICIOS'].values, 1):
        if row_number == 1 or len(row)<2 or not row[1]:
            continue
        services.append({'id': f'catalog-{row_number}', 'name': str(row[1]).strip(),
            'priceCents': round(row[2]*100) if len(row)>2 and isinstance(row[2],(float,int)) else None,
            'category': str(row[3] or '') if len(row)>3 else '',
            'source': {'sheet':'SERVICIOS','row':row_number}})
    workbook.close()
    return {'source': path.name, 'sourceSha256': hashlib.sha256(path.read_bytes()).hexdigest(),
        'asOf': today.isoformat(), 'clients': list(clients.values()), 'events': events, 'issues': issues, 'services': services,
        'method': 'Coincidencia por nombre, espacios y mayúsculas; sin uniones aproximadas. Fechas coherentes con encabezados. Visita = nombre y día únicos.'}

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source', type=Path)
    parser.add_argument('--output', type=Path, default=Path('data/history.json'))
    args = parser.parse_args()
    data = extract(args.source, datetime.now(ZoneInfo('America/Lima')).date())
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(data, ensure_ascii=False, default=str), encoding='utf-8')
    print(json.dumps({'clients': len(data['clients']), 'events': len(data['events']),
        'issues': len(data['issues']), 'asOf': data['asOf'], 'reasons': dict(Counter(reason for item in data['issues'] for reason in item['reasons']))}, ensure_ascii=True))
