// Run: node --test tests/arkib9-print.test.cjs
// Optional browser/PDF QA: SMARTLIB_BROWSER_QA=1, PLAYWRIGHT_MODULE and SMARTLIB_CHROME.
// Synthetic records only. Browser requests to the real backend are never sent.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const crypto = require('node:crypto');
const html = new TextDecoder('utf-8', {fatal: true}).decode(fs.readFileSync(path.join(__dirname, '../index.html')));
const methods = ['Pembakaran', 'Penanaman', 'Jualan Sisa'];
const rows = Array.from({length: 24}, (_, i) => ({
  id: i + 1, no_perolehan: String(221 + i), no_panggilan: '800 ABC ' + (221 + i),
  judul: i === 0 ? 'Judul buku yang sangat panjang untuk menguji pembalutan teks dalam cell Borang Arkib 9/08 tanpa memotong baris antara halaman' : 'Buku ' + (221 + i),
  tahun: String(1980 + i), cadangan_pelupusan: methods[i % 3]
}));
const hash = text => crypto.createHash('sha256').update(text).digest('hex');
function section(start, end) { return html.slice(html.indexOf(start), html.indexOf(end, html.indexOf(start))); }
function fixture({blocked = false, apiResult} = {}) {
  const documents = [], errors = [], calls = [];
  const makeDoc = () => ({open() {}, write(value) { documents.push(value); }, close() {}});
  const document = {
    getElementById: () => null,
    createElement: () => ({style: {}, contentWindow: {document: makeDoc()}}),
    body: {appendChild() {}}
  };
  const ctx = vm.createContext({document,
    window: {open: () => blocked ? null : {document: makeDoc()}},
    escapeHtml: value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c])),
    _arkib9Html: 'preview', _arkib9Ids: rows.map(r => String(r.id)),
    api: async payload => { calls.push(payload); return apiResult || {ok: true, data: {items: rows}}; },
    toast: message => errors.push(message), alert: message => errors.push(message)
  });
  vm.runInContext(section('function normalizePrintCss(', '\nconst bukaPrintWin='), ctx);
  vm.runInContext(section('function modalArkib9Html(', '\nfunction openArkib9Filter('), ctx);
  vm.runInContext(section('function renderBorangArkib9(', '\nfunction pgNilam('), ctx);
  return {ctx, documents, errors, calls};
}

