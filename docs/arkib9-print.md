# Cetakan Borang 9 / Arkib 9/08

Dokumen cetakan SMARTLIB dibuka menggunakan `window.open()` atau iframe sekiranya popup disekat. Alamat dokumen sementara itu boleh menjadi `about:blank`. SMARTLIB tidak menulis alamat tersebut dalam borang atau ruang tandatangan.

Untuk cetakan atau PDF tanpa footer alamat:

1. Jana Borang 9 seperti biasa dan klik **Cetak Borang**.
2. Dalam dialog cetakan pelayar, pilih kertas **A4** dan **Portrait**.
3. Buka **More settings** dan nyahpilih **Headers and footers**.
4. Untuk fail PDF, pilih **Destination → Save as PDF**, kemudian simpan.

Pilihan header/footer dikawal oleh pelayar. JavaScript laman tidak mengubah pilihan tersebut. Menukar tajuk dokumen atau alamat popup juga tidak mematikan footer pelayar.

Panduan ringkas dipaparkan dalam preview SMARTLIB menggunakan komponen asal. Panduan berada di luar dokumen rasmi dan tidak dimasukkan dalam cetakan. Reka bentuk A4, kolum, border, header jadual berulang, pembalutan teks dan tandatangan asal dikekalkan. Tiada perubahan Apps Script diperlukan untuk kemas kini ini.

Rujukan: [Microsoft — Print in Microsoft Edge](https://support.microsoft.com/en-us/edge/print-in-microsoft-edge), [MDN — window.print()](https://developer.mozilla.org/en-US/docs/Web/API/Window/print).

## Ujian

```sh
node --test tests/arkib9-print.test.cjs
```

Lapan ujian asas menggunakan Node.js terbina dalam. Ujian pelayar/PDF tambahan diaktifkan dengan `SMARTLIB_BROWSER_QA=1`; sediakan Playwright melalui `PLAYWRIGHT_MODULE` jika perlu, Chrome melalui `SMARTLIB_CHROME`, dan direktori output melalui `SMARTLIB_QA_OUTPUT`. Semua data sintetik; permintaan luar dipintas dan tiada data Google Sheets sebenar digunakan.

Ujian pelayar menghasilkan PDF dengan header/footer hidup dan dimatikan untuk membandingkan punca footer, serta memeriksa popup, fallback iframe, 24 naskhah, enam kolum, pembalutan teks dan smoke test navigasi modul. Hasil PDF perlu dirender dan diperiksa sebelum perubahan cetakan lain diterbitkan.
