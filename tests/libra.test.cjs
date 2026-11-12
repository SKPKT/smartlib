const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const {test}=require('node:test');
const root=path.join(__dirname,'..');
const backend=fs.readFileSync(path.join(root,'apps-script/Libra.gs'),'utf8');
const plannerBackend=fs.readFileSync(path.join(root,'apps-script/LibraPlanner.gs'),'utf8');
const geminiBackend=fs.readFileSync(path.join(root,'apps-script/LibraGemini.gs'),'utf8');
const row=(id,ddc,subjek,page,status='Disahkan',notes='')=>({id,nombor_ddc:ddc,kelas_utama:ddc[0]+'00',subjek,halaman_pdf:String(page),nama_sumber:'Ujian',status_semakan:status,nota_pengkelasan:notes});
const refs=[row('school','027.8','Perpustakaan Sekolah',5),row('law','130','Undang-undang',14,'Konflik'),row('psy','130','Psikologi',2),row('herbs','635','Tanaman kebun',28,'Disahkan','Termasuk herba'),row('plants','580','Sains tumbuhan',22),row('story','899.283','Fiksyen',38),row('malay','899.28','Kesusasteraan Melayu',38)];
function context(extra={}) {
  const ctx=vm.createContext({...extra});vm.runInContext(backend+'\n'+plannerBackend+'\n'+geminiBackend,ctx);return ctx;
}
const emptyProps={getProperty:()=>''};
const aiProps={getProperty:k=>({GEMINI_API_KEY:'test-key',LIBRA_GEMINI_MODEL:'gemini-3.5-flash-lite'})[k]};
const response=(http,body)=>({getResponseCode:()=>http,getContentText:()=>typeof body==='string'?body:JSON.stringify(body)});
const output=value=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(value)}]}}]});
const plan={program_type:'Galakan Membaca',audience:'Semua Murid',needs:'Umum',duration:'Seminggu',budget:'Tiada Kos',count:'3'};

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
    assert.equal(opts.headers['x-goog-api-key'],'test-key');
    if(opts.method==='get')return response(200,{supportedGenerationMethods:['generateContent'],outputTokenLimit:65000});
    sent=JSON.parse(opts.payload);
    return response(200,output({id,alasan:'Cadangan ujian',keyakinan:'Tinggi',halaman:999}));
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

test('new planner provides distinct accessible programs, all sections and no default stock read',()=>{
  const c=context({bacaSheetRaw(){assert.fail('default planner read stock');}});
  for(const [n,request] of [[3,'tiga'],[5,'5'],[10,'sepuluh']]) {
    const data=c.libraPlanPrograms({...plan,instructions:`Cadangkan ${request} program untuk murid masalah pendengaran Tahun 1–3, tema komik.`},emptyProps);
    assert.equal(data.programs.length,n);assert.equal(new Set(data.programs.map(x=>x.name)).size,n);
    assert.equal(new Set(data.programs.map(x=>x.activities[1])).size,n);
    assert.equal(data.method,'template');assert.match(data.message,/tidak berdasarkan analisis data/);
    for(const p of data.programs){assert.equal(p.audience,'Tahun 1–3');assert.equal(p.needs,'Masalah Pendengaran');assert.equal(p.duration,'Seminggu');assert.ok(p.rationale&&p.objectives.length&&p.activities.length>=3&&p.resources.length&&p.indicators.length&&p.evaluation.length);assert.equal(p.budgetItems[0].amount,0);assert.match(p.activities.join(' '),/bahasa isyarat|sari kata/i);}
    assert.doesNotMatch(JSON.stringify(data),/Dewey|DDC|Fiksyen tempatan|rekod_pinjaman|koleksi_aktif/i);
  }
  assert.throws(()=>c.libraPlanPrograms({...plan,count:11},emptyProps),/1 hingga 10/);
  assert.throws(()=>c.libraPlanPrograms({...plan,budget:'Bajet Ditetapkan'},emptyProps),/had bajet/);
  const fixed=c.libraPlanPrograms({...plan,budget:'Bajet Ditetapkan',budget_limit:'7.30'},emptyProps);
  assert.ok(fixed.programs.every(p=>p.budgetItems[0].amount<=7.30));
});

