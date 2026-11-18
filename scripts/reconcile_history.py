"""Prepare a reviewable, idempotent correction plan without mutating D1."""
import hashlib
import json
import sqlite3
from collections import Counter
from datetime import date,datetime
from pathlib import Path
import openpyxl
from history_dates import reconcile

ROOT=Path(__file__).resolve().parent.parent
SOURCE=ROOT.parent/'.codex-remote-attachments/01a17f0a-50b7-7350-80c0-314a6d0e4bb5/ce93c75e-9825-45d2-bad8-760b858c7d7e/1-HISTORIAL_CLIENTES_TOUCHE_ORDENADO.xlsx'
CUTOFF=date(2026,10,27)
POLICY='touche-date-review-2026-10-27-v1'
AUTHORIZATION='El usuario confirmó historial desde 2025 hasta el 27 de octubre de 2026 y pidió corregir las fechas.'

def scalar(value):return value.isoformat() if isinstance(value,(date,datetime)) else value
def identity(value):return hashlib.sha256(' '.join(str(value).strip().split()).upper().encode()).hexdigest()[:20]

def prepare():
    original=json.loads((ROOT/'data/history.json').read_text(encoding='utf-8'))
    digest=hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    assert digest==original['sourceSha256'],'The source Excel changed; review a new import explicitly.'
    old_issues={(x['sheet'],x['cell']):x for x in original['issues']}
    old_events={x['id']:x for x in original['events']}
    wb=openpyxl.load_workbook(SOURCE,read_only=True,data_only=True)
    events=[];revisions=[];resolved=[];pending=[];cells=0
    for sheet in list(wb)[2:-1]:
        rows=iter(sheet.values);headers=next(rows)
        for row_number,row in enumerate(rows,2):
            if not row or not row[0]:continue
            for col,value in enumerate(row[2:],2):
                if value is None or value=='':continue
                cells+=1
                cell=f'{openpyxl.utils.get_column_letter(col+1)}{row_number}'
                header=headers[col]
                parsed=reconcile(value,header,CUTOFF)
                source={'clientId':identity(row[0]),'name':str(row[0]).strip(),'service':str(row[1] or sheet.title).strip(),
                    'category':sheet.title,'sheet':sheet.title,'cell':cell,'raw':scalar(value),'header':scalar(header)}
                if parsed['error']:
                    original_issue=old_issues.get((sheet.title,cell),{})
                    pending.append({**source,'date':original_issue.get('date'),'reasons':[parsed['error']]})
                    continue
                notes=parsed['notes']
                for part,d in enumerate(parsed['dates'],1):
                    source_cell=cell if part==1 else f'{cell}#{part}'
                    record={**source,'id':f'{sheet.title}:{source_cell}','date':d,'cell':source_cell,
                        'originalCell':cell,'part':part,'resolution':' '.join(notes)}
                    events.append(record)
                    # Never silently alter an already-imported explicit date.
                    if record['id'] in old_events:assert old_events[record['id']]['date']==d,(record['id'],d)
                if (sheet.title,cell) in old_issues:
                    item={**source,'dates':parsed['dates'],'rule':' '.join(notes),'reviewDate':CUTOFF.isoformat(),
                        'authorization':AUTHORIZATION,'importId':digest}
                    item['revisionId']=hashlib.sha256((POLICY+sheet.title+cell).encode()).hexdigest()
                    revisions.append(item);resolved.append((sheet.title,cell))
    wb.close()
    directory_issues=[x for x in original['issues'] if x['sheet']=='CLIENTAS']
    normalized={**original,'events':events,'issues':directory_issues+pending,'asOf':CUTOFF.isoformat(),
        'method':'Historial 2025-2026 reconciliado con autorización del usuario; valores fuente conservados.',
        'dateRevisions':revisions}
    summary={'policy':POLICY,'asOf':CUTOFF.isoformat(),'sourceCells':cells,'previousTreatments':len(old_events),'treatments':len(events),
        'addedTreatments':len(events)-len(old_events),'resolvedIssues':len(resolved),'pendingIssues':len(normalized['issues']),
        'byYear':dict(Counter(e['date'][:4] for e in events)),
        'visits':len({(e['clientId'],e['date']) for e in events}),'earliest':min(e['date'] for e in events),'latest':max(e['date'] for e in events)}
    assert cells==len(events)-sum(len(x['dates'])-1 for x in revisions)+len(pending)
    assert len(events)==len({e['id'] for e in events})
    queries=[]
    def bulk(sql,items):
        for start in range(0,len(items),60):queries.append({'sql':sql,'params':[json.dumps(items[start:start+60],ensure_ascii=False)]})
    items=[{**e,'importId':digest,'dbId':digest+':'+e['id']} for e in events if e['id'] not in old_events]
    bulk("""INSERT OR IGNORE INTO treatments(id,client_id,service_name,category,performed_on,import_id,source_sheet,source_cell,source_value,source_header,source_cell_original,source_part,date_resolution)
SELECT json_extract(value,'$.dbId'),json_extract(value,'$.clientId'),json_extract(value,'$.service'),json_extract(value,'$.category'),json_extract(value,'$.date'),json_extract(value,'$.importId'),json_extract(value,'$.sheet'),json_extract(value,'$.cell'),json_extract(value,'$.raw'),json_extract(value,'$.header'),json_extract(value,'$.originalCell'),json_extract(value,'$.part'),json_extract(value,'$.resolution') FROM json_each(?)""",items)
    bulk("""INSERT OR IGNORE INTO history_date_revisions(id,import_id,source_sheet,source_cell,original_value,original_header,dates_json,rule,authorization_note,review_date)
SELECT json_extract(value,'$.revisionId'),json_extract(value,'$.importId'),json_extract(value,'$.sheet'),json_extract(value,'$.cell'),json_extract(value,'$.raw'),json_extract(value,'$.header'),json_extract(value,'$.dates'),json_extract(value,'$.rule'),json_extract(value,'$.authorization'),json_extract(value,'$.reviewDate') FROM json_each(?)""",revisions)
    for item in revisions:
        queries.append({'sql':"UPDATE import_issues SET status='resolved',resolution_note=?,resolved_by=?,resolved_at=? WHERE import_id=? AND source_sheet=? AND source_cell=? AND status='pending'",'params':[
            item['rule']+' Fechas: '+', '.join(item['dates']),POLICY,CUTOFF.isoformat(),digest,item['sheet'],item['cell']]})
    for item in pending:
        queries.append({'sql':"UPDATE import_issues SET source_json=? WHERE import_id=? AND source_sheet=? AND source_cell=? AND status='pending'",'params':[json.dumps(item,ensure_ascii=False),digest,item['sheet'],item['cell']]})
    queries.append({'sql':'INSERT OR IGNORE INTO audit_log(id,actor,action,entity_type,entity_id,changes_json) VALUES (?,?,?,?,?,?)',
        'params':[POLICY,'administrator-request','reconcile-dates','import',digest,json.dumps(summary)]})
    (ROOT/'data/history-reconciled.json').write_text(json.dumps(normalized,ensure_ascii=False),encoding='utf-8')
    (ROOT/'data/date-review-plan.json').write_text(json.dumps(queries,ensure_ascii=False),encoding='utf-8')
    (ROOT/'data/date-review-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(summary,ensure_ascii=True))

if __name__=='__main__':prepare()
