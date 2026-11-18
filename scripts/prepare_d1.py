"""Prepare parameterized D1 requests; never print personal data by default."""
import hashlib
import json
import sqlite3
from pathlib import Path

root=Path(__file__).resolve().parent.parent
data=json.loads((root/'data/history.json').read_text(encoding='utf-8'))
schema=(root/'migrations/0001_initial.sql').read_text(encoding='utf-8')
batch_id=data['sourceSha256']
queries=[{'sql':schema}]
queries.append({'sql':'INSERT OR IGNORE INTO import_batches(id,source_name,source_sha256,as_of) VALUES (?,?,?,?)',
    'params':[batch_id,data['source'],data['sourceSha256'],data['asOf']]})
def bulk(sql, rows):
    for start in range(0,len(rows),75):
        queries.append({'sql':sql,'params':[json.dumps(rows[start:start+75],ensure_ascii=False)]})
bulk("""INSERT OR IGNORE INTO clients(id,full_name,phone,birthday_raw,in_directory,source_json)
SELECT json_extract(value,'$.id'),json_extract(value,'$.name'),json_extract(value,'$.phone'),
json_extract(value,'$.birthdayRaw'),json_extract(value,'$.inDirectory'),json_extract(value,'$.sources') FROM json_each(?)""",data['clients'])
bulk("""INSERT OR IGNORE INTO services(id,name,category,price_cents,source_json)
SELECT json_extract(value,'$.id'),json_extract(value,'$.name'),json_extract(value,'$.category'),
json_extract(value,'$.priceCents'),json_extract(value,'$.source') FROM json_each(?)""",data['services'])
events=[{**row,'importId':batch_id,'dbId':batch_id+':'+row['id']} for row in data['events']]
bulk("""INSERT OR IGNORE INTO treatments(id,client_id,service_name,category,performed_on,import_id,source_sheet,source_cell,source_value,source_header)
SELECT json_extract(value,'$.dbId'),json_extract(value,'$.clientId'),json_extract(value,'$.service'),
json_extract(value,'$.category'),json_extract(value,'$.date'),json_extract(value,'$.importId'),
json_extract(value,'$.sheet'),json_extract(value,'$.cell'),json_extract(value,'$.raw'),json_extract(value,'$.header') FROM json_each(?)""",events)
issues=[{**row,'importId':batch_id,'dbId':hashlib.sha256((batch_id+':'+row['sheet']+':'+row['cell']+':'+str(i)).encode()).hexdigest()} for i,row in enumerate(data['issues'])]
bulk("""INSERT OR IGNORE INTO import_issues(id,import_id,client_id,source_sheet,source_cell,source_json)
SELECT json_extract(value,'$.dbId'),json_extract(value,'$.importId'),json_extract(value,'$.clientId'),
json_extract(value,'$.sheet'),json_extract(value,'$.cell'),value FROM json_each(?)""",issues)
for category in sorted({e['category'] for e in data['events']}):
    queries.append({'sql':'INSERT OR IGNORE INTO service_rules(category) VALUES (?)','params':[category]})
# Run the same migration and import twice in disposable SQLite to prove idempotency.
connection=sqlite3.connect(':memory:')
for attempt in range(2):
    for q in queries:
        if q.get('params') is None: connection.executescript(q['sql'])
        else: connection.execute(q['sql'],q['params'])
counts={table:connection.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0] for table in ['clients','services','treatments','import_issues','recorded_visits']}
assert counts['clients']==len(data['clients'])
assert counts['services']==len(data['services'])
assert counts['treatments']==len(events)
assert counts['import_issues']==len(issues)
assert not connection.execute('PRAGMA foreign_key_check').fetchall()
(root/'data/d1-queries.json').write_text(json.dumps(queries,ensure_ascii=False),encoding='utf-8')
print(json.dumps({'queries':len(queries),'counts':counts,'idempotent':True,'foreignKeys':'ok'}))
