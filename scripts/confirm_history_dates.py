"""Build the private plan for the user's two explicit date confirmations.

Reads the API snapshot made before this change; never edits the workbook.
"""
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parent.parent
snapshot=json.loads((ROOT/'data/backups/before-confirmed-dates-20261027.json').read_text(encoding='utf-8-sig'))
batch='2c380f564c32cfcfb1f166c63e6b5ed5635dd2e89d3f9dc8f4631ca4acd6b032'
policy='touche-confirmed-dates-20261027-v2'
queries=[]
for sheet,cell,confirmed in [('TINTE','M119','2026-10-05'),('TRATAMIENTO','D275','2026-06-12')]:
    issue=next(i for i in snapshot['issues'] if i['sheet']==sheet and i['cell']==cell)
    rule='Fecha confirmada expresamente por el usuario: '+confirmed+'. Día, mes y año aplicados sin inferencia automática.'
    queries.append({'sql':'''INSERT OR IGNORE INTO treatments(id,client_id,service_name,category,performed_on,import_id,source_sheet,source_cell,source_value,source_header,source_cell_original,source_part,date_resolution) VALUES (?,?,?,?,?,?,?,?,?,?,?,1,?)''',
        'params':[batch+':'+sheet+':'+cell,issue['clientId'],issue['service'],issue['category'],confirmed,batch,sheet,cell,issue['raw'],issue['header'],cell,rule]})
    queries.append({'sql':'''INSERT OR IGNORE INTO history_date_revisions(id,import_id,source_sheet,source_cell,original_value,original_header,dates_json,rule,authorization_note,review_date) VALUES (?,?,?,?,?,?,?,?,?,?)''',
        'params':[policy+':'+sheet+':'+cell,batch,sheet,cell,issue['raw'],issue['header'],json.dumps([confirmed]),rule,'Confirmación explícita del usuario en esta conversación; la segunda fecha se aclaró como 12 de junio de 2026.','2026-10-27']})
    queries.append({'sql':"UPDATE import_issues SET status='resolved',resolution_note=?,resolved_by=?,resolved_at='2026-10-27' WHERE import_id=? AND source_sheet=? AND source_cell=? AND status='pending'",'params':[rule,policy,batch,sheet,cell]})
for issue in [i for i in snapshot['issues'] if i['sheet']=='CLIENTAS']:
    # The importer already retained a single identity per exact name; only the
    # repeated source occurrence raised an issue. Keep that one ficha and visits.
    queries.append({'sql':"UPDATE import_issues SET status='dismissed',resolution_note=?,resolved_by=?,resolved_at='2026-10-27' WHERE id=? AND status='pending'",'params':['Usuario pidió eliminar repetidos. Verificado que existe una sola ficha con este nombre; se descarta la incidencia repetida del Excel y se conserva su historial.',policy,issue['dbId']]})
queries.append({'sql':'INSERT OR IGNORE INTO audit_log(id,actor,action,entity_type,entity_id,changes_json) VALUES (?,?,?,?,?,?)','params':[policy,'administrator-request','confirm-history-dates','import',batch,json.dumps({'confirmedDates':2,'duplicateSourceIssuesDismissed':2,'clientProfilesDeleted':0})]})
(ROOT/'data/confirmed-date-plan.json').write_text(json.dumps(queries,ensure_ascii=False),encoding='utf-8')
print(json.dumps({'queries':len(queries),'confirmed':2,'duplicateIssues':2}))
