const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const vm=require('node:vm');
const {test}=require('node:test');
const root=path.join(__dirname,'..');
const backend=fs.readFileSync(path.join(root,'apps-script/Libra.gs'),'utf8');
const row=(id,ddc,subjek,page,status='Disahkan',notes='')=>({id,nombor_ddc:ddc,kelas_utama:ddc[0]+'00',subjek,halaman_pdf:String(page),nama_sumber:'Ujian',status_semakan:status,nota_pengkelasan:notes});
const refs=[row('school','027.8','Perpustakaan Sekolah',5),row('law','130','Undang-undang',14,'Konflik'),row('psy','130','Psikologi',2),row('herbs','635','Tanaman kebun',28,'Disahkan','Termasuk herba'),row('plants','580','Sains tumbuhan',22),row('story','899.283','Fiksyen',38),row('malay','899.28','Kesusasteraan Melayu',38)];
function context(extra={}) {
  const ctx=vm.createContext({...extra});vm.runInContext(backend,ctx);return ctx;
}
const emptyProps={getProperty:()=>''};

test('authorisation, exact string codes, retrieval terms and conflict handling',()=>{
  const c=context({jErr:error=>({error})});c.libraCatalog=()=>refs;
  for(const role of [null,{peranan:'guru'},{peranan:'ahli'},{peranan:'opac'}])assert.match(c.libraDispatch('libra_search',{},role).error,/Admin\/GPM/);
  assert.equal(c.libraRank('027.8',refs)[0].row.nombor_ddc,'027.8');
  assert.equal(c.libraRank('fiksyen melayu',refs)[0].row.id,'story');
  assert.equal(c.libraSearch({query:'130'},emptyProps).total,2);
  assert.equal(c.libraAdvice({query:'130'},emptyProps).recommendation,null);
  assert.equal(c.libraAdvice({query:'herba'},emptyProps).recommendation,null);
  assert.match(c.libraAdvice({query:'apakah buku ini'},emptyProps).message,/Tiada padanan/);
  assert.equal(c.libraAdvice({query:'penanaman herba'},emptyProps).recommendation.nombor_ddc,'635');
});

test('Gemini receives only relevant evidence and its selected reference is validated',()=>{
  let sent, id='school';
  const c=context({UrlFetchApp:{fetch:(url,opts)=>{
    assert.ok(url.startsWith('https://generativelanguage.googleapis.com/'));
    assert.equal(opts.headers['x-goog-api-key'],'test-key');sent=JSON.parse(opts.payload);
    return {getResponseCode:()=>200,getContentText:()=>JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify({id,alasan:'Cadangan ujian',keyakinan:'Tinggi',halaman:999})}]}}]})};
  }}});
  c.libraCatalog=()=>refs;
  const props={getProperty:k=>({GEMINI_API_KEY:'test-key',LIBRA_GEMINI_MODEL:'gemini-test'})[k]};
  const result=c.libraAdvice({query:'perpustakaan sekolah murid@example.invalid'},props);
  assert.equal(result.method,'gemini');assert.equal(result.recommendation.halaman_pdf,'5');
  assert.doesNotMatch(JSON.stringify(sent),/murid@example\.invalid|test-key|Undang-undang/);
  id='nonexistent';assert.equal(c.libraAdvice({query:'027.8'},props).recommendation,null);
});

test('GPM review is explicit and updates only the DDC prefix; stale or unverified references cannot save',()=>{
  const book={id:'b01',judul:'Buku ujian',no_panggilan:'580/ALI/2019/Jilid 2',isbn:'9780000000000',no_perolehan:'0497'}, audit=[], writes=[];
  const sheet={getLastRow:()=>audit.length,appendRow:r=>audit.push([...r]),getRange:(r,i)=>({setValue:v=>audit[r-1][i-1]=v})};
  const c=context({findRecordByColumn:()=>book,isBukuAktifUntukStok:()=>true,LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},getSheet:()=>({}),updateRow:(s,k,id,p)=>{writes.push([k,id,Object.keys(p),p.no_panggilan]);book.no_panggilan=p.no_panggilan;return true;},invalidateCacheFor(){}});
  c.libraCatalog=()=>refs;c.libraWorkbook=()=>({getSheetByName:()=>sheet});
  const p={book_id:'b01',ref_id:'herbs',expected_call:book.no_panggilan,decision:'accept',confirmed:true};
  assert.throws(()=>c.libraReview({...p,confirmed:false},{peranan:'gpm'},emptyProps),/Pengesahan/);
  assert.throws(()=>c.libraReview({...p,ref_id:'law'},{peranan:'gpm'},emptyProps),/belum disahkan/);
  assert.throws(()=>c.libraReview({...p,expected_call:'111'},{peranan:'gpm'},emptyProps),/telah berubah/);
  for(const code of ['FM','FI','FC','FT'])assert.throws(()=>c.libraNewCall(`${code}/ALI`,'899.283'),/dikekalkan/);
  assert.equal(c.libraReview({...p,decision:'reject'},{peranan:'gpm'},emptyProps).changed,false);
  assert.equal(writes.length,0);
  assert.equal(c.libraReview(p,{peranan:'gpm'},emptyProps).no_panggilan,'635/ALI/2019/Jilid 2');
  assert.deepEqual(writes,[['buku','b01',['no_panggilan'],'635/ALI/2019/Jilid 2']]);
  assert.equal(book.no_perolehan,'0497');assert.equal(book.isbn,'9780000000000');
  assert.equal(audit[2][7],'Disimpan');
});

