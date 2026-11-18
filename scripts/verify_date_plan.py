import json
import sqlite3
from pathlib import Path
root=Path(__file__).resolve().parent.parent
normalized=json.loads((root/'data/history-reconciled.json').read_text(encoding='utf-8'))
plan=json.loads((root/'data/date-review-plan.json').read_text(encoding='utf-8'))
db=sqlite3.connect(':memory:')
db.executescript((root/'data/backups/before-date-review-20261027.sql').read_text(encoding='utf-8'))
db.execute('PRAGMA foreign_keys=ON')
assert db.execute('SELECT COUNT(*) FROM treatments').fetchone()[0]==981
original_dates=dict(db.execute('SELECT id,performed_on FROM treatments').fetchall())
original_clients=db.execute('SELECT id,full_name,phone,birthday,notes,archived_at FROM clients ORDER BY id').fetchall()
db.executescript((root/'migrations/0004_history_date_reconciliation.sql').read_text(encoding='utf-8'))
for repeat in range(2):
    for query in plan:db.execute(query['sql'],query.get('params',[]))
    assert db.execute('SELECT COUNT(*) FROM treatments').fetchone()[0]==len(normalized['events'])
    assert db.execute("SELECT COUNT(*) FROM import_issues WHERE status='pending'").fetchone()[0]==len(normalized['issues'])
    assert not db.execute('PRAGMA foreign_key_check').fetchall()
for identity,original in original_dates.items():
    assert db.execute('SELECT performed_on FROM treatments WHERE id=?',(identity,)).fetchone()[0]==original
assert original_clients==db.execute('SELECT id,full_name,phone,birthday,notes,archived_at FROM clients ORDER BY id').fetchall()
print(json.dumps({'idempotent':True,'foreignKeys':'ok','existingTreatmentsPreserved':len(original_dates),'clientProfilesPreserved':len(original_clients),'newTreatments':len(normalized['events'])}))