test('HTML remains UTF-8 and retains copyright without mojibake', () => {
  assert.ok(html.includes('© 2026 SMARTLIB |Syahida Suffian'));
  assert.ok(!/ðŸ|âœ|Â|Ã|\uFFFD/u.test(html));
});
test('all inline JavaScript blocks compile', () => {
  let scripts = 0;
  for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    if (match[1].trim()) { new vm.Script(match[1]); scripts++; }
  }
  assert.equal(scripts, 14);
});
test('Borang 9 preview explains browser footer settings and native Save as PDF', () => {
  const {ctx} = fixture(), modal = ctx.modalArkib9Html();
  assert.match(modal, /id="arkib9-print-help" class="al a-in np" role="note"/);
  for (const text of ['A4', 'Portrait', 'More settings', 'Headers and footers', 'about:blank', 'Save as PDF']) assert.ok(modal.includes(text));
  assert.ok(modal.indexOf('arkib9-print-help') < modal.indexOf('id="preview-borang-arkib9"'));
});
test('official print CSS and document match the existing deployed format exactly', () => {
  const {ctx} = fixture();
  assert.equal(hash(vm.runInContext('ARKIB9_PRINT_CSS', ctx)), 'c032186fa403ae9b63fb344eb1a0f8d004458db2e46f706b114b2b7a31b1e82e');
  assert.equal(hash(ctx.renderBorangArkib9(rows)), '8d39b74dd298a13c5ed5b5bbd6fd5f066944f8db3579667f4fc891e90ea5b9ca');
  assert.match(ctx.renderFooterBorangArkib9(), /Tandatangan dan Meterai\/Cap Jabatan/);
});
test('printing revalidates records and does not send inventory mutations', async () => {
  const {ctx, documents, calls, errors} = fixture();
  await ctx.cetakBorangArkib9();
  assert.equal(calls.length, 1); assert.equal(calls[0].action, 'get_borang9_data');
  assert.equal(documents.length, 1); assert.deepEqual(errors, []);
  assert.ok(!documents[0].includes('arkib9-print-help'));
  assert.ok(!documents[0].includes('about:blank'));
  assert.match(documents[0], /@media print\{\.ptb\{display:none!important\}/);
  assert.match(documents[0], /@page\{size:A4 portrait;margin:15mm\}/);
});
test('blocked popup still uses the existing iframe print fallback', async () => {
  const {ctx, documents, errors} = fixture({blocked: true});
  await ctx.cetakBorangArkib9();
  assert.equal(documents.length, 1); assert.match(documents[0], /borang-rekod-table/);
  assert.ok(!documents[0].includes('arkib9-print-help')); assert.deepEqual(errors, []);
});
test('incomplete records remain blocked before printing', async () => {
  const {ctx, documents, errors} = fixture({apiResult: {ok: false, error: 'Cadangan Pelupusan belum lengkap. No. Perolehan: 221'}});
  await ctx.cetakBorangArkib9();
  assert.equal(documents.length, 0); assert.ok(errors.some(e => e.includes('221')));
});
test('changes in approved record selection remain blocked before printing', async () => {
  const {ctx, documents, errors} = fixture({apiResult: {ok: true, data: {items: rows.slice(1)}}});
  await ctx.cetakBorangArkib9();
  assert.equal(documents.length, 0); assert.ok(errors.some(e => e.includes('Sila jana semula')));
});

test('Chrome: real popup and iframe printing, A4 layout, PDF footer reproduction and page smoke checks', {
  skip: !process.env.SMARTLIB_BROWSER_QA, timeout: 90000
}, async () => {
  const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
  const output = process.env.SMARTLIB_QA_OUTPUT || fs.mkdtempSync(path.join(os.tmpdir(), 'smartlib-print-'));
  fs.mkdirSync(output, {recursive: true});
  const browser = await chromium.launch({headless: true, ...(process.env.SMARTLIB_CHROME ? {executablePath: process.env.SMARTLIB_CHROME} : {})});
  try {
    const context = await browser.newContext({viewport: {width: 1440, height: 1000}, locale: 'ms-MY', timezoneId: 'Asia/Kuala_Lumpur'});
    const errors = [];
    context.on('page', page => page.on('pageerror', e => errors.push(e.message)));
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'smartlib.test') return route.fulfill({contentType: 'text/html;charset=utf-8', body: html});
      if (url.hostname.includes('google.com')) return route.fulfill({contentType: 'application/json', body: JSON.stringify({ok: true, data: {settings: [], buku: []}})});
      return route.fulfill({contentType: 'application/javascript', body: ''});
    });
    const page = await context.newPage();
    await page.goto('https://smartlib.test/', {waitUntil: 'networkidle'});
    assert.equal(await page.locator('#lu').count(), 1);
    await page.evaluate(async sample => {
      window.__qaRequests = [];
      window.__qaRows = sample;
      api = window.api = async payload => {
        window.__qaRequests.push(payload.action);
        if (payload.action === 'get_borang9_data') return {ok: true, data: {items: sample}};
        if (payload.action === 'get_disposal_data') return {ok: true, data: {bahan_usang_rosak: D.bahan_usang_rosak, pelupusan: []}};
        if (payload.action === 'get_next_accession_number') return {ok: true, data: {next_accession: '245', last_accession: '244'}};
        if (payload.action === 'get_reservations') return {ok: true, data: {items: [], page: 1, total: 0, totalPages: 1}};
        throw new Error('Unexpected API action in read-only print test: ' + payload.action);
      };
      _tok = window._tok = 'synthetic-session'; _me = window._me = {nama: 'Penguji', peranan: 'admin'}; _mR = window._mR = 'admin';
      D.buku = sample.map(r => ({...r, id: r.id, status: ''}));
      D.bahan_usang_rosak = sample.map(r => ({...r, buku_id: r.id, status: 'Diluluskan Untuk Pelupusan'}));
      document.getElementById('lw').style.display = 'none'; document.getElementById('lo').style.display = 'none';
      pgLupus(); await janaBorangPelupusanArkib9();
    }, rows);
    const guide = page.locator('#arkib9-print-help');
    await guide.waitFor({state: 'visible'});
    assert.ok((await guide.textContent()).includes('Headers and footers'));
    await page.screenshot({path: path.join(output, 'preview-help.png'), animations: 'disabled'});
    const popupPromise = page.waitForEvent('popup');
    await page.getByRole('button', {name: 'Cetak Borang', exact: true}).click();
    const popup = await popupPromise;
    await popup.waitForSelector('.borang-rekod-table'); await popup.emulateMedia({media: 'print'});
    const layout = await popup.locator('.borang-rekod-table').evaluate(table => ({
      columns: table.tHead.rows[0].cells.length, header: getComputedStyle(table.tHead).display,
      rows: [...table.tBodies[0].rows].map(row => ({breakInside: getComputedStyle(row).breakInside,
        values: [...row.cells].map(c => c.textContent.trim()),
        fits: [...row.cells].every(c => c.scrollWidth <= c.clientWidth + 1)})),
      toolbarHidden: getComputedStyle(document.querySelector('.ptb')).display === 'none'
    }));
    assert.equal(layout.columns, 6); assert.equal(layout.header, 'table-header-group'); assert.equal(layout.rows.length, 24);
    assert.equal(layout.toolbarHidden, true);
    layout.rows.forEach(row => {assert.equal(row.breakInside, 'avoid'); assert.equal(row.fits, true); assert.equal(row.values[3], '1'); assert.ok(methods.includes(row.values[4]));});
    assert.equal(await popup.locator('#arkib9-print-help').count(), 0);
    await popup.pdf({path: path.join(output, 'browser-footers-on.pdf'), preferCSSPageSize: true, printBackground: true, displayHeaderFooter: true});
    await popup.pdf({path: path.join(output, 'browser-footers-off.pdf'), preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false});
    await popup.close();
    await page.evaluate(() => {window.open = () => null;});
    await page.getByRole('button', {name: 'Cetak Borang', exact: true}).click();
    // The print fallback is intentionally a zero-size iframe; wait for DOM attachment.
    const frameElement = await page.waitForSelector('#smartlib-print-frame', {state: 'attached'});
    const frame = await frameElement.contentFrame(); await frame.waitForSelector('.borang-rekod-table', {state: 'attached'});
    assert.equal(await frame.locator('.borang-rekod-table tbody tr').count(), 24);
    assert.equal(await frame.locator('#arkib9-print-help').count(), 0);
    await page.evaluate(() => {closeM('m-arkib9-preview');});
    for (const module of ['perolehan', 'daftar', 'pinjam', 'pulang', 'tempahan', 'kad', 'scan', 'opac']) {
      await page.evaluate(module => nav(module), module);
      assert.ok((await page.locator('#content').textContent()).trim().length > 0, module);
    }
    const actions = await page.evaluate(() => window.__qaRequests);
    assert.ok(actions.every(a => ['get_borang9_data', 'get_disposal_data', 'get_next_accession_number', 'get_reservations'].includes(a)), JSON.stringify(actions));
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'browser-results.json'), JSON.stringify({passed: true, layout, errors, actions}, null, 2));
    console.log('PDF/browser QA artifacts: ' + output);
  } finally {await browser.close();}
});
