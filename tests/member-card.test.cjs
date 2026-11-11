const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const vm=require('node:vm');
const {test}=require('node:test');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const studentEmails=['murid.satu@example.invalid',
  'muhammad.abdul.rahman.iskandar.syah.bin.abdul.muhaimin@pusat-sumber.sekolah-pendidikan-khas.example.invalid',
  '',...Array.from({length:5},(_,i)=>`murid.${i+4}@example.invalid`)];

test('card uses official logo, member number, category and real expiry only',()=>{
  const start=html.indexOf('function pgKadAhli(){');
  const end=html.indexOf('function cetakKadTerus',start);
  const ctx={_tok:'test-session',_mR:'admin',escapeHtml:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;')};
  vm.createContext(ctx);
  vm.runInContext(html.slice(start,end),ctx);
  const student=ctx.genKadPrintHTML({id:1,nama:'Nama <Ujian>',nokad:'050101-01-5001',tingkatan:'Tahun 2',sah_hingga:'2026-12-31'},'murid','PSS','');
  assert.match(student,/smartlib-logo-official\.png/);
  assert.match(student,/Nama &lt;Ujian>/);
  assert.match(student,/PELAJAR/);
  assert.match(student,/data-bc="M-01"/);
  assert.match(student,/31 Disember 2026/);
  assert.doesNotMatch(student,/050101|undefined|null/);
  assert.match(ctx.genKadPrintHTML({id:2,no_ahli:'G-103'},'guru','',''),/data-bc="G-103"/);
  const staff=ctx.genKadPrintHTML({id:3,jawatan:'Pembantu Pengurusan Murid'},'guru','','');
  assert.match(staff,/STAF/);
  assert.doesNotMatch(staff,/Sah Hingga|GURU/);
  assert.match(ctx.genKadPrintHTML({id:4,no_ahli:'050101015001'},'staf','',''),/data-bc="G-04"/);
});

test('student email is escaped, in the expected row, and limited to signed-in card operators',()=>{
  const start=html.indexOf('function pgKadAhli(){');
  const end=html.indexOf('function cetakKadTerus',start);
  const ctx={_tok:'test-session',_mR:'admin',escapeHtml:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;')};
  vm.createContext(ctx);
  vm.runInContext(html.slice(start,end),ctx);
  const student={id:1,tingkatan:'Tahun 2',sah_hingga:'2026-12-31',email:'  <murid@example.invalid>  '};
  const render=(a=student,jenis='murid')=>ctx.genKadPrintHTML(a,jenis,'PSS','');
  assert.match(render(),/<dt>Kelas<\/dt>.*<dt>E-mel<\/dt><dd class="member-card-email">&lt;murid@example.invalid>.*<dt>Sah Hingga<\/dt>/);
  assert.match(render(),/data-bc="M-01"/);
  for(const email of ['',null,undefined,'   '])assert.doesNotMatch(render({...student,email}),/E-mel|undefined|null/);
  for(const jenis of ['guru','staf'])assert.doesNotMatch(render(student,jenis),/E-mel|example\.invalid/);
  for(const role of ['opac','ahli','']){
    ctx._mR=role;assert.doesNotMatch(render(),/E-mel|example\.invalid/);
  }
  ctx._mR='admin';ctx._tok=null;
  assert.doesNotMatch(render(),/E-mel|example\.invalid/);
});

test('browser: selected members, CODE128, PDF, and loan scanner lookup',{
  skip:!process.env.SMARTLIB_CARD_BROWSER_QA,timeout:90000
},async()=>{
  const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
  const output=process.env.SMARTLIB_QA_OUTPUT;
  const server=http.createServer((req,res)=>{
    const filename=({'/':'index.html','/member-card.css':'member-card.css','/smartlib-logo-official.png':'smartlib-logo-official.png','/icon-192.png':'icon-192.png'})[req.url];
    if(!filename){res.writeHead(404);return res.end()}
    res.setHeader('Content-Type',({'html':'text/html; charset=utf-8','css':'text/css','png':'image/png'})[filename.split('.').pop()]);
    res.end(fs.readFileSync(path.join(root,filename)));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${server.address().port}/`;
  let browser;
  try{
    browser=await chromium.launch({headless:true,...(process.env.SMARTLIB_CHROME?{executablePath:process.env.SMARTLIB_CHROME}:{})});
    const context=await browser.newContext({viewport:{width:1000,height:1100}});
    await context.route('**/*',route=>{
      const target=route.request().url();
      if(target.startsWith(url))return route.continue();
      if(target.includes('/JsBarcode.all.min.js'))return route.fulfill({path:process.env.SMARTLIB_JSBARCODE,contentType:'application/javascript'});
      return route.fulfill({status:200,body:''});
    });
    await context.addInitScript(()=>{
      const add=document.addEventListener.bind(document);
      document.addEventListener=(type,...args)=>{if(type!=='DOMContentLoaded')add(type,...args)};
    });
    const page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(url);
    await page.evaluate(emails=>{
      window._tok=_tok='synthetic-session';window._mR=_mR='admin';
      prosesD({
        murid:emails.map((email,i)=>({id:i+1,email,nama:i===1?'Muhammad Abdul Rahman Iskandar Syah Bin Abdul Muhaimin Zulkarnain Shah Al-Hakim':i===0?'Muhammad Adam Bin Rizal':'Pelajar Ujian '+i,nokad:'050101-01-5001',tingkatan:'Tahun 2',sah_hingga:'2026-12-31'})),
        guru:[{id:1,no_ahli:'G-2026-A',nama:'Guru Ujian',email:'guru@example.invalid'},{id:2,nama:'Staf Dalam Guru',jawatan:'Pembantu Pengurusan Murid'}]
      });
      D.staf=[{id:3,no_ahli:'STAF-003',nama:'Staf Ujian',email:'staf@example.invalid'}];
      document.body.innerHTML='<div id="content"></div><div id="notif-dd"></div><div id="tbox"></div>';
      pgKadAhli();
    },studentEmails);
    await page.locator('#kad-sel').selectOption('murid|1');
    const card=page.locator('#kad-prev-wrap .smartlib-member-card');
    const size=await card.boundingBox();
    assert.ok(Math.abs(size.width*25.4/96-55)<.02);
    assert.ok(Math.abs(size.height*25.4/96-85)<.02);
    assert.equal(await card.locator('svg').getAttribute('data-bc'),'M-01');
    assert.ok(await card.locator('svg rect').count()>10);
    assert.equal(await card.locator('.member-card-email').textContent(),studentEmails[0]);
    await card.screenshot({path:path.join(output,'member-card.png'),scale:'css'});
    await page.locator('#kad-sel').selectOption('murid|2');
    assert.equal(await card.locator('.member-card-email').textContent(),studentEmails[1]);
    await card.screenshot({path:path.join(output,'member-card-long-email.png'),scale:'css'});
    const individualEvent=page.waitForEvent('popup',{timeout:12000});
    await page.getByRole('button',{name:'Cetak Kad Dipilih'}).click();
    const individual=await individualEvent;
    await individual.waitForFunction(()=>document.getElementById('card-print-now')?.disabled===false);
    assert.equal(await individual.locator('.member-card-email').textContent(),studentEmails[1]);
    assert.equal(await individual.locator('.member-card-barcode').getAttribute('data-bc'),'M-02');
    await individual.close();
    await page.locator('#kad-sel').selectOption('murid|3');
    assert.equal(await card.locator('.member-card-email').count(),0);
    const checks=page.locator('.kad-chk');
    for(const check of await checks.all())await check.check();
    assert.equal(await page.locator('.kad-chk:checked').count(),11);
    const popupEvent=page.waitForEvent('popup',{timeout:12000});
    await page.getByRole('button',{name:'Cetak Ditandakan'}).click();
    const preview=await popupEvent;
    preview.on('pageerror',e=>errors.push(e.message));
    await preview.waitForFunction(()=>document.getElementById('card-print-now')?.disabled===false,{},{timeout:6000}).catch(async e=>{
      throw new Error(`${e.message}; ${await preview.locator('#card-print-instructions').textContent()}; ${errors.join(', ')}`);
    });
    assert.deepEqual(await preview.locator('.member-card-print-grid').evaluateAll(rows=>rows.map(r=>r.children.length)),[9,2]);
    assert.deepEqual(await preview.locator('.member-card-type').allTextContents(),[...Array(8).fill('PELAJAR'),'GURU','STAF','STAF']);
    assert.equal(await preview.locator('.member-card-barcode').count(),11);
    const cards=await preview.locator('.smartlib-member-card').evaluateAll(cards=>cards.map(c=>{
      const name=c.querySelector('.member-card-name span'),box=name.parentElement,meta=c.querySelector('.member-card-meta'),scan=c.querySelector('.member-card-scan');
      const email=c.querySelector('.member-card-email'),barcode=c.querySelector('svg');
      const emailRow=email?.parentElement;
      return {code:barcode.dataset.bc,email:email?.textContent||'',emailFits:!emailRow||emailRow.scrollWidth<=emailRow.clientWidth,lines:name.getBoundingClientRect().height/parseFloat(getComputedStyle(name).lineHeight),width:c.getBoundingClientRect().width,height:c.getBoundingClientRect().height,barcodeHeight:barcode.getBoundingClientRect().height,metaBottom:meta.getBoundingClientRect().bottom,scanTop:scan.getBoundingClientRect().top,nameBottom:name.getBoundingClientRect().bottom,boxBottom:box.getBoundingClientRect().bottom};
    }));
    for(const c of cards){assert.ok(c.lines<=3.05,c.code);assert.ok(c.nameBottom<c.boxBottom,c.code);assert.ok(c.metaBottom<c.scanTop,`${c.code}: metadata ${c.metaBottom}, barcode ${c.scanTop}`);assert.ok(c.emailFits,c.code);assert.ok(Math.abs(c.width*25.4/96-55)<.02,c.code);assert.ok(Math.abs(c.height*25.4/96-85)<.02,c.code);assert.ok(Math.abs(c.barcodeHeight*25.4/96-7.8)<.02,c.code)}
    assert.deepEqual(cards.map(c=>c.email),[...studentEmails,'','','']);
    assert.deepEqual(cards.map(c=>c.code),[...studentEmails.map((_,i)=>`M-0${i+1}`),'G-2026-A','G-02','STAF-003']);
    await preview.pdf({path:path.join(output,'member-cards-a4.pdf'),printBackground:true,preferCSSPageSize:true});
    const found=await page.evaluate(codes=>codes.map(code=>window.prosesBarcodeAhliPinjaman(code)),cards.map(c=>c.code));
    assert.ok(found.every(Boolean));
    assert.deepEqual(errors,[]);
  }finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}
});
