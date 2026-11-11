const types=['Galakan Membaca','NILAM','Literasi Maklumat','Literasi Digital','STEM','Minggu Pusat Sumber','Program Inovasi PSS','Program Pendidikan Khas','Lain-lain'];
const choice=(name,label,values)=>`<label>${label}<select name="${name}">${values.map(x=>`<option>${x}</option>`).join('')}</select></label>`;
export const plannerForm=`<div class="libra-planner-form">
  ${choice('program_type','Jenis Program',types)}
  ${choice('audience','Kumpulan Sasaran',['Semua Murid','Tahun 1–3','Tahun 4–6','Guru dan Staf'])}
  ${choice('needs','Keperluan Peserta',['Umum','Masalah Pendengaran','Masalah Pembelajaran','Pelbagai Keperluan MBPK'])}
  ${choice('duration','Tempoh Program',['Sehari','Seminggu','Sebulan','Sepanjang Tahun'])}
  ${choice('budget','Bajet',['Tiada Kos','Bajet Rendah','Bajet Ditetapkan'])}
  ${choice('count','Bilangan Program',Array.from({length:10},(_,i)=>String(i+1)))}
  <label data-budget-limit hidden>Had bajet setiap program (RM)<input name="budget_limit" type="number" min="0.01" max="100000" step="0.01" inputmode="decimal" disabled></label>
  <label class="libra-planner-wide">Arahan tambahan<textarea name="instructions" rows="3" maxlength="600" placeholder="Nyatakan jenis program yang ingin dijana..."></textarea><small>Contoh: Cadangkan lima program inovatif dengan bahan kitar semula. Jangan masukkan maklumat peribadi peserta.</small></label>
  <button type="submit" class="libra-planner-wide">Jana Program PSS</button>
</div>`;

const el=(tag,text,classes)=>{const n=document.createElement(tag);if(text!=null)n.textContent=String(text);if(classes)n.className=classes;return n;};
const rm=value=>`RM${Number(value).toFixed(2)}`;
const budgetLines=p=>[...p.budgetItems.map(x=>`${x.item}: ${rm(x.amount)}`),`Jumlah anggaran: ${rm(p.budgetItems.reduce((sum,x)=>sum+Number(x.amount),0))}`,'Semak harga dan sumber sebenar sebelum kelulusan.'];
const target=p=>`${p.audience} · ${p.needs}`;
const sections=p=>[
  ['Rasional',p.rationale],['Objektif',p.objectives],['Sasaran',target(p)],['Tempoh',p.duration],['Aktiviti',p.activities],
  ['Bahan dan Keperluan',p.resources],['Bajet',budgetLines(p)],['KPI / Indikator Kejayaan',p.indicators],['Kaedah Penilaian',p.evaluation]
];
const lines=value=>Array.isArray(value)?value.map(x=>`• ${x}`).join('\n'):value;
const documentText=(title,p,rows)=>[title.toUpperCase(),p.name,...rows.map(([label,value])=>`${label}\n${lines(value)}`)].join('\n\n');

export function makePlannerDraft(p, kind) {
  if(kind==='Kertas Kerja')return documentText('Kertas Kerja Program PSS',p,[
    ['Butiran Pelaksanaan','Sekolah: __________________\nTarikh dan tempat: __________________\nPenyelaras: __________________'],
    ...sections(p),['Kelulusan','Disediakan oleh: __________________\nDisemak oleh: __________________\nDiluluskan oleh: __________________']]);
  if(kind==='Tentatif')return documentText('Tentatif Program PSS',p,[['Tempoh',p.duration],['Sasaran',target(p)],
    ['Urutan Pelaksanaan',p.activities.map((x,i)=>`${i+1}. Tarikh/masa: __________ · ${x}`)],['Refleksi dan Penutup',p.evaluation]]);
  if(kind==='Anggaran Bajet')return documentText('Anggaran Bajet Program PSS',p,[['Bahan dan Keperluan',p.resources],['Butiran Anggaran',budgetLines(p)],['Sumber Peruntukan','Untuk dilengkapkan oleh penyelaras.']]);
  if(kind==='KPI Program')return documentText('KPI Program PSS',p,[['Objektif',p.objectives],['Sasaran KPI',p.indicators],['Bukti dan Kaedah Penilaian',p.evaluation],['Pencapaian Sebenar','Diisi selepas pelaksanaan menggunakan data sebenar.']]);
  return documentText('Cadangan Program PSS',p,sections(p));
}