test('planner uses its own Gemini prompt, excludes raw instructions and validates structured output',()=>{
  const c=context({bacaSheetRaw(){assert.fail('Gemini planner read stock');}});let sent, variant='ok';
  c.libraGemini=(props,instruction,evidence,schema)=>{
    sent={instruction,evidence,schema};
    const programs=Array.from({length:evidence.count},(_,i)=>({name:variant==='duplicate'?'Program sama':`Program inovatif ${i+1}`,rationale:variant==='ddc'?'Rujuk 025.55':'Aktiviti mesra MBPK',
      objectives:['Menjelaskan idea melalui gambar'],activities:[`Stesen visual ${i+1}`,'Bincang hasil dengan rakan'],resources:['Kad sedia ada'],budgetItems:[{item:'Kad',amount:variant==='expensive'?500:0}],indicators:['Sasaran 80% peserta selesai'],evaluation:['Senarai semak']}));
    return {programs:variant==='short'?programs.slice(1):programs};
  };
  const request={...plan,instructions:'Cadangkan lima program inovatif, komik dan bahasa isyarat.\nNama: Murid Rahsia\ne-mel: private@example.invalid'};
  assert.equal(c.libraPlanPrograms(request,aiProps).method,'gemini');
  assert.equal(sent.evidence.count,5);assert.match(sent.instruction,/Anda perancang program Pusat Sumber Sekolah/);
  assert.match(JSON.stringify(sent.evidence),/komik|bahasa isyarat/);assert.doesNotMatch(JSON.stringify(sent.evidence),/Rahsia|example|Nama|buku|pinjam/);
  assert.equal(sent.schema.programs.minItems,5);
  for(variant of ['duplicate','ddc','expensive','short']){
    const result=c.libraPlanPrograms(request,aiProps);assert.equal(result.method,'template',variant);assert.equal(result.gemini.code,'SCHEMA');assert.match(result.message,/Mod Templat/);
  }
});

test('status is passive, an explicit Admin probe verifies structured generation, and cache is tied to the key and model',()=>{
  let calls=0;
  const cached=new Map();
  const c=context({jOut:data=>({data}),jErr:error=>({error}),PropertiesService:{getScriptProperties:()=>aiProps},
    CacheService:{getScriptCache:()=>({get:k=>cached.get(k),put:(k,v,ttl)=>{assert.ok(ttl<=600);cached.set(k,v);}})},
    Utilities:{DigestAlgorithm:{SHA_256:0},computeDigest:(_,x)=>require('node:crypto').createHash('sha256').update(x).digest(),base64EncodeWebSafe:b=>b.toString('base64url')},
    UrlFetchApp:{fetch:(url,opts)=>{
      calls++;assert(!url.includes('test-key'));
      return opts.method==='get'?response(200,{supportedGenerationMethods:['generateContent']}):response(200,output({status:'ok'}));
    }}
  });
  c.libraRate=(_,action)=>assert.ok(['libra_status','libra_advice'].includes(action));
  assert.match(c.libraDispatch('libra_status',{check_gemini:true},null).error,/Admin\/GPM/);
  assert.equal(c.libraDispatch('libra_status',{}, {peranan:'admin'}).data.gemini.state,'configured');
  assert.equal(calls,0);
  const verified=c.libraDispatch('libra_status',{check_gemini:true},{peranan:'gpm'}).data;
  assert.equal(verified.gemini.state,'connected');assert(verified.planner);assert(!JSON.stringify(verified).includes('test-key'));
  assert.equal(c.libraGeminiStatus(aiProps,true).state,'connected');assert.equal(calls,2);
  assert.equal(c.libraGeminiStatus({getProperty:k=>k==='GEMINI_API_KEY'?'another-key':aiProps.getProperty(k)},false).state,'configured');
  assert.equal(c.libraGeminiStatus(emptyProps,true).code,'MISSING_KEY');
  assert.equal(c.libraGeminiStatus({getProperty:k=>k==='GEMINI_API_KEY'?'test-key':''},true).code,'MISSING_MODEL');
});

