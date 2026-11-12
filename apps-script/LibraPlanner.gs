// Standalone program planning. Only the existing authenticated LIBRA route calls this file.
const LIBRA_PROGRAM_TYPES = ['Galakan Membaca','NILAM','Literasi Maklumat','Literasi Digital','STEM','Minggu Pusat Sumber','Program Inovasi PSS','Program Pendidikan Khas','Lain-lain'];
const LIBRA_PROGRAM_AUDIENCES = ['Tahun 1–3','Tahun 4–6','Semua Murid','Guru dan Staf'];
const LIBRA_PROGRAM_NEEDS = ['Masalah Pendengaran','Masalah Pembelajaran','Pelbagai Keperluan MBPK','Umum'];
const LIBRA_PROGRAM_DURATIONS = ['Sehari','Seminggu','Sebulan','Sepanjang Tahun'];
const LIBRA_PROGRAM_BUDGETS = ['Tiada Kos','Bajet Rendah','Bajet Ditetapkan'];

function libraPlannerCount(text, supplied) {
  const words = ['satu','dua','tiga','empat','lima','enam','tujuh','lapan','sembilan','sepuluh'];
  const match = String(text || '').match(/\b(\d{1,3}|satu|dua|tiga|empat|lima|enam|tujuh|lapan|sembilan|sepuluh)\s+(?:cadangan\s+)?program\b/i);
  const n = match ? (/^\d+$/.test(match[1]) ? Number(match[1]) : words.indexOf(match[1].toLowerCase())+1) : Number(supplied || 1);
  if (!Number.isInteger(n) || n < 1 || n > 10) throw new Error('Pilih antara 1 hingga 10 program bagi satu permintaan.');
  return n;
}

function libraPlannerOptions(p) {
  const choice = (value, options) => {
    if (!options.includes(value)) throw new Error('Sila pilih tetapan program yang sah.');
    return value;
  };
  const text = libraText(p.instructions, 600);
  const budget = choice(p.budget,LIBRA_PROGRAM_BUDGETS);
  const cap = budget === 'Tiada Kos' ? 0 : budget === 'Bajet Rendah' ? 50 : Number(p.budget_limit);
  if (!Number.isFinite(cap) || cap < 0 || cap > 100000 || (budget === 'Bajet Ditetapkan' && (!String(p.budget_limit || '').trim() || cap === 0))) throw new Error('Masukkan had bajet melebihi RM0 dan tidak melebihi RM100,000 bagi setiap program.');
  // Only known planning concepts may leave SMARTLIB. The original free text is never sent to Gemini.
  const hints = ['inovatif','interaktif','bacaan bergambar','bahasa isyarat','bahasa isyarat malaysia','bim','sari kata','aktiviti visual','aktiviti taktil','berkumpulan','individu','stesen','permainan','komik','cerita rakyat','pantun','buku audio','bahan kitar semula','tanpa internet','tanpa skrin','robotik','pengaturcaraan','keselamatan siber','semak fakta','makmal','keceriaan','alam sekitar','hari kebangsaan','pertandingan','pameran','bengkel','kolaborasi','ibu bapa','warisan','inklusif','pengucapan awam','pertanian','herba','kelestarian','matematik','sains','teknologi','seni','muzik','sukan','perpustakaan','sekolah','komunikasi','fon besar','kontras tinggi','kraf','dalam kelas','luar kelas','secara dalam talian','kuiz','jejak harta','buku digital','poster','cerita digital','bercerita','bimbingan rakan','orientasi','permainan papan','dokumentasi','membaca','penulisan kreatif','video','fotografi','rakaman','kebun','tumbuhan','eksperimen','inovasi','galakan membaca','literasi maklumat','literasi digital','stem','nilam','teater','lakonan','peta minda','kartun','infografik','waktu rehat','minggu bahasa','haiwan','pemakanan sihat','kesihatan','permainan bahasa','teka silang kata','ketangkasan','persembahan'];
  // Strip common identity/contact forms before matching even the controlled vocabulary.
  const safe = text.split(/\r?\n/).filter(line=>!/(?:\bnama\b|\balamat\b|\bno\.?\s*(?:telefon|kp)\b|\bmykid\b|\be-?mel\b|\bemail\b|\bdiagnosis\b)/i.test(line)).join(' ')
    .replace(/\S+@\S+|(?:\+?6?01[0-9])[-\s]?[0-9]{7,8}|\b\d{6}-?\d{2}-?\d{4}\b/g,' ');
  const normalized = ' '+libraNorm(safe)+' ';
  const audience = choice(p.audience,LIBRA_PROGRAM_AUDIENCES), needs=choice(p.needs,LIBRA_PROGRAM_NEEDS);
  const specifiedAudience = /\btahun\s*1\s*(?:[–—-]|hingga)\s*3\b/i.test(safe) ? 'Tahun 1–3' : /\btahun\s*4\s*(?:[–—-]|hingga)\s*6\b/i.test(safe) ? 'Tahun 4–6' : '';
  const specifiedNeeds = /\bmasalah pendengaran\b/i.test(safe) ? 'Masalah Pendengaran' : /\bmasalah pembelajaran\b/i.test(safe) ? 'Masalah Pembelajaran' : /\b(?:pelbagai keperluan mbpk|mbpk)\b/i.test(safe) ? 'Pelbagai Keperluan MBPK' : '';
  const negative = /\b(?:jangan|tanpa|tidak perlu)\b[^.!?\n]{0,30}\banalisis\s+(?:ddc|dewey)\b/i.test(text);
  return {type:choice(p.program_type,LIBRA_PROGRAM_TYPES),audience:audience==='Semua Murid'&&specifiedAudience?specifiedAudience:audience,
    needs:needs==='Umum'&&specifiedNeeds?specifiedNeeds:needs,duration:choice(p.duration,LIBRA_PROGRAM_DURATIONS),
    budget,cap:Math.round(cap*100)/100,count:libraPlannerCount(text,p.count),
    hints:hints.filter(h=>normalized.includes(' '+h+' ')).slice(0,12),
    analysis:p.include_dewey===true || (!negative&&/\b(?:sertakan|tambah|paparkan|tunjukkan|buat)\s+analisis\s+(?:ddc|dewey)\b/i.test(text))};
}

