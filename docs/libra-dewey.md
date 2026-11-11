# LIBRA AI untuk SMARTLIB

LIBRA dibuka melalui robot terapung untuk sesi Admin/GPM. Kod paparan dimuatkan apabila panel dibuka. Katalog penuh kekal dalam Google Sheet persendirian; jangan letakkannya dalam fail perolehan yang dikongsi atau GitHub Pages.

## Aktifkan Apps Script

1. Buka **projek Apps Script sedia ada** dan semak **Deploy → Manage deployments**. Pastikan URL deployment `/exec` ialah URL `GAS` dalam `index.html`. Kekalkan kod dan deployment asal.
2. Tambah fail skrip bernama `Libra` dan salin kandungan [`apps-script/Libra.gs`](../apps-script/Libra.gs). Dalam `prosesPermintaan(p)` di `Code.gs`, tambah baris berikut di dalam blok `try`, sejurus sebelum `switch(action)`, **selepas** pemeriksaan sesi. Jangan tambah mana-mana `libra_*` kepada `PUBLIC_ACTIONS` atau senarai guru.

   ```js
   if (action.startsWith('libra_')) return libraDispatch(action, p, sessionInfo);
   ```

3. Dalam **Project Settings → Script Properties** tetapkan `LIBRA_DEWEY_SHEET_ID` kepada ID fail Google Sheets persendirian `rujukan_dewey` (bahagian antara `/d/` dan `/edit`). Akaun yang menjalankan web app mesti sudah mempunyai akses ke fail itu. Jangan aktifkan perkongsian awam.
4. Untuk AI generatif, tetapkan `GEMINI_API_KEY` dan `LIBRA_GEMINI_MODEL` kepada model `gemini-…` yang tersedia untuk projek Google AI dan menyokong respons JSON pada `generateContent`. Simpan kedua-duanya dalam Script Properties sahaja. Tanpa konfigurasi itu, padanan katalog dan cadangan program templat masih berfungsi dengan label yang jelas.
5. Klik **Save → Deploy → Manage deployments → Edit → New version → Deploy** untuk deployment yang sama. Jangan jalankan `setupAwal()` dan jangan ubah akses web app. Selepas deploy, buka LIBRA dalam sesi Admin/GPM dan semak carian `027.8`, `635`, `130` serta Program Planner. Semak melalui OPAC bahawa robot tidak dipaparkan. Jangan guna rekod produksi untuk menguji butang Terima jika perubahan sebenar tidak dikehendaki.

## Katalog dan semakan

- `Disahkan` bermaksud sepadan dengan sumber PDF dan tiada isu dikesan pada entri itu semasa import; ia bukan pengesahan edisi DDC terkini. Semua cadangan kekal tertakluk kepada GPM.
- `nilai_asal` menyimpan setiap kejadian bersama halamannya. `cadangan_pembetulan` berasingan daripada nilai asal. Konflik dan rujukan tidak lengkap boleh dilihat tetapi tidak boleh diterima sebagai perubahan rekod.
- Kod `FM`, `FI`, `FC`, dan `FT` tidak ditukar oleh LIBRA. Untuk kod angka, hanya awalan DDC berubah; tanda pemisah, kod pengarang, tahun dan jilid kekal. Setiap pengesahan direkodkan dalam `audit_dewey` dalam fail persendirian. Semakan ditolak tidak mengubah rekod buku.
- Planner menggunakan tajuk tersedia dan statistik yang diperoleh daripada rekod buku dan pinjaman. Data kesesuaian individu tidak dihantar kepada Gemini; GPM menilai bahan untuk murid sebenar.

## Import semula

Ekstrak secara tempatan dengan `python tools/extract-dewey.py <PDF> <output-private.json> --date YYYY-MM-DD` (`pdfplumber` diperlukan). Jangan commit PDF, JSON atau workbook. Semak tab persendirian dan bandingkan `id` sebelum menambah data. Tambah hanya ID yang belum wujud, dalam format teks. Jika ID sedia ada mempunyai perbezaan, semak secara manual; jangan timpa status, ID, nombor asal, atau keputusan GPM. Cache carian tamat selepas dua minit; simpanan GPM membaca status terkini terus daripada Sheet.

## Ujian tempatan

`node --test tests/libra.test.cjs` menjalankan ujian keputusan dan kawalan simpanan dengan data ujian. Tetapkan `LIBRA_LOCAL_CATALOG` kepada laluan JSON persendirian untuk turut menguji kod dan halaman PDF sebenar. Tetapkan `LIBRA_BROWSER_QA=1`, `PLAYWRIGHT_MODULE` dan `SMARTLIB_CHROME` untuk ujian panel dalam pelayar.
