
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const source=fs.readFileSync(path.join(root,'gateway.js'),'utf8');

function fixture(){
  const events={},calls=[],elements=new Map();
  const make=id=>{
    const listeners={};
    const element={id,hidden:false,style:{},dataset:{},value:'',type:'password',textContent:'',attrs:{},
      focus(){calls.push('focus:'+id);},scrollIntoView(){},
      setAttribute(key,value){this.attrs[key]=value;},
      addEventListener(type,callback){listeners[type]=callback;},
      querySelector(){return make(id==='l-admin'?'lu':'l-nokad');},
      querySelectorAll(){return[];},
      classList:{add(){},remove(){}},listeners};
    elements.set(id,element);return element;
  };
  for(const id of ['lw','gateway-access','gateway-forms','l-admin','l-ahli','lp','l-ahli-p','l-err-a','l-err-b','login-admin-tab','gateway-member'])make(id);
  const lw=elements.get('lw');lw.listeners=events;
  lw.addEventListener=(type,callback)=>{events[type]=callback;};
  const window={doLogin:kind=>calls.push('login:'+kind),masukOPAC:()=>calls.push('opac'),bukaTempahanAwam:()=>calls.push('booking'),showLogin:()=>calls.push('show')};
  const context=vm.createContext({window,document:{getElementById:id=>elements.get(id)}});
  const click=(action)=>events.click({target:{closest:selector=>selector==='[data-gateway-action]'?{dataset:{gatewayAction:action}}:null}});
  vm.runInContext(source,context);
  return {elements,calls,window,click,context,events};
}

test('Gateway navigation delegates once to existing public flows without startup API requests',()=>{
  const f=fixture();assert.deepEqual(f.calls,[]);
  f.click('opac');f.click('tempahan');assert.deepEqual(f.calls,['opac','booking']);
  vm.runInContext(source,f.context);
  f.click('opac');assert.deepEqual(f.calls,['opac','booking','opac']);
});

test('Only chosen login form opens, submit retains the correct auth action and return clears passwords',()=>{
  const f=fixture();const {elements,window,calls}=f;
  assert.equal(elements.get('gateway-forms').hidden,false);
  assert.equal(elements.get('l-admin').hidden,false);
  f.click('admin');
  assert.equal(elements.get('l-admin').hidden,false);
  assert.equal(elements.get('l-ahli').hidden,true);
  elements.get('l-admin').listeners.submit({preventDefault(){}});
  assert.equal(calls.filter(c=>c==='login:admin').length,1);
  elements.get('lp').value='synthetic-test-only';
  f.click('ahli');
  elements.get('l-ahli').listeners.submit({preventDefault(){}});
  assert.equal(calls.filter(c=>c==='login:ahli').length,1);
  window.showLogin();
  assert.equal(elements.get('gateway-forms').hidden,false);
  assert.equal(elements.get('l-admin').hidden,false);
  assert.equal(elements.get('gateway-access').hidden,false);
  assert.equal(elements.get('lp').value,'');
  assert.equal(elements.get('l-ahli-p').value,'');
});

test('Gateway separates two login tabs, quick access and the public demo without legacy tab injection',()=>{
  const gateway=html.slice(html.indexOf('<div class="lw gateway"'),html.indexOf('<!-- NOTIF -->'));
  assert.equal((gateway.match(/role="tab"/g)||[]).length,2);
  assert.equal((gateway.match(/data-gateway-action="opac"/g)||[]).length,1);
  assert.equal((gateway.match(/data-gateway-action="tempahan"/g)||[]).length,1);
  assert.match(gateway,/href="https:\/\/skpkt.github.io\/smartlibverse\/"/);
  assert.equal((gateway.match(/class="gateway-background"/g)||[]).length,1);
  assert.match(gateway,/srcset="\.\/assets\/hero\/smartlib-gateway-mobile.webp"/);
  assert.doesNotMatch(gateway,/src="\.\/smartlib-logo-official\.png"/);
  assert.doesNotMatch(gateway,/id="l-img"|class="l-tabs"/);
  assert.doesNotMatch(html,/function patchLoginTempahan|login-nilam-link" href/);
  const ids=[...html.matchAll(/\bid="([^"$\s{}<>]+)"/g)].map(m=>m[1]);
  for(const id of ['lw','login-admin-tab','gateway-member','l-admin','l-ahli','lp','lu'])assert.equal(ids.filter(x=>x===id).length,1,id);
});

test('Urbanist imports once, LIBRA inherits UI font and protected print fonts retain their dimensions',()=>{
  assert.equal((html.match(/fonts.googleapis.com\/css2\?family=Urbanist/g)||[]).length,1);
  assert.doesNotMatch(html,/Plus.Jakarta.Sans/);
  assert.match(html,/--fn:'Urbanist',system-ui,sans-serif/);
  assert.match(html,/font-family:"Times New Roman",serif/);
  assert.match(html,/--font-label:'Century Gothic'/);
  const card=fs.readFileSync(path.join(root,'member-card.css'),'utf8');
  assert.match(card,/width: 55mm/);assert.match(card,/height: 85mm/);
  const libra=fs.readFileSync(path.join(root,'libra.css'),'utf8');
  assert.match(libra,/var\(--fn,system-ui,sans-serif\)/);
  new vm.Script(source);
  for(const script of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(script[1]);
});