const LIBRA_PROGRAM_LENSES = {
  'Galakan Membaca':['bacaan pilihan','petikan buku bergambar','menceritakan semula isi bacaan'],
  'NILAM':['rekod dan refleksi bacaan','bahan bacaan serta borang NILAM sekolah','mendokumenkan bacaan dan refleksi'],
  'Literasi Maklumat':['carian dan semakan sumber','contoh sumber cetak atau digital yang dipilih guru','membezakan sumber yang boleh dipercayai'],
  'Literasi Digital':['penggunaan maklumat digital secara selamat','contoh paparan digital rekaan dan panduan keselamatan','menilai pilihan yang selamat sebelum berkongsi maklumat'],
  'STEM':['penerokaan sains dan reka cipta','kad cabaran dan bahan binaan yang selamat','menguji idea dan menerangkan pemerhatian'],
  'Minggu Pusat Sumber':['pengenalan kepada perkhidmatan PSS','peta ruang dan kad misi PSS','menggunakan ruang atau perkhidmatan PSS dengan yakin'],
  'Program Inovasi PSS':['reka bentuk penyelesaian untuk PSS','bahan prototaip dan kad maklum balas','mencuba dan menambah baik satu penyelesaian'],
  'Program Pendidikan Khas':['pembelajaran mesra MBPK di PSS','bahan visual atau taktil mengikut keperluan','menyertai tugasan melalui cara komunikasi pilihan'],
  'Lain-lain':['penerokaan kemahiran PSS','bahan PSS yang sesuai dengan tema','menghasilkan satu hasil pembelajaran yang boleh disemak']
};
const LIBRA_PROGRAM_ACTIVITIES = [
  ['Jejak Misi','Sediakan tiga stesen dengan satu misi ringkas di setiap stesen.','Tanda misi selesai pada kad perjalanan peserta.'],
  ['Studio Cerita Visual','Bina papan cerita dengan susunan gambar atau simbol.','Terangkan urutan melalui bahasa isyarat, gambar, tulisan atau demonstrasi.'],
  ['Makmal Cuba dan Baiki','Bina atau cuba satu contoh mudah, kemudian ubah satu bahagian berdasarkan pemerhatian.','Bandingkan hasil pertama dan hasil selepas penambahbaikan.'],
  ['Rakan Pembimbing PSS','Pasangkan peserta; seorang memodelkan tugas dan seorang mencubanya sebelum bertukar peranan.','Catat satu strategi yang membantu pasangan menyelesaikan tugas.'],
  ['Galeri Pilih dan Terangkan','Pilih hasil untuk dipamerkan bersama label ringkas atau gambar.','Berikan satu maklum balas membina pada hasil peserta lain.'],
  ['Kotak Misteri Pengetahuan','Kenal pasti bahan atau petunjuk daripada kotak dan padankan dengan kad jawapan.','Terangkan satu sebab bagi padanan yang dipilih.'],
  ['Bengkel Reka Panduan','Hasilkan panduan pendek dengan tiga langkah menggunakan poster atau kad.','Minta rakan mengikuti panduan dan baiki langkah yang tidak jelas.'],
  ['Peta Idea Bersama','Kelompokkan kad maklumat pada peta idea dan sambungkan bahagian yang berkaitan.','Gunakan peta itu untuk berkongsi satu kesimpulan.'],
  ['Cabaran Pilihan Bijak','Bandingkan dua pilihan melalui senario rekaan yang sesuai dengan tema.','Tunjukkan pilihan dan nyatakan alasannya melalui medium yang sesuai.'],
  ['Diari Projek PSS','Rekod perkembangan melalui gambar, simbol, teks atau sampel kerja.','Pilih satu bukti kemajuan dan tulis atau tunjuk langkah susulan.']
];

