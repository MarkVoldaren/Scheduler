const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { once } = require('node:events');

test('JS/CSS revalidate, changed assets return new bytes, and HTML/API stay uncached', async t => {
  const root = path.resolve(__dirname, '../.cache');fs.mkdirSync(root,{recursive:true});
  const dir=fs.mkdtempSync(path.join(root,'asset-cache-'));
  for(const name of fs.readdirSync(path.resolve(__dirname,'..')).filter(name=>/\.(js|html|css)$/.test(name))) {
    fs.copyFileSync(path.resolve(__dirname,'..',name),path.join(dir,name));
  }
  let child;
  t.after(async()=>{if(child&&child.exitCode===null){const exited=once(child,'exit');child.kill();await exited;}fs.rmSync(dir,{recursive:true,force:true});});
  child=spawn(process.execPath,[path.join(dir,'server.js')],{windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,PORT:'0',HOST:'127.0.0.1',NODE_ENV:'test',DATA_DIR:path.join(dir,'data'),SQLITE_PATH:path.join(dir,'data/app.sqlite'),APP_PASSWORD:'cache-test',ADMIN_PASSWORD:'cache-admin',SESSION_SECRET:'cache-test-secret'}});
  const base=await new Promise((resolve,reject)=>{let log='';const timer=setTimeout(()=>reject(new Error(log)),8000);child.stdout.on('data',data=>{log+=data;const match=log.match(/http:\/\/127\.0\.0\.1:\d+/);if(match){clearTimeout(timer);resolve(match[0]);}});child.stderr.on('data',data=>{log+=data;});child.on('exit',()=>{clearTimeout(timer);reject(new Error(log));});});
  function get(route,headers={}) {return new Promise((resolve,reject)=>{http.get(base+route,{headers},res=>{let body='';res.on('data',chunk=>body+=chunk);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body}));}).on('error',reject);});}
  for(const asset of ['styles.css','request-client.js']) {
    const first=await get('/'+asset);assert.equal(first.status,200);assert.equal(first.headers['cache-control'],'no-cache');assert.ok(first.headers.etag);assert.ok(first.headers['last-modified']);
    assert.equal((await get('/'+asset,{'If-None-Match':first.headers.etag})).status,304);
    fs.appendFileSync(path.join(dir,asset),'\n/* cache validation change */\n');
    const changed=await get('/'+asset,{'If-None-Match':first.headers.etag});assert.equal(changed.status,200);assert.notEqual(changed.headers.etag,first.headers.etag);assert.notEqual(changed.body,first.body);
  }
  const html=await get('/');assert.match(html.headers['cache-control'],/no-store/);
  const login=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:'cache-test'})});
  const Cookie=login.headers.getSetCookie().map(item=>item.split(';')[0]).join('; ');
  for(const route of ['/api/session','/api/app-state','/api/people']) {
    const response=await get(route,{Cookie});assert.equal(response.status,200);assert.match(response.headers['cache-control'],/no-store/);
  }
  assert.equal((await get('/source-departments.js')).status,404);
});