test('planner counts stock and lends only actual available titles, with no member data',()=>{
  const books=[{id:'1',judul:'Buku STEM',no_panggilan:'500/ABC'},{id:'2',judul:'Buku dipinjam',no_panggilan:'580/ABC'},
    {id:'3',judul:'Telah lupus',no_panggilan:'500/ABC',status:'Dilupuskan'},{id:'4',judul:'Fiksyen',no_panggilan:'FM/ABC'}];
  const c=context({bacaSheetRaw:key=>key==='buku'?books:[{buku_id:'2',status:'pinjam',nama:'private'}],isBukuAktifUntukStok:b=>b.status!=='Dilupuskan'});
  const result=c.libraPlan({class_code:'500'},emptyProps);
  assert.equal(result.koleksi_aktif,3);assert.equal(result.kelas_aktif,2);assert.equal(result.boleh_dipinjam,1);assert.equal(result.fiksyen_tempatan,1);
  assert.equal(result.buku[0].judul,'Buku STEM');assert.doesNotMatch(JSON.stringify(result),/private|Buku dipinjam|Telah lupus/);
});

test('local PDF catalog: eight exact codes, all pages, no duplicate IDs and flagged source errors',{skip:!process.env.LIBRA_LOCAL_CATALOG},()=>{
  const local=JSON.parse(fs.readFileSync(process.env.LIBRA_LOCAL_CATALOG,'utf8'));
  const catalog=local.rows.map(r=>Object.fromEntries(local.columns.map((k,i)=>[k,r[i]])));
  const c=context();c.libraCatalog=()=>catalog;
  assert.equal(local.qa.pages,45);assert.equal(new Set(catalog.map(r=>r.id)).size,catalog.length);
  assert.equal(new Set(catalog.flatMap(r=>r.halaman_pdf.split(', '))).size,45);
  for(const [code,page] of Object.entries({'027.8':'5','297.122':'8','428.6':'17','580':'22','635':'28','796.33':'36','899.283':'38','959.5214':'43'})) {
    const found=c.libraSearch({query:code},emptyProps).items;
    assert.ok(found.some(r=>r.nombor_ddc===code&&r.halaman_pdf.split(', ').includes(page)&&r.status_semakan==='Disahkan'),code);
  }
  assert.ok(catalog.some(r=>r.nombor_ddc==='130'&&r.halaman_pdf==='14'&&r.status_semakan==='Konflik'&&r.cadangan_pembetulan==='340'));
  assert.ok(catalog.some(r=>r.nombor_ddc==='961.1'&&r.status_semakan==='Konflik'));
  assert.ok(catalog.some(r=>r.nombor_ddc==='004.678'));
});

test('browser: launcher is private, lazy, and links advice, catalogue details and planner',{skip:!process.env.LIBRA_BROWSER_QA,timeout:45000},async()=>{
  const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
  const types={'/libra-launcher.js':'text/javascript','/libra.js':'text/javascript','/libra.css':'text/css','/libra-robot.webp':'image/webp'};
  const hits=[], actions=[];
  const server=http.createServer((req,res)=>{
    if(req.url==='/'){res.setHeader('content-type','text/html');return res.end('<!doctype html><meta charset="utf-8"><div id="lw">Login</div><script>const GAS="/gas",D={buku:[]};function toast(){};window._mR="opac";window._tok=null;</script><script defer src="/libra-launcher.js"></script>');}
    if(types[req.url]){hits.push(req.url);res.setHeader('content-type',types[req.url]);return res.end(fs.readFileSync(path.join(root,req.url.slice(1))));}
    if(req.url!=='/gas'){res.writeHead(404);return res.end();}
    let body='';req.on('data',b=>body+=b);req.on('end',()=>{const p=JSON.parse(body);actions.push(p.action);
      const data=({libra_status:{ready:true,ai:false},libra_advice:{recommendation:refs[0],book:null,candidates:[],reason:'Ujian',status:'CADANGAN AI — PERLU PENGESAHAN GPM',confidence:'Sederhana'},libra_search:{reference:refs[0]},libra_plan:{kelas:'500',koleksi_aktif:1,kelas_aktif:1,boleh_dipinjam:1,buku:[{judul:'Buku STEM',nombor_ddc:'500',pinjaman_direkod:0}]}})[p.action];
      res.setHeader('content-type','application/json');res.end(JSON.stringify({ok:!!data,data}));});
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
  try {
    browser=await chromium.launch({headless:true,...(process.env.SMARTLIB_CHROME?{executablePath:process.env.SMARTLIB_CHROME}:{})});
    const page=await browser.newPage(), errors=[];page.on('pageerror',err=>errors.push(err.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    assert.equal(await page.locator('#libra-launcher').count(),0);
    await page.evaluate(()=>{window._tok='test';window._mR='admin';document.getElementById('lw').style.display='none';});
    await page.locator('#libra-launcher').waitFor();assert.ok(!hits.includes('/libra.js'));
    await page.locator('#libra-launcher').click();
    await page.getByText('Katalog tersedia. Gemini belum dikonfigurasi.').waitFor();
    await page.locator('[name=query]').fill('027.8');await page.getByRole('button',{name:'Cadangkan DDC'}).click();
    await page.getByText('Ujian, halaman 5').waitFor();await page.getByRole('button',{name:'Lihat Rujukan'}).click();
    await page.getByRole('heading',{name:'Rujukan Katalog',exact:true}).waitFor();
    await page.locator('[data-mode]').selectOption('planner');await page.getByRole('button',{name:'Cadangkan Program'}).click();
    await page.getByText('Buku STEM · 500').waitFor();
    await page.getByRole('button',{name:'Tutup LIBRA'}).click();
    await page.evaluate(()=>{window._tok=null;window._mR='opac';document.getElementById('lw').style.display='block';});
    await page.locator('#libra-launcher').waitFor({state:'detached'});
    assert.deepEqual(actions,['libra_status','libra_advice','libra_search','libra_plan']);assert.deepEqual(errors,[]);
  } finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
});