function libraPlannerFallback(o) {
  const [theme,source,skill] = LIBRA_PROGRAM_LENSES[o.type];
  const access = {
    'Masalah Pendengaran':'Gunakan arahan visual, sari kata atau bahasa isyarat yang sesuai; jangan bergantung pada audio sahaja.',
    'Masalah Pembelajaran':'Modelkan langkah secara berperingkat. Gunakan kad bergambar, contoh konkrit dan masa tambahan.',
    'Pelbagai Keperluan MBPK':'Sediakan pilihan visual dan taktil serta cara menjawab melalui isyarat, tulisan, simbol atau demonstrasi.',
    'Umum':'Gunakan arahan ringkas dan contoh visual. Benarkan pelbagai cara menyertai aktiviti.'
  }[o.needs];
  const stage = {
    'Tahun 1–3':'Bimbing tugasan melalui satu langkah pada satu masa dan gunakan contoh mudah.',
    'Tahun 4–6':'Galakkan peserta membuat pilihan, membandingkan bukti dan menerangkan sebab.',
    'Semua Murid':'Sediakan versi asas dan lanjutan mengikut umur serta tahap bacaan.',
    'Guru dan Staf':'Uji aktiviti dalam kumpulan kecil dan bincangkan cara menyesuaikannya untuk pelaksanaan di sekolah.'
  }[o.audience];
  const timing = {'Sehari':'Taklimat, pelaksanaan dan refleksi pada hari yang sama.',Seminggu:'Mulakan pada awal minggu, laksana secara berperingkat dan nilai pada akhir minggu.',Sebulan:'Minggu pertama persediaan; minggu kedua dan ketiga pelaksanaan; minggu akhir penilaian.','Sepanjang Tahun':'Laksana secara berkala sepanjang tahun dan semak hasil pada setiap penggal.'}[o.duration];
  const topic = o.hints.find(h=>['komik','cerita rakyat','alam sekitar','hari kebangsaan','robotik','matematik','seni','warisan','herba','tumbuhan','pemakanan sihat','haiwan','pertanian','keselamatan siber'].includes(h));
  const offset = topic ? [...topic].reduce((sum,c)=>sum+c.charCodeAt(0),0)%10 : 0;
  return Array.from({length:o.count},(_,i)=>{
    const [method,activity,outcome] = LIBRA_PROGRAM_ACTIVITIES[(offset+i)%10];
    const cost = Math.min(o.cap,[18,24,35,12,30,20,28,16,22,15][(offset+i)%10]);
    return {name:`${method} — ${o.type}${topic?' ('+topic+')':''}`,rationale:`Pendekatan ${method.toLowerCase()} menyediakan pengalaman amali untuk ${theme}${topic?' bertema '+topic:''}.`,
      objectives:[`Peserta dapat ${skill} melalui satu tugasan yang dibimbing.`,'Peserta dapat menerangkan hasil atau pilihan menggunakan medium yang sesuai.'],
      audience:o.audience,needs:o.needs,duration:o.duration,
      activities:[`Perkenalkan ${theme} menggunakan ${source}. ${stage}`,activity,`${outcome} ${access}`,timing],
      resources:[source,'Kad arahan, alat tulis dan bahan guna semula yang sedia ada',o.needs==='Masalah Pendengaran'?'Sari kata, kad visual atau sokongan bahasa isyarat':'Bahan sokongan mengikut akses peserta'],
      budgetItems:cost?[{item:'Anggaran bahan habis guna untuk pelaksanaan',amount:cost}]:[{item:'Guna bahan dan kemudahan sekolah yang sedia ada',amount:0}],
      indicators:['Sasaran sekurang-kurangnya 80% peserta yang hadir menyelesaikan satu tugasan dengan sokongan yang sesuai.'],
      evaluation:['Gunakan senarai semak tugasan dan satu bukti hasil kerja. Kira peratus selepas program menggunakan jumlah kehadiran sebenar.']};
  });
}