function printDraft(title, text) {
  const popup=window.open('','_blank','width=780,height=720');
  if(!popup)return false;
  popup.opener=null;
  const doc=popup.document;
  doc.title=title;doc.documentElement.lang='ms';
  const styles=doc.createElement('style');
  styles.textContent='@page{size:A4;margin:18mm}body{margin:20px auto;padding:0 16px;max-width:800px;color:#14201d;font:12pt/1.5 system-ui,sans-serif}pre{font:inherit;white-space:pre-wrap;overflow-wrap:anywhere}footer{margin-top:24px;font-size:9pt}button{padding:9px 14px}@media print{button{display:none}body{margin:0;padding:0}}';
  doc.head.append(styles);
  const trigger=doc.createElement('button');trigger.textContent='Cetak / Simpan sebagai PDF';trigger.onclick=()=>popup.print();
  const body=doc.createElement('pre');body.textContent=text;
  const footer=doc.createElement('footer');footer.textContent='© 2026 SMARTLIB |Syahida Suffian';
  doc.body.append(trigger,body,footer);
  return true;
}

export function renderPlanner(container, data, announce) {
  const action=(label,fn)=>{const b=el('button',label);b.type='button';b.onclick=fn;return b;};
  const drafts=new Map();
  container.replaceChildren(el('h3','Cadangan Program PSS'));
  if(!Array.isArray(data?.programs)||!data.programs.length){container.append(el('p','Versi Apps Script untuk Program Planner baharu belum tersedia.'));return;}
  if(data.message)container.append(el('p',data.message));
  data.programs.forEach((program,index)=>{
    const card=el('details',null,'libra-program-card');card.open=index===0;
    const heading=el('summary',`Program ${index+1} — ${program.name}`);card.append(heading);
    const content=el('div',null,'libra-program-content');card.append(content);
    for(const [label,value] of sections(program)){
      content.append(el('h4',label));
      if(Array.isArray(value)){const list=el('ul');for(const row of value)list.append(el('li',row));content.append(list);}
      else content.append(el('p',value));
    }
    const actions=el('div',null,'libra-program-actions'), draftBox=el('div',null,'libra-draft');draftBox.hidden=true;
    const draftLabel=el('label'), draftTitle=el('span'), area=el('textarea');area.rows=11;draftLabel.append(draftTitle,area);
    let current='';
    const showDraft=kind=>{
      current=kind;draftTitle.textContent=`Draf ${kind} — ${program.name}`;
      area.value=drafts.get(index+'|'+kind)??makePlannerDraft(program,kind);
      draftBox.hidden=false;area.focus({preventScroll:true});draftBox.scrollIntoView({block:'nearest'});
    };
    area.oninput=()=>drafts.set(index+'|'+current,area.value);
    for(const kind of ['Kertas Kerja','Tentatif','Anggaran Bajet','KPI Program'])actions.append(action('Jana '+kind,()=>showDraft(kind)));
    actions.append(action('Salin Cadangan',()=>showDraft('Cadangan Program')),action('Cetak / Eksport PDF',()=>showDraft(current||'Cadangan Program')));
    const draftActions=el('div',null,'libra-program-actions');
    draftActions.append(action('Salin Draf',async()=>{
      try { await navigator.clipboard.writeText(area.value);announce('Draf disalin.'); }
      catch(error){area.focus();area.select();announce('Teks dipilih. Gunakan fungsi salin pada peranti anda.');}
    }),action('Muat Turun Draf',()=>{
      const url=URL.createObjectURL(new Blob([area.value],{type:'text/plain;charset=utf-8'}));
      const link=el('a');link.href=url;link.download=`program-pss-${index+1}.txt`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }),action('Cetak Draf / PDF',()=>{
      if(!printDraft(current+' — '+program.name,area.value))announce('Benarkan tetingkap cetak dalam pelayar untuk mengeksport PDF.');
    }));
    draftBox.append(draftLabel,draftActions);content.append(actions,draftBox);container.append(card);
  });
  if(Array.isArray(data.analysis)||data.analysisMessage){
    const box=el('details',null,'libra-program-card');box.append(el('summary','Analisis Dewey yang diminta'));
    if(data.analysisMessage||!data.analysis.length)box.append(el('p',data.analysisMessage||'Tiada rekod aktif berkelas Dewey.'));
    else {const list=el('ul');for(const row of data.analysis)list.append(el('li',`${row.code}: ${row.active} buku aktif`));box.append(list);}
    container.append(box);
  }
}