test('provider errors are classified and sanitized; malformed output alone gets a bounded retry',()=>{
  const cases=[
    [400,{error:{details:[{reason:'API_KEY_INVALID'}]}},'INVALID_KEY'],[400,{},'BAD_REQUEST'],
    [401,{},'ACCESS_DENIED'],[403,{},'ACCESS_DENIED'],[404,{},'MODEL_UNAVAILABLE'],
    [429,{error:{message:'RequestsPerMinute test-key'}},'RATE_LIMIT'],[429,{},'QUOTA'],
    [500,{},'SERVICE_UNAVAILABLE'],[503,{},'SERVICE_UNAVAILABLE'],[504,{},'TIMEOUT'],
    [200,'not JSON test-key','INVALID_JSON'],[200,{candidates:[{finishReason:'MAX_TOKENS'}]},'RESPONSE_INCOMPLETE'],
    [200,{promptFeedback:{blockReason:'SAFETY'}},'RESPONSE_BLOCKED'],[200,output({other:1}),'SCHEMA']
  ];
  for(const [http,body,code] of cases){
    let calls=0;
    const c=context({UrlFetchApp:{fetch:(_,options)=>options.method==='get'
      ? response(200,{supportedGenerationMethods:['generateContent']}) : (calls++,response(http,body))}});
    const result=c.libraGeminiAttempt(aiProps,'Ujian',{}, {status:{type:'STRING'}},{retry:true});
    assert.equal(result.ai.code,code);assert.equal(result.ai.state,'error');assert(!JSON.stringify(result).includes('test-key'));
    assert.equal(calls,['INVALID_JSON','RESPONSE_INCOMPLETE','SCHEMA'].includes(code)?2:1);
  }
  const timed=context({UrlFetchApp:{fetch(){throw Error('Request timed out test-key');}}});
  assert.equal(timed.libraGeminiStatus(aiProps,true).code,'TIMEOUT');
});

test('planner generates exactly 1–10 validated programs with the real transport contract',()=>{
  const c=context({UrlFetchApp:{fetch:(url,options)=>{
    if(options.method==='get')return response(200,{supportedGenerationMethods:['generateContent'],outputTokenLimit:65000});
    assert(url.endsWith(':generateContent'));
    const body=JSON.parse(options.payload), evidence=JSON.parse(body.contents[0].parts[0].text);
    assert.equal(body.generationConfig.responseMimeType,'application/json');
    assert.equal(body.generationConfig.responseSchema.properties.programs.type,'ARRAY');
    assert.equal(body.generationConfig.responseSchema.properties.programs.minItems,undefined);
    return response(200,output({programs:Array.from({length:evidence.count},(_,i)=>({name:'Program '+i,rationale:'Bacaan bersama',objectives:['Baca petikan'],activities:['Misi '+i,'Bincang dengan rakan'],resources:['Buku'],budgetItems:[{item:'Bahan tersedia',amount:0}],indicators:['Sasaran penyertaan'],evaluation:['Senarai semak']}))}));
  }}});
  for(let count=1;count<=10;count++){
    const result=c.libraPlanPrograms({...plan,count},aiProps);
    assert.equal(result.method,'gemini');assert.equal(result.programs.length,count);assert.equal(result.gemini.state,'connected');
  }
});

