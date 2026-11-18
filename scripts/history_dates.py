"""Date reconciliation authorized for Touché's 2025-2026 source history.

Never changes the Excel. Complete 2026 dates take precedence over their month
column; the annual 2025 column supplies its year. Unknown days stay unknown.
"""
import re
import unicodedata
from datetime import date, datetime

MONTHS={'ENE':1,'ENERO':1,'FEB':2,'FEBRERO':2,'MAR':3,'MARZO':3,
    'ABR':4,'ABRIL':4,'MAY':5,'MAYO':5,'JUN':6,'JUNIO':6,
    'JUL':7,'JULIO':7,'AGO':8,'AGOSTO':8,'SET':9,'SEP':9,'SEPT':9,'SEPTIEMBRE':9,'SETIEMBRE':9,
    'OCT':10,'OCTUBRE':10,'NOV':11,'NOVIEMBRE':11,'DIC':12,'DICIEMBRE':12}

def reconcile(value,header,cutoff,monthly_year=2026):
    notes=[]
    if isinstance(header,datetime):
        year,month=header.year,header.month
        if year==2020 and month==9 and monthly_year==2026:
            year=2026
            notes.append('Encabezado septiembre 2020 corregido a septiembre 2026 por la secuencia mensual de la hoja y el período confirmado.')
    elif isinstance(header,int) and header==2025:
        year,month=2025,None
    else:
        return {'dates':[],'notes':notes,'error':'Encabezado temporal no reconocido.'}
    try:
        if isinstance(value,(date,datetime)):
            current=value.date() if isinstance(value,datetime) else value
            if month is None and current.year!=2025:
                current=current.replace(year=2025)
                notes.append('Año fijado en 2025 según la columna anual confirmada por el usuario; día y mes conservados.')
            elif month is not None and (current.year,current.month)!=(year,month):
                notes.append('Se conserva la fecha completa guardada en Excel aunque esté ubicada en otra columna mensual.')
            dates=[current]
        elif isinstance(value,str):
            original=value.strip()
            source=''.join(c for c in unicodedata.normalize('NFD',original.upper()) if unicodedata.category(c)!='Mn')
            fixed=re.sub(r'\b0CT\b','OCT',source)
            if fixed!=source:notes.append('Abreviatura 0CT interpretada como OCT, sin cambiar el día.')
            source=fixed
            if month is None:
                match=re.fullmatch(r'(\d{1,2})\s*[/ .-]\s*(\d{1,2})',source)
                if match:
                    dates=[date(2025,int(match[2]),int(match[1]))]
                else:
                    match=re.fullmatch(r'(\d{1,2})\s+([A-Z]+)',source)
                    if not match or match[2] not in MONTHS:return {'dates':[],'notes':notes,'error':'Día o mes no reconocible en la columna 2025.'}
                    dates=[date(2025,MONTHS[match[2]],int(match[1]))]
                notes.append('Fecha textual interpretada con día y mes expresos y año 2025 de la columna.')
            else:
                match=re.fullmatch(r'(\d{1,2}(?:\s*,\s*\d{1,2})*)\s*([A-Z]+)?',source)
                if not match:return {'dates':[],'notes':notes,'error':'Texto sin día inequívoco; no se inventa una fecha.'}
                specified=MONTHS.get(match[2]) if match[2] else month
                if specified is None:return {'dates':[],'notes':notes,'error':'Mes textual no reconocido.'}
                dates=[date(year,specified,int(d.strip())) for d in match[1].split(',')]
                if len(set(dates))!=len(dates):return {'dates':[],'notes':notes,'error':'Días repetidos en la misma celda; confirmar antes de importar.'}
                notes.append('Días separados por comas convertidos en visitas distintas dentro del mes/año indicado.' if len(dates)>1 else 'Día y mes textuales convertidos a una fecha del año de la columna.')
                if specified!=month:notes.append('Se conserva el mes escrito expresamente en el texto, distinto de la columna.')
        else:
            return {'dates':[],'notes':notes,'error':'Valor sin fecha reconocible.'}
    except (ValueError,TypeError):
        return {'dates':[],'notes':notes,'error':'Día no válido para el mes y año; requiere revisión.'}
    if any(d<date(2025,1,1) or d>cutoff for d in dates):
        return {'dates':[],'notes':notes,'error':f'Fecha fuera de 2025-01-01 a {cutoff.isoformat()}; no se convierte una fecha futura en atención realizada.'}
    return {'dates':[d.isoformat() for d in dates],'notes':notes,'error':None}
