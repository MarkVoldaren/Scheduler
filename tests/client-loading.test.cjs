const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').resolve(__dirname,'../app.js'),'utf8');
function fn(name) { const match = source.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\}`)); assert.ok(match,name); return match[0]; }
const defer = () => { let resolve,reject; const promise=new Promise((a,b)=>{resolve=a;reject=b;}); return {promise,resolve,reject}; };

test('app-state shares only in-flight reads within a session and recovers after rejection', async () => {
  let calls=0, next=defer();
  const app=vm.createContext({state:{authGeneration:1},fetchJson(){calls++;return next.promise;}});
  vm.runInContext(fn('requestAppState'),app);
  const a=app.requestAppState(),b=app.requestAppState(); assert.equal(calls,1);
  next.reject(new Error('offline')); await Promise.all([assert.rejects(a,/offline/),assert.rejects(b,/offline/)]);
  next=defer(); const old=app.requestAppState(); app.state.authGeneration++;
  const newer=app.requestAppState(); assert.equal(calls,3);
  next.resolve({settings:{}}); await Promise.all([old,newer]);
  next=defer(); const fresh=app.requestAppState(); assert.equal(calls,4);next.resolve({});await fresh;
});

test('rapid navigation applies only latest destination and failure preserves current view and edits', async () => {
  let pending=defer(), leaves=0, lastStatus;
  const state={authenticated:true,authGeneration:1,currentView:'people',serverSettings:{draft:42}};
  const app=vm.createContext({state,peopleUI:{canLeave:()=>true,leave(){leaves++;}},
    refreshPeopleCapacity:()=>pending.promise,showAppStatus(message,retry){lastStatus={message,retry};},
    setCurrentView(s,v){s.currentView=v;},renderActiveSurface(){},closeMobileSidebar(){},refs:{},
    document:{querySelector:()=>({focus(){}})}});
  vm.runInContext(fn('switchView'),app);
  const a=app.switchView('capacity'),b=app.switchView('departments');pending.resolve();await Promise.all([a,b]);
  assert.equal(state.currentView,'departments');assert.equal(leaves,1);assert.deepEqual(state.serverSettings,{draft:42});
  pending=defer(); const failed=app.switchView('kpi');pending.reject(new Error('offline'));await failed;
  assert.equal(state.currentView,'departments');assert.match(lastStatus.message,/current view has been kept/);assert.equal(typeof lastStatus.retry,'function');
  pending=defer(); const retry=lastStatus.retry();pending.resolve();await retry;assert.equal(state.currentView,'kpi');
});

function loading(failure) {
  let renders=0,hoursApp;
  const state={authGeneration:1,authenticated:true,currentView:'sequencers',activeCsvMeta:{}};
  const appState={settings:{},peopleManHoursByDay:{},csvs:{workCenter:{originalName:'work'},pickList:{originalName:'pick'}}};
  const app=vm.createContext({state,refs:{},requestAppState:async()=>{if(failure==='app-state')throw new Error('offline');return appState;},
    fetchJson:async()=>{if(failure==='progress')throw new Error('offline');return [];},
    fetchText:async url=>{if(failure==='work'&&url.endsWith('work-center')||failure==='pick'&&url.endsWith('pick-list'))throw new Error('source unavailable');return 'csv';},
    applyServerOperationalSettings(){},showAppStatus(){},showSourceWarning(){},renderError(){},renderSharedChrome(){},renderPickListSurface(){},
    hydrateFromCsv(){renders++;},hydrateShippingCsv(){if(failure==='pick-parse')throw new Error('invalid optional CSV');},
    HoursUI:{async refresh(value){hoursApp=value;if(failure==='hours')throw new Error('optional failed');}},
  });
  vm.runInContext(fn('loadServerAppState'),app);
  return {app,appState,renders:()=>renders,hoursApp:()=>hoursApp};
}

test('startup isolates optional failures, reuses metadata and renders schedule once', async () => {
  for(const failure of ['progress','pick','pick-parse','hours',null]) {
    const setup=loading(failure);await setup.app.loadServerAppState();
    assert.equal(setup.app.state.appPhase,'ready');assert.equal(setup.renders(),1);
    assert.equal(setup.hoursApp(),setup.appState);
  }
  for(const failure of ['app-state','work']) {
    const setup=loading(failure);await setup.app.loadServerAppState();
    assert.equal(setup.app.state.appPhase,'failed');assert.equal(setup.app.state.authenticated,true);assert.equal(setup.renders(),0);
  }
});

test('late startup responses cannot hydrate after logout or a newer load', async () => {
  const setup=loading(null),next=defer(); setup.app.requestAppState=()=>next.promise;
  const pending=setup.app.loadServerAppState();setup.app.state.authGeneration++;
  next.resolve(setup.appState);await pending;assert.equal(setup.renders(),0);
  const one=defer(),two=defer();let calls=0;setup.app.requestAppState=()=>++calls===1?one.promise:two.promise;
  const old=setup.app.loadServerAppState(),fresh=setup.app.loadServerAppState();
  two.resolve(setup.appState);await fresh;one.resolve(setup.appState);await old;assert.equal(setup.renders(),1);
});

test('full-source retry preserves same-session admin settings, including after a failed load', async () => {
  const setup=loading(null);let replacements=0;
  setup.app.state.adminAuthenticated=true;
  setup.app.state.settingsLoadedGeneration=setup.app.state.authGeneration;
  setup.app.state.appPhase='failed';
  setup.app.applyServerOperationalSettings=()=>{replacements++;};
  await setup.app.loadServerAppState();assert.equal(replacements,0);
});

test('loaded Pick List remains accessible and placeholder controls are hidden', () => {
  let rendered;
  const app=vm.createContext({createPickListControls:()=>'<button>Controls</button>',createPickListSections:()=>'<p>Rows</p>',createPickListPlaceholderBoard:()=>'',createPickListUploadCard:()=>'',createFragment:value=>value});
  vm.runInContext(fn('renderPickList'),app);
  const refs={pickListRoot:{replaceChildren(value){rendered=value;}}};
  app.renderPickList(refs,{loaded:true});assert.match(rendered,/aria-hidden="false"/);
  app.renderPickList(refs,{loaded:false});assert.match(rendered,/aria-hidden="true"/);
});

test('hydration never queues admin writes and failed normalization leaves previous jobs intact', () => {
  let writes=0;
  const state={adminAuthenticated:true,usesServerSettings:true,serverSettings:{draft:42},jobs:['old']};
  const app=vm.createContext({state,refs:{},parseCsvMatrix:()=>[['WO #','Manufacturing Work Center','Hours Remaining','Operation Sequence','Status']],
    parseCsv:()=>[{}],isSchedulableRow:()=>true,buildJobs:()=>['new'],deriveWorkCenters:()=>['Cutting'],
    syncCapacities(){app.saveOperationalSetting('machineCapacities','key',{});},syncFlowLocations(){},
    ensureSelectedSchedulerCenter(){},ensureSelectedDepartmentViewerCenter(){},ensureSelectedKpiDepartmentGroup(){},renderSharedChrome(){},renderActiveSurface(){},
    queueServerSettingsSave(){writes++;},clonePlainObject:value=>value,
  });
  vm.runInContext([fn('hydrateFromCsv'),fn('saveOperationalSetting')].join('\n'),app);
  app.hydrateFromCsv('csv','source');assert.equal(writes,0);assert.deepEqual(state.serverSettings,{draft:42});assert.equal(state.suppressSettingsSave,false);
  app.buildJobs=()=>{throw new Error('Invalid source');};assert.throws(()=>app.hydrateFromCsv('csv','source'),/Invalid source/);assert.deepEqual(state.jobs,['new']);
});

test('uncertain Capacity save blocks autosave until reconciliation', async () => {
  let writes=0;const elements=new Map();
  const app=vm.createContext({state:{adminAuthenticated:true,usesServerSettings:true,authGeneration:1},
    fetchJson:async()=>{writes++;throw Object.assign(new Error('The save outcome is unknown.'),{outcomeUnknown:true});},getOperationalSettingsPayload:()=>({}),
    window:{clearTimeout(){},setTimeout(){throw new Error('Unexpected retry');}},SERVER_SETTINGS_SAVE_DELAY:350,
    document:{querySelector:key=>{if(!elements.has(key))elements.set(key,{});return elements.get(key);}},console:{error(){}}});
  vm.runInContext([fn('saveServerSettingsNow'),fn('queueServerSettingsSave')].join('\n'),app);
  await app.saveServerSettingsNow();app.queueServerSettingsSave();await app.saveServerSettingsNow();
  assert.equal(writes,1);assert.equal(app.state.settingsSaveUnknown,true);assert.equal(elements.get('#capacity-reconcile').hidden,false);
  assert.doesNotMatch(elements.get('#capacity-save-error').textContent,/not saved/);
});