test('Dewey counts appear in a separate payload only when analysis is explicitly requested',()=>{
  let reads=0;
  const c=context({bacaSheetRaw(){reads++;return [{no_panggilan:'500/ABC'},{no_panggilan:'500/DEF',status:'Dilupuskan'},{no_panggilan:'FM/ABC'}];},isBukuAktifUntukStok:b=>b.status!=='Dilupuskan'});
  assert.equal(c.libraPlanPrograms({...plan,instructions:'Jangan sertakan analisis Dewey'},emptyProps).analysis,undefined);assert.equal(reads,0);
  const data=c.libraPlanPrograms({...plan,instructions:'Sertakan analisis Dewey'},emptyProps);
  assert.equal(reads,1);assert.equal(JSON.stringify(data.analysis),'[{"code":"500","active":1}]');assert.doesNotMatch(JSON.stringify(data.programs),/Dewey|DDC|500/);
});

test('legacy compatibility module matches the Apps Script templates',async()=>{
  execFileSync(process.execPath,[path.join(root,'tools/build-libra-planner-template.cjs'),'--check']);
  const js=fs.readFileSync(path.join(root,'libra-planner-template.js'),'utf8');
  const {makeCompatiblePlan}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
  const input={...plan,instructions:'Sepuluh program inklusif. Sertakan analisis Dewey.'};
  const local=makeCompatiblePlan(input), hosted=context().libraPlanPrograms(input,emptyProps);
  assert.equal(JSON.stringify(local.programs),JSON.stringify(hosted.programs));
  assert.match(local.message,/Backend Planner baharu belum aktif/);
  assert.equal(local.analysis,undefined);assert.match(local.analysisMessage,/tidak tersedia/);
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
  const types={'/libra-launcher.js':'text/javascript','/libra.js':'text/javascript','/libra-planner.js':'text/javascript','/libra-planner-template.js':'text/javascript','/libra.css':'text/css','/libra-robot.webp':'image/webp'};
  const hits=[], actions=[];let catalogue=true, legacy=false;
  const planner=context();
  const server=http.createServer((req,res)=>{
    if(req.url==='/'){res.setHeader('content-type','text/html');return res.end('<!doctype html><meta charset="utf-8"><div id="lw">Login</div><script>const GAS="/gas",D={buku:[]};function toast(){};window._mR="opac";window._tok=null;</script><script defer src="/libra-launcher.js"></script>');}
    if(types[req.url]){hits.push(req.url);res.setHeader('content-type',types[req.url]);return res.end(fs.readFileSync(path.join(root,req.url.slice(1))));}
    if(req.url!=='/gas'){res.writeHead(404);return res.end();}
    let body='';req.on('data',b=>body+=b);req.on('end',()=>{const p=JSON.parse(body);actions.push(p.action);
      if(p.action==='libra_plan'&&legacy){res.setHeader('content-type','application/json');return res.end(JSON.stringify({ok:false,error:'Ralat: Pilih kelas utama Dewey yang sah.'}));}
      const gemini={configured:true,model:'gemini-3.5-flash-lite',state:p.check_gemini?'connected':'configured'};
      const data=p.action==='libra_plan'?planner.libraPlanPrograms(p,emptyProps):({libra_status:{ready:catalogue,gemini},libra_advice:{recommendation:refs[0],book:null,candidates:[],reason:'Ujian',status:'CADANGAN AI — PERLU PENGESAHAN GPM',confidence:'Sederhana'},libra_search:{reference:refs[0]}})[p.action];
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
    await page.getByText(/Gemini dikonfigurasi.*sambungan belum disahkan/).waitFor();
    await page.getByRole('button',{name:'Uji sambungan Gemini'}).click();
    await page.getByText(/Gemini AI tersedia/).waitFor();
    await page.locator('[name=query]').fill('027.8');await page.getByRole('button',{name:'Cadangkan DDC'}).click();
    await page.getByText('Ujian, halaman 5').waitFor();await page.getByRole('button',{name:'Lihat Rujukan'}).click();
    await page.getByRole('heading',{name:'Rujukan Katalog',exact:true}).waitFor();
    await page.getByRole('button',{name:'Tutup LIBRA'}).click();catalogue=false;
    await page.locator('#libra-launcher').click();await page.getByText(/Katalog persendirian belum dikonfigurasi/).waitFor();
    await page.locator('[data-mode]').selectOption('planner');await page.getByText(/Gemini dikonfigurasi.*sambungan belum disahkan/).waitFor();
    assert.equal(await page.locator('[data-planner] [name=class_code]').count(),0);
    await page.locator('[name=needs]').selectOption('Masalah Pendengaran');
    await page.locator('[name=instructions]').fill('Cadangkan lima program inovatif.');
    await page.getByRole('button',{name:'Jana Program PSS'}).click();
    await page.locator('.libra-program-card').first().waitFor();
    assert.equal(await page.locator('.libra-program-card').count(),5);
    assert.match(await page.locator('[data-result]').textContent(),/Mod Templat.*GEMINI_API_KEY/);
    assert.doesNotMatch(await page.locator('[data-result]').textContent(),/DDC|Dewey|Kelas utama|Rekod buku/i);
    const first=page.locator('.libra-program-card').first(), second=page.locator('.libra-program-card').nth(1);
    await second.locator('summary').click();
    await second.getByRole('button',{name:'Jana Kertas Kerja'}).click();
    const draft=second.locator('.libra-draft textarea');const draftText=await draft.inputValue();
    assert.match(draftText,/KERTAS KERJA PROGRAM PSS|Studio Cerita Visual/);assert.doesNotMatch(draftText,/Jejak Misi/);
    for(const kind of ['Tentatif','Anggaran Bajet','KPI Program']){await second.getByRole('button',{name:'Jana '+kind}).click();assert.match(await draft.inputValue(),new RegExp(kind,'i'));}
    await second.getByRole('button',{name:'Jana Kertas Kerja'}).click();await draft.fill(draftText+'\nUjian pindaan penyelaras');
    const printEvent=page.waitForEvent('popup');await second.getByRole('button',{name:'Cetak Draf / PDF'}).click();
    const popup=await printEvent;assert.match(await popup.locator('pre').textContent(),/Ujian pindaan penyelaras/);await popup.close();
    assert.match(await first.locator('summary').textContent(),/Program 1/);
    for(const viewport of [{width:360,height:740},{width:393,height:430},{width:1280,height:800}]) {
      await page.setViewportSize(viewport);
      const dimensions=await page.locator('.libra-panel').evaluate(x=>{const b=x.getBoundingClientRect();const sc=x.querySelector('.libra-scroll');return {top:b.top,bottom:b.bottom,right:b.right,sw:sc.scrollWidth,cw:sc.clientWidth};});
      assert.ok(dimensions.top>=0&&dimensions.bottom<=viewport.height&&dimensions.right<=viewport.width&&dimensions.sw<=dimensions.cw+1,JSON.stringify({viewport,dimensions}));
    }
    assert.ok(!hits.includes('/libra-planner-template.js'));
    legacy=true;
    await page.locator('[name=instructions]').fill('Cadangkan tiga program mesra MBPK.');
    await page.getByRole('button',{name:'Jana Program PSS'}).click();
    await page.getByText(/Backend Planner baharu belum aktif/).waitFor();
    assert.equal(await page.locator('.libra-program-card').count(),3);
    assert.ok(hits.includes('/libra-planner-template.js'));
    await page.getByRole('button',{name:'Tutup LIBRA'}).click();
    await page.evaluate(()=>{window._tok=null;window._mR='opac';document.getElementById('lw').style.display='block';});
    await page.locator('#libra-launcher').waitFor({state:'detached'});
    assert.deepEqual(actions,['libra_status','libra_status','libra_advice','libra_search','libra_status','libra_plan','libra_plan']);assert.deepEqual(errors,[]);
  } finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
});