function libraPlannerGemini(o, props) {
  const str={type:'STRING'}, list={type:'ARRAY',items:str,minItems:1,maxItems:4};
  const item={type:'OBJECT',properties:{item:str,amount:{type:'NUMBER'}},required:['item','amount']};
  const fields={name:str,rationale:str,objectives:list,activities:{...list,minItems:2},resources:list,budgetItems:{type:'ARRAY',items:item,minItems:1,maxItems:4},indicators:list,evaluation:list};
  const schema={programs:{type:'ARRAY',minItems:o.count,maxItems:o.count,items:{type:'OBJECT',properties:fields,required:Object.keys(fields)}}};
  const instruction='Anda perancang program Pusat Sumber Sekolah dalam Bahasa Melayu formal. Pakar dalam galakan membaca, NILAM, literasi maklumat, literasi digital, STEM dan program mesra MBPK. Jana tepat bilangan program yang diminta. Setiap program mesti berbeza dari segi nama dan pendekatan; bukan satu program dengan beberapa aktiviti. Ikut sasaran, keperluan peserta, tempoh dan had anggaran bajet setiap program. Beri objektif boleh dinilai, langkah yang jelas, akses yang sesuai, dan KPI sebagai sasaran masa depan. Jangan nyatakan bilangan peserta, statistik, pencapaian atau judul katalog sebenar. Jangan masukkan kod DDC, analisis Dewey atau klasifikasi buku. Untuk tiada kos, nyatakan penggunaan kemudahan sedia ada dengan nilai 0. Setiap medan hendaklah ringkas, satu hingga dua ayat setiap butir.';
  const {analysis,...safeOptions} = o;
  return libraGeminiAttempt(props,instruction,safeOptions,schema,{
    tokens:2048+o.count*960,retry:true,validate:generated=>libraPlannerValidate(generated,o)
  });
}

function libraPlannerValidate(generated, o) {
  if (!Array.isArray(generated?.programs) || generated.programs.length!==o.count) return null;
  const output = [], names = new Set(), methods = new Set();
  const text = (value,max) => typeof value==='string' ? libraSafeText(value,max) : '';
  const items = (value,max) => Array.isArray(value) ? value.slice(0,4).map(v=>text(v,max)).filter(Boolean) : [];
  for (const raw of generated.programs) {
    const p = {name:text(raw?.name,120),rationale:text(raw?.rationale,500),objectives:items(raw?.objectives,270),activities:items(raw?.activities,310),resources:items(raw?.resources,220),
      indicators:items(raw?.indicators,250),evaluation:items(raw?.evaluation,250),audience:o.audience,needs:o.needs,duration:o.duration,
      budgetItems:Array.isArray(raw?.budgetItems)?raw.budgetItems.slice(0,4).map(x=>({item:text(x?.item,140),amount:typeof x?.amount==='number'?Math.round(x.amount*100)/100:NaN})):[]};
    const budgetOK = p.budgetItems.length>0 && p.budgetItems.every(x=>x.item&&Number.isFinite(x.amount)&&x.amount>=0) && Math.round(p.budgetItems.reduce((n,x)=>n+x.amount,0)*100)<=Math.round(o.cap*100);
    const normalized = libraNorm(p.name), method=libraNorm(p.activities.join(' '));
    const unwanted = /\b(?:ddc|dewey|decimal classification|fiksyen tempatan)\b|\b(?:kod|kelas)\s+\d{3}(?:\.\d+)?\b|\b\d{3}\.\d{1,8}\b|\b\d+\s+(?:orang\s+)?(?:murid|peserta|guru|staf)\b/i;
    const content = JSON.stringify({...p,budgetItems:p.budgetItems.map(x=>x.item)});
    if (!normalized || !method || names.has(normalized) || methods.has(method) || !p.rationale || !p.objectives.length || p.activities.length<2 || !p.resources.length || !p.indicators.length || !p.evaluation.length || !budgetOK || unwanted.test(content)) return null;
    names.add(normalized);methods.add(method);output.push(p);
  }
  return output;
}

function libraPlannerDeweyAnalysis() {
  const counts=Array(10).fill(0);
  for (const row of bacaSheetRaw('buku')) {
    if (!isBukuAktifUntukStok(row)) continue;
    const code=/^(\d)\d{2}(?:\.\d+)?(?=$|[\s/])/.exec(String(row.no_panggilan||'').trim());
    if (code) counts[Number(code[1])]++;
  }
  return counts.map((active,i)=>({code:i+'00',active})).filter(x=>x.active>0);
}

function libraPlanPrograms(p, props) {
  const options=libraPlannerOptions(p);
  const attempt=libraPlannerGemini(options,props), generated=attempt.value;
  const programs=generated || libraPlannerFallback(options);
  const message=(generated?'Program berjaya dijana menggunakan Gemini AI. Semak kesesuaian sebelum digunakan.':
    'Mod Templat — Gemini AI tidak digunakan. '+attempt.ai.message)+' Cadangan program ini tidak berdasarkan analisis data koleksi sebenar.';
  const reply={programs,message,gemini:attempt.ai,method:generated?'gemini':'template'};
  if(options.analysis){try{reply.analysis=libraPlannerDeweyAnalysis();}catch(error){reply.analysisMessage='Data sebenar untuk analisis Dewey tidak tersedia.';}}
  return reply;
}
