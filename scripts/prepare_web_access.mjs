import {randomBytes,createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url),accessFile=new URL('.local/ACCESO_TOUCHE.txt',root);
let exists=false;try{await readFile(accessFile);exists=true;}catch(e){if(e.code!=='ENOENT')throw e;}
if(exists)throw Error('Ya existe la clave de acceso local. No reemplazarla ni reinicializar el acceso.');
const key=randomBytes(24).toString('base64url'),salt=randomBytes(24).toString('hex'),hash=createHash('sha256').update(salt+'\0'+key).digest('hex');
await writeFile(accessFile,'Touché · Acceso privado\n\nEnlace: https://touche-admin-api.fabrizziopelaez91.workers.dev/\nClave de acceso: '+key+'\n\nGuarda esta clave en un lugar privado. Permite administrar las clientas y la agenda.\n', {mode:0o600});
await writeFile(new URL('data/web-access-plan.json',root),JSON.stringify({sql:"INSERT INTO web_access_settings(id,key_hash,salt) VALUES ('admin',?,?)",params:[hash,salt]}));
console.log(JSON.stringify({prepared:true,credentialFile:'.local/ACCESO_TOUCHE.txt'}));
