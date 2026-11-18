import base64
import json
import re
import urllib.request
from html.parser import HTMLParser
from pathlib import Path
root=Path(__file__).resolve().parent.parent
css=urllib.request.urlopen(urllib.request.Request('https://fonts.googleapis.com/css2?family=Montserrat:wght@400..700&display=swap',headers={'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'})).read().decode()
fonts=re.findall(r'/\* latin \*/\s*(@font-face\s*\{[^}]+\})',css)
if not fonts:
    fonts=re.findall(r'(@font-face\s*\{[^}]+\})',css)[-1:]
for i,block in enumerate(fonts):
    url=re.search(r'url\(([^)]+)\)',block).group(1)
    ext='woff2' if 'woff2' in block else 'ttf'
    name=f'montserrat-{i}.{ext}'
    (root/'public/brand'/name).write_bytes(urllib.request.urlopen(url).read())
    block=block.replace(url,f'/brand/{name}')
    (root/'public/brand/fonts.css').write_text(block,encoding='utf-8')
p=json.loads((root/'artifacts/calendly-contacts-rea.json').read_text(encoding='utf-8-sig'))
s=p['normalized_result']['steps'][-1]['artifacts']
print('evidence',p['evidence_id'],'screenshot',s['screenshot']['state'])
html=s['dom'].get('value',{}).get('text','')
(root/'artifacts/calendly-contacts.html').write_text(html,encoding='utf-8')
shot=s['screenshot'].get('value',{})
print('screenshot_fields',list(shot))
class Images(HTMLParser):
    def handle_starttag(self,tag,attrs):
        if tag=='img':
            a=dict(attrs)
            if a.get('src') and ('contact' in (a.get('alt','')+a['src']).lower() or '35604380733079' in (a.get('alt','')+a['src'])): print('reference_image',a.get('alt',''),a['src'][:450])
Images().feed(html)
