import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
const task=process.argv[2];
if(!['migrate','check','seed'].includes(task)||process.argv.length!==3){console.error('Usage: node scripts/db-local.mjs migrate|check|seed');process.exit(64);}
if(task==='seed') {
  const url=new URL(process.env.LOOPSWAP_LOCAL_URL??'http://127.0.0.1:8787');
  if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||!['http:','https:'].includes(url.protocol)||url.pathname!=='/'||url.username||url.password){console.error('Seeding is restricted to a local app origin. No hosted reset or seed command exists.');process.exit(64);}
  try {
    const response=await fetch(new URL('/api/demo/session',url),{method:'POST',headers:{Origin:url.origin,'Content-Type':'application/json'},body:JSON.stringify({memberId:'00000000-0000-4000-8000-000000000001'})});
    if(!response.ok){console.error(`Local demo initialization rejected (${response.status}). Check LOOPSWAP_MODE and migrations.`);process.exit(1);}
    console.log('Local demo initialized if empty. Existing records were preserved. Sign in from the browser to get your own session.');
  } catch {console.error('Local app unavailable. Start the local app, then run db:seed.');process.exit(1);}
} else {
  let config;
  try {config=JSON.parse(readFileSync('dist/server/wrangler.json','utf8'));} catch {console.error('Build the app before applying local migrations.');process.exit(1);}
  const db=config.d1_databases?.find(d=>d.binding==='DB');
  if(!db){console.error('The built app has no DB binding.');process.exit(1);}
  config.main=resolve('dist/server/index.js');
  config.assets={...config.assets,directory:resolve('dist/client')};
  db.migrations_dir=resolve('drizzle');
  mkdirSync('.sites-runtime',{recursive:true});
  const configPath=resolve('.sites-runtime/db-local.json');writeFileSync(configPath,JSON.stringify(config));
  const args=task==='migrate'?['d1','migrations','apply','DB']:['d1','execute','DB','--command','PRAGMA quick_check;'];
  const child=spawn(process.execPath,[resolve('node_modules/wrangler/bin/wrangler.js'),...args,'--local','--config',configPath,'--persist-to',resolve('.wrangler/state')],{stdio:'inherit',env:{...process.env,CI:'true'}});
  child.on('error',()=>{console.error('Could not start the local migration tool.');process.exit(1);});
  child.on('exit',code=>process.exit(code??1));
}
