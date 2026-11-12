# LIBRA AI untuk SMARTLIB

LIBRA dibuka melalui robot terapung untuk sesi Admin/GPM. Kod paparan dimuatkan apabila panel dibuka. Katalog penuh kekal dalam Google Sheet persendirian; jangan letakkannya dalam fail perolehan yang dikongsi atau GitHub Pages. Dewey Advisor menggunakan katalog; Program Planner boleh berfungsi tanpanya.

## Aktifkan Apps Script

1. Buka **projek Apps Script sedia ada** dan semak **Deploy → Manage deployments**. Pastikan URL deployment `/exec` ialah URL `GAS` dalam `index.html`. Kekalkan kod dan deployment asal.
2. Pasang fail [`Libra.gs`](../apps-script/Libra.gs), [`LibraGemini.gs`](../apps-script/LibraGemini.gs) dan [`LibraPlanner.gs`](../apps-script/LibraPlanner.gs) dalam projek yang sama. Bandingkan `Libra.gs` sedia ada dahulu dan gabungkan sebarang perubahan tersendiri. Dalam `prosesPermintaan(p)` di `Code.gs`, pastikan baris berikut wujud sekali sahaja di dalam blok `try`, sejurus sebelum `switch(action)`, **selepas** pemeriksaan sesi. Jangan tambah mana-mana `libra_*` kepada `PUBLIC_ACTIONS` atau senarai guru.

   ```js
   if (action.startsWith('libra_')) return libraDispatch(action, p, sessionInfo);
   ```

3. Dalam **Project Settings → Script Properties** tetapkan `LIBRA_DEWEY_SHEET_ID` kepada ID fail Google Sheets persendirian `rujukan_dewey` (bahagian antara `/d/` dan `/edit`). Akaun yang menjalankan web app mesti sudah mempunyai akses ke fail itu. Jangan aktifkan perkongsian awam.
4. Simpan `GEMINI_API_KEY` dan `LIBRA_GEMINI_MODEL` dalam Script Properties sahaja. Model cadangan: [`gemini-3.5-flash-lite`](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite). Akses sebenar bergantung pada projek/key. Jalankan `libraVerifyGeminiSetup` dari editor untuk menguji sambungan, Dewey 027.8 dan Planner 1/10 program dengan input generik. Jika model kosong, fungsi ini menyimpan model cadangan **hanya selepas** ujian Gemini berjaya; log menyatakan `modelSaved`. Model sedia ada tidak ditukar. Log hanya melaporkan status, model dan kaedah, bukan key, prompt atau respons mentah.
5. Klik **Save → Deploy → Manage deployments → Edit → New version → Deploy** untuk deployment yang sama. Jangan jalankan `setupAwal()` dan jangan ubah akses web app. Selepas deploy, buka LIBRA dalam sesi Admin/GPM dan semak carian `027.8`, `635`, `130` serta Program Planner. Semak melalui OPAC bahawa robot tidak dipaparkan. Jangan guna rekod produksi untuk menguji butang Terima jika perubahan sebenar tidak dikehendaki.

## Katalog dan semakan

- `Disahkan` bermaksud sepadan dengan sumber PDF dan tiada isu dikesan pada entri itu semasa import; ia bukan pengesahan edisi DDC terkini. Semua cadangan kekal tertakluk kepada GPM.
- `nilai_asal` menyimpan setiap kejadian bersama halamannya. `cadangan_pembetulan` berasingan daripada nilai asal. Konflik dan rujukan tidak lengkap boleh dilihat tetapi tidak boleh diterima sebagai perubahan rekod.
- Kod `FM`, `FI`, `FC`, dan `FT` tidak ditukar oleh LIBRA. Untuk kod angka, hanya awalan DDC berubah; tanda pemisah, kod pengarang, tahun dan jilid kekal. Setiap pengesahan direkodkan dalam `audit_dewey` dalam fail persendirian. Semakan ditolak tidak mengubah rekod buku.
- Planner menggunakan pilihan jenis, sasaran, keperluan peserta, tempoh, bajet, bilangan dan tema program. Ia tidak memerlukan Dewey dan tidak membaca koleksi secara lalai. Hanya jika arahan meminta “sertakan analisis Dewey”, laporan berasingan memaparkan kiraan kelas aktif. Analisis itu tidak dihantar kepada Gemini.
- Teks bebas tidak dihantar kepada Gemini. Sistem mengambil bilangan program dan istilah program yang dikenali, serta menyesuaikan kategori peserta yang diketahui jika pilihan lalai digunakan. Kertas kerja, tentatif, bajet dan KPI ialah draf bagi kad yang dipilih; draf boleh diedit sebelum disalin, dimuat turun atau dicetak. Gunakan “Simpan sebagai PDF” dalam dialog cetak pelayar.

## Naik taraf dan diagnostik

Pasang ketiga-tiga fail LIBRA bersama-sama dan terbitkan versi baharu pada deployment Apps Script yang sama. Router `Code.gs` tidak perlu ditulis semula jika laluan sudah wujud. Laluan lama Planner berasaskan koleksi dikekalkan untuk klien lama.

- `libra_status` biasa membaca status tanpa panggilan Gemini. Klik **Uji sambungan Gemini** untuk probe JSON kecil. Keadaan *configured* belum membuktikan akses; *connected* bermaksud penjanaan telah berjaya. Cache bergantung pada model dan key, 180 saat untuk kejayaan atau 60 saat untuk kegagalan. Semakan aktif tertakluk kepada had yang sama seperti penjanaan.
- Keputusan Planner yang gagal ditanda **Mod Templat — Gemini AI tidak digunakan** dan menyertakan diagnostik selamat. Dewey menggunakan padanan katalog sahaja apabila Gemini gagal. Tiada penulisan buku tanpa semakan GPM.
- Output Planner disemak semula pada backend untuk tepat 1–10 program, medan yang diperlukan, kepelbagaian program dan had bajet. Bilangan diperiksa di SMARTLIB supaya skema bersarang tidak menjadi terlalu kompleks untuk API. Percubaan kedua hanya untuk JSON tidak sah, respons tidak lengkap atau skema tidak lulus; tiada retry automatik untuk key, kuota atau HTTP 400.

Jika borang baharu dibuka sebelum Apps Script dikemas kini, Planner menggunakan templat umum daripada modul keserasian. Label pada draf menyatakan bahawa Gemini dan analisis sebenar belum digunakan. Bina semula modul dengan `node tools/build-libra-planner-template.cjs` apabila templat Apps Script berubah.

## Import semula

Ekstrak secara tempatan dengan `python tools/extract-dewey.py <PDF> <output-private.json> --date YYYY-MM-DD` (`pdfplumber` diperlukan). Jangan commit PDF, JSON atau workbook. Semak tab persendirian dan bandingkan `id` sebelum menambah data. Tambah hanya ID yang belum wujud, dalam format teks. Jika ID sedia ada mempunyai perbezaan, semak secara manual; jangan timpa status, ID, nombor asal, atau keputusan GPM. Cache carian tamat selepas dua minit; simpanan GPM membaca status terkini terus daripada Sheet.

## Ujian tempatan

`node --test tests/libra.test.cjs` menjalankan ujian keputusan dan kawalan simpanan dengan data ujian. Tetapkan `LIBRA_LOCAL_CATALOG` kepada laluan JSON persendirian untuk turut menguji kod dan halaman PDF sebenar. Tetapkan `LIBRA_BROWSER_QA=1`, `PLAYWRIGHT_MODULE` dan `SMARTLIB_CHROME` untuk ujian panel dalam pelayar.
