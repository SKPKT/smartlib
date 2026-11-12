(() => {
  const eligible = () => !!(window._tok && /^(admin(?:istrator)?|super[ -]?admin|pentadbir(?: sekolah)?|gpm|guru perpustakaan(?: dan media)?|guru media)$/i.test(String(window._mR || '').trim()));
  function start() {
    const login = document.getElementById('lw');
    if (!login) return;
    let button, panel, generation = 0;
    async function request(action, payload = {}, signal) {
      if (!eligible()) throw new Error('Log masuk sebagai Admin/GPM untuk menggunakan LIBRA.');
      const controller = new AbortController(), abort = () => controller.abort();
      if (signal?.aborted) abort();
      signal?.addEventListener('abort', abort, {once:true});
      const timer = setTimeout(abort, ['libra_advice','libra_plan'].includes(action)?110000:50000);
      const token = window._tok;
      try {
        const res = await fetch(GAS,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({...payload,action,sessionToken:token}),signal:controller.signal});
        if (!res.ok) throw new Error('Pelayan SMARTLIB tidak dapat dicapai.');
        const json = await res.json();
        if (window._tok !== token || !eligible()) throw new Error('Sesi LIBRA telah berubah.');
        if (!json?.ok) throw new Error(json?.error || 'Permintaan LIBRA gagal.');
        if(action==='libra_review' && json.data?.changed) {
          const book=(D.buku||[]).find(b=>String(b.id)===json.data.book_id);
          if(book){book.no_panggilan=json.data.no_panggilan;window.upsertBookIndex?.(book);}
        }
        return json.data;
      } catch(error) {
        if(controller.signal.aborted&&!signal?.aborted) throw new Error('Permintaan LIBRA tamat masa. Cuba lagi.');
        if(error instanceof TypeError) throw new Error('Sambungan ke backend SMARTLIB gagal. Cuba lagi.');
        throw error;
      } finally { clearTimeout(timer); signal?.removeEventListener('abort',abort); }
    }
    function sync() {
      const show = eligible() && getComputedStyle(login).display === 'none';
      if (!show) { if(button||panel)generation++; panel?.close();panel=null;button?.remove();button=null;return; }
      if (button) return;
      if (!document.querySelector('[data-libra-style]')) {
        const style=document.createElement('link');style.rel='stylesheet';style.href='./libra.css';style.dataset.libraStyle='';document.head.append(style);
      }
      button=document.createElement('button');button.type='button';button.id='libra-launcher';button.setAttribute('aria-label','Buka LIBRA AI');button.setAttribute('aria-haspopup','dialog');
      button.innerHTML='<img src="./libra-robot.webp" alt=""><span>LIBRA AI</span>';
      button.onclick=async()=>{
        if (!eligible() || !button) return;
        if (panel) { panel.show(); return; }
        const launch=button, ticket=++generation;launch.disabled=true;
        try { const {createLibra}=await import('./libra.js'); if(ticket===generation && eligible() && button===launch) {panel=createLibra(request,launch);panel.show();} }
        catch { if(ticket===generation)toast('LIBRA AI tidak dapat dimuatkan. Cuba lagi.','er'); }
        finally { launch.disabled=false; }
      };
      document.body.append(button);
    }
    new MutationObserver(sync).observe(login,{attributes:true,attributeFilter:['style','class','hidden']});
    sync();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
