import {plannerForm,renderPlanner} from './libra-planner.js';

const blank = 'Tiada padanan yang mencukupi dalam katalog rujukan.';
const e = (tag, text, className) => { const node=document.createElement(tag); if(text!=null)node.textContent=String(text);if(className)node.className=className;return node; };

export function createLibra(request, launcher) {
  const dialog=e('dialog',null,'libra-panel');
  dialog.setAttribute('aria-labelledby','libra-heading');
  dialog.innerHTML=`<header><img src="./libra-robot.webp" alt=""><div><strong id="libra-heading">LIBRA AI</strong><small>Pembantu Pusat Sumber Sekolah</small></div><button type="button" data-close aria-label="Tutup LIBRA">×</button></header>
    <div class="libra-scroll"><p data-status role="status" aria-live="polite"></p><div class="libra-actions"><button type="button" data-check-gemini hidden>Uji sambungan Gemini</button></div>
    <label>Fungsi <select data-mode><option value="advisor">LIBRA Dewey Advisor</option><option value="planner">LIBRA PSS Program Planner</option></select></label>
    <form data-advisor><label>Subjek, judul atau kod DDC <input name="query" maxlength="240" placeholder="Contoh: penanaman herba"></label>
    <label>ISBN (pilihan) <input name="isbn" maxlength="25" inputmode="numeric"></label>
    <label>Judul buku SMARTLIB <input name="book_query" maxlength="100" placeholder="Cari dan pilih rekod untuk semakan GPM"></label>
    <div data-books></div><p data-selected></p>
    <div class="libra-actions"><button type="button" data-find-book>Cari Buku</button><button type="button" data-search>Cari Rujukan</button><button type="submit">Cadangkan DDC</button></div></form>
    <form data-planner hidden>${plannerForm}</form>
    <section data-result aria-live="polite"></section><section data-ref aria-live="polite"></section></div>`;
  document.body.append(dialog);
  const $=selector=>dialog.querySelector(selector);
  const status=$('[data-status]'), result=$('[data-result]'), refs=$('[data-ref]'), advisor=$('[data-advisor]'), planner=$('[data-planner]');
  let selected=null, pending=null, ready=false, capabilities=null;
  const say=text=>{status.textContent=text;};
  const button=(label,handler,disabled=false)=>{const node=e('button',label);node.type='button';node.disabled=disabled;node.onclick=handler;return node;};
  function append(parent,tag,text) { const node=e(tag,text);parent.append(node);return node; }
  function fields(parent, entries) {
    const list=append(parent,'dl');
    for(const [label,text] of entries) {append(list,'dt',label);append(list,'dd',text||'—');}
  }
  async function run(action, payload, display, perform=request) {
    if (pending) return;
    const work=new AbortController();pending=work;say('Sedang memuatkan…');
    dialog.setAttribute('aria-busy','true');
    try { const data=await perform(action,payload,work.signal);if(!work.signal.aborted && dialog.open){say('');display(data);} }
    catch(error) { if(!work.signal.aborted && dialog.open) say(error.message||'Permintaan LIBRA gagal.'); }
    finally { if(pending===work){pending=null;dialog.removeAttribute('aria-busy');} }
  }
  function showRef(ref) {
    run('libra_search',{ref_id:ref.id},data=>{
      const r=data.reference;refs.replaceChildren();append(refs,'h3','Rujukan Katalog');
      fields(refs,[['Kod',r.nombor_ddc],['Subjek',r.subjek],['Sumber',r.nama_sumber],['Halaman PDF',r.halaman_pdf],['Status semakan',r.status_semakan],['Penerangan',r.penerangan],['Nota pengelasan',r.nota_pengkelasan],['Rujukan silang',r.rujukan_silang],['Catatan',r.catatan],['Cadangan pembetulan',r.cadangan_pembetulan],['Nilai asal',r.nilai_asal]]);
      refs.scrollIntoView({block:'nearest'});
    });
  }
  function search(query, page=1) {
    if (!query) {say('Masukkan kod atau istilah carian.');return;}
    run('libra_search',{query,page},data=>{
      result.replaceChildren();refs.replaceChildren();append(result,'h3','Carian Katalog Dewey');
      if(!data.items.length){append(result,'p',blank);return;}
      for(const r of data.items){const item=append(result,'p',`${r.nombor_ddc} — ${r.subjek} · hlm. ${r.halaman_pdf} · ${r.status_semakan} `);item.append(button('Lihat Rujukan',()=>showRef(r)));}
      const controls=append(result,'div');controls.className='libra-actions';
      controls.append(button('Sebelumnya',()=>search(query,data.page-1),data.page<=1),e('span',`Halaman ${data.page} / ${Math.ceil(data.total/data.page_size)}`),button('Seterusnya',()=>search(query,data.page+1),data.page*data.page_size>=data.total));
    });
  }
  function confirmReview(data, ref, decision) {
    const accept=decision==='accept';
    if(!window.confirm(accept?`Sahkan pertukaran DDC untuk “${data.book.judul}” kepada ${ref.nombor_ddc}?`:'Sahkan penolakan cadangan ini?'))return;
    run('libra_review',{book_id:data.book.id,ref_id:ref.id,expected_call:data.book.no_panggilan,decision,confirmed:true},reply=>{
      if(selected && String(selected.id)===reply.book_id) selected.no_panggilan=reply.no_panggilan;
      result.replaceChildren();refs.replaceChildren();append(result,'p',accept?(reply.changed?'No. Panggilan disimpan: '+reply.no_panggilan:'No. Panggilan tidak berubah; semakan direkodkan.'):'Cadangan ditolak. Rekod buku tidak diubah.');
    });
  }
  function showAdvice(data, reviewed) {
    result.replaceChildren();refs.replaceChildren();append(result,'h3','LIBRA AI — Cadangan Pengelasan');
    if(data.message)append(result,'p',data.message);
    const r=reviewed || data.recommendation;
    if(r) {
      fields(result,[['Judul',data.book?.judul||'Pertanyaan subjek'],['No. Panggilan semasa',data.book?.no_panggilan],['Nombor DDC dicadangkan',r.nombor_ddc],['Subjek',r.subjek],['Kelas Utama',r.kelas_utama],['Alasan',reviewed?'Rujukan alternatif dipilih oleh GPM.':data.reason],['Rujukan Katalog',`${r.nama_sumber}, halaman ${r.halaman_pdf}`],['Tahap Keyakinan',reviewed?'Perlu semakan GPM':data.confidence],['Status Rujukan',r.status_semakan],['Status',data.status]]);
      const actions=append(result,'div');actions.className='libra-actions';actions.append(button('Lihat Rujukan',()=>showRef(r)));
      if(data.book?.id) {
        const fiction=/^F[MICT](?:\s|\/|$)/i.test(data.book.no_panggilan);
        if(fiction)append(result,'p','Kod fiksyen tempatan pada rekod ini dikekalkan.');
        actions.append(button('Terima Cadangan',()=>confirmReview(data,r,'accept'),fiction||r.status_semakan!=='Disahkan'),button('Tolak Cadangan',()=>confirmReview(data,r,'reject')));
        actions.append(button('Edit Cadangan',()=>{
          const code=window.prompt('Masukkan kod DDC alternatif daripada katalog.');if(!code?.trim())return;
          run('libra_search',{query:code.trim()},response=>{
            const options=response.items.filter(x=>x.nombor_ddc===code.trim()&&x.status_semakan==='Disahkan');
            if(options.length!==1 || response.items.some(x=>x.nombor_ddc===code.trim()&&x.status_semakan==='Konflik')){say('Kod alternatif belum mempunyai satu rujukan yang disahkan atau bercanggah.');return;}
            showAdvice(data,options[0]);
          });
        },fiction));
      }
    } else if(!data.message) append(result,'p',blank);
    if(data.candidates?.length){append(result,'h3','Calon dalam katalog');for(const c of data.candidates){const item=append(result,'p',`${c.nombor_ddc} — ${c.subjek} · hlm. ${c.halaman_pdf} · ${c.status_semakan} `);item.append(button('Lihat Rujukan',()=>showRef(c)));}}
  }
  const viewport=window.visualViewport;
  function resizePlanner() {
    if(!dialog.open||planner.hidden||!viewport)return;
    const gap=Math.max(0,window.innerHeight-viewport.height-viewport.offsetTop);
    dialog.style.setProperty('--libra-vvh',`${viewport.height}px`);
    dialog.style.setProperty('--libra-vv-gap',`${gap}px`);
    const focus=document.activeElement;
    if(gap>60&&focus?.matches('input,textarea,select')&&dialog.contains(focus))focus.scrollIntoView({block:'nearest'});
  }
  function cancel() {pending?.abort();pending=null;dialog.removeAttribute('aria-busy');}
  function close() {cancel();viewport?.removeEventListener('resize',resizePlanner);viewport?.removeEventListener('scroll',resizePlanner);result.replaceChildren();refs.replaceChildren();if(dialog.open)dialog.close();}
  function showModeStatus() {
    if(!capabilities)return;
    const ai=capabilities.gemini, catalogue=planner.hidden?(ready?'Katalog Dewey tersedia. ':'Katalog persendirian belum dikonfigurasi. '):'';
    const model=ai?.model?' ('+ai.model+')':'';
    $('[data-check-gemini]').hidden=!ai?.configured;
    if(!ai) say(catalogue+'Backend Apps Script LIBRA versi lama; status sambungan Gemini belum dapat disahkan.');
    else if(ai.state==='connected')say(catalogue+'Gemini AI tersedia'+model+'.');
    else if(ai.state==='configured')say(catalogue+'Gemini dikonfigurasi'+model+' — sambungan belum disahkan.');
    else say(catalogue+'Gemini tidak tersedia'+model+' — '+ai.message+(ai.code==='MODEL_UNAVAILABLE'?' Model cadangan: '+ai.suggestedModel+'.':''));
  }
  function loadStatus(check=false) {run('libra_status',check?{check_gemini:true}:{},data=>{capabilities=data;ready=data.ready;showModeStatus();});}
  function updateGemini(data) { if(data.gemini&&capabilities){capabilities.gemini=data.gemini;showModeStatus();} }
  $('[data-check-gemini]').onclick=()=>loadStatus(true);
  $('[data-close]').onclick=close;
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  dialog.addEventListener('close',()=>launcher.focus());
  $('[data-mode]').onchange=event=>{const plan=event.target.value==='planner';if(capabilities)cancel();advisor.hidden=plan;planner.hidden=!plan;dialog.classList.toggle('libra-planning',plan);result.replaceChildren();refs.replaceChildren();resizePlanner();if(capabilities)showModeStatus();else loadStatus();};
  $('[data-search]').onclick=()=>{if(ready)search(advisor.elements.query.value.trim());};
  $('[data-find-book]').onclick=()=>{
    if(!ready)return;
    const q=advisor.elements.book_query.value.trim();if(q.length<2){say('Taip sekurang-kurangnya dua aksara judul buku.');return;}
    run('search_books',{q,limit:8,page:1,include_disposed:0},data=>{
      const list=$('[data-books]');list.replaceChildren();
      for(const b of data.items||[]){list.append(button(`${b.judul||'Tanpa judul'} · ${b.no_perolehan||'—'}`,()=>{selected=b;$('[data-selected]').textContent='Dipilih: '+(b.judul||'Buku');advisor.elements.isbn.value='';list.replaceChildren(button('Buang Pilihan',()=>{selected=null;$('[data-selected]').textContent='';list.replaceChildren();}));}));}
      if(!list.children.length)append(list,'p','Tiada buku yang sepadan.');
    });
  };
  advisor.onsubmit=event=>{event.preventDefault();if(!ready)return;const {query,isbn}=advisor.elements;if(!query.value.trim()&&!isbn.value.trim()&&!selected){say('Masukkan subjek atau ISBN, atau pilih buku SMARTLIB.');return;}run('libra_advice',{query:query.value,isbn: isbn.value,book_id:selected?.id||''},data=>{updateGemini(data);showAdvice(data);});};
  planner.elements.budget.onchange=()=>{const fixed=planner.elements.budget.value==='Bajet Ditetapkan', limit=planner.elements.budget_limit; $('[data-budget-limit]').hidden=!fixed;limit.disabled=!fixed;limit.required=fixed;};
  async function planRequest(action,payload,signal) {
    try {return await request(action,payload,signal);}
    catch(error){
      // A pre-upgrade backend rejects the missing legacy class before reading collection data.
      if(signal.aborted||!String(error?.message||'').includes('Pilih kelas utama Dewey yang sah.'))throw error;
      const {makeCompatiblePlan}=await import('./libra-planner-template.js');
      return makeCompatiblePlan(payload);
    }
  }
  planner.onsubmit=event=>{event.preventDefault();if(!capabilities)return;
    run('libra_plan',Object.fromEntries(new FormData(planner)),data=>{updateGemini(data);refs.replaceChildren();renderPlanner(result,data,say);result.scrollIntoView({block:'start'});},planRequest);
  };
  return {show(){if(dialog.open)return;dialog.showModal();ready=false;capabilities=null;viewport?.addEventListener('resize',resizePlanner);viewport?.addEventListener('scroll',resizePlanner);resizePlanner();loadStatus();},close(){close();dialog.remove();}};
}
