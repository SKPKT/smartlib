"""Extract the local PSS reference; never publish the input or generated data."""
import argparse
from collections import Counter, defaultdict
import hashlib
import json
import re

import pdfplumber

CODE = r'\d{3}(?:[.,]\s*\d+)*(?:\s*[�–—-]\s*\d{3})?'
ENTRY = re.compile(rf'^({CODE})(?:\s+-)?\s+(.+)$')
HEADING = re.compile(r'^(NOMBOR\s+PENGELASAN|SENARAI RINGKAS|RINGKASAN|MODUL PSS)')
NOTE = re.compile(r'\b(?:Termasuk|Misalnya|Kelaskan|Kelas di sini|Lihat|Contoh\s*:)\b', re.I)
FIELDS = 'id nombor_ddc kelas_utama subjek penerangan kata_kunci nota_pengkelasan rujukan_silang halaman_pdf nama_sumber status_semakan catatan nilai_asal cadangan_pembetulan tarikh_kemaskini'.split()


def norm(s):
    return ' '.join(re.findall(r'\w+', s.casefold()))


def parse(pages, date):
    if len(pages) != 45 or any(not t.strip() for t in pages):
        raise ValueError('Semua 45 halaman perlu mempunyai teks yang boleh disemak.')
    raw, orphans = [], []
    for page, content in enumerate(pages, 1):
        current, example, in_note = [None, None], False, False
        for line in content.splitlines():
            s = line.strip()
            if not s or HEADING.match(s):
                continue
            if page == 45 and s == 'CONTOH':
                example, in_note = True, False
                continue
            if page == 45 and s.startswith('NOTA '):
                in_note = True
                raw.append(dict(page=page, code='', text=s, kind='nota'))
                continue
            if in_note:
                raw[-1]['text'] += ' ' + s
                continue
            parts = [(0, s)]
            if page in (2, 3, 4):
                # Summary pages contain two independent columns, including continued labels.
                right = re.search(r'(?<!\S)\d{3}(?=\s)', line[35:])
                if right:
                    at = right.start() + 35
                    parts = [(0, line[:at].strip()), (1, line[at:].strip())]
                elif len(line) - len(line.lstrip()) >= 40:
                    parts = [(1, s)]
                else:
                    split = re.split(r'\s{9,}(?=\S)', s, maxsplit=1)
                    if len(split) == 2:
                        parts = list(enumerate(split))
            if example:
                split = re.search(r'\s+(\d{3}(?:\.\d+)?)\s+(?=Geografi)', s)
                if split:
                    parts = [(0, s[:split.start()]), (1, s[split.start(1):])]
            for col, text in parts:
                if not text:
                    continue
                match = ENTRY.match(text)
                if match:
                    record = dict(page=page, code=match[1], text=match[2], kind='contoh' if example else 'ringkasan' if page <= 4 else 'entri')
                    raw.append(record)
                    current[col] = record
                elif current[col] is not None:
                    current[col]['text'] += ' ' + text
                else:
                    orphans.append([page, text])
                    raw.append(dict(page=page, code='', text=text, kind='nota'))

    merged = {}
    for x in raw:
        text, original, page, kind = x['text'], x['code'], x['page'], x['kind']
        code = re.sub(r'\s+', '', original).replace(',', '.') if re.fullmatch(r'\d{3}(?:[.,]\s*\d+)?', original) else original
        pos = NOTE.search(text)
        desc, note = (text[:pos.start()].rstrip(' .,:;'), text[pos.start():]) if pos and pos.start() else (text, '')
        subject = re.split(r'\s*\.\s+(?=[A-Z])|\s*\(', desc, maxsplit=1)[0].strip() or desc
        cross = ', '.join(dict.fromkeys(re.findall(r'\b(?:di|lihat)\s+(\d{3}(?:\.\d+)?)\b', text, re.I)))
        identity = '|'.join((code, norm(subject), kind if kind in ('contoh','nota') else 'kod'))
        occurrence = f'{page}: {original} {text}'.strip()
        if identity in merged:
            y = merged[identity]
            y['pages'].add(page)
            y['occurrences'].append(occurrence)
            if len(desc) > len(y['penerangan']):
                y['penerangan'] = desc
            if note and norm(note) not in norm(y['nota_pengkelasan']):
                y['nota_pengkelasan'] = ' | '.join(filter(None,[y['nota_pengkelasan'], note]))
            y['rujukan_silang'] = ', '.join(dict.fromkeys(filter(None, [*y['rujukan_silang'].split(', '), *cross.split(', ')])))
            if kind == 'entri':
                y['kind'] = kind
            continue
        merged[identity] = dict(id='ddc-'+hashlib.sha256(identity.encode()).hexdigest()[:20], nombor_ddc=code,
            kelas_utama=code[0]+'00' if code and code[0].isdigit() else '', subjek=subject if kind!='nota' else '',
            penerangan=desc if desc!=subject or kind=='nota' else '', kata_kunci=norm(subject), nota_pengkelasan=note,
            rujukan_silang=cross, pages={page}, nama_sumber='sistem-pengkelasan-dewey.pdf', status_semakan='Disahkan',
            catatan='', occurrences=[occurrence], cadangan_pembetulan='', tarikh_kemaskini=date, kind=kind)
        if original != code:
            merged[identity].update(status_semakan='Perlu Semakan', catatan='Ruang/tanda perpuluhan asal perlu disemak.', cadangan_pembetulan=code)

    groups = defaultdict(list)
    for r in merged.values():
        if r['kind']=='entri':
            groups[r['nombor_ddc']].append(r)
    for r in merged.values():
        c, source_pages, kind = r['nombor_ddc'], sorted(r['pages']), r['kind']
        if kind=='nota' or (not re.fullmatch(r'\d{3}(?:\.\d+)?', c) and not re.search(r'[�–—-]', c)) or 'belum ditentukan' in norm(r['subjek']):
            r.update(status_semakan='Tidak Lengkap', catatan='Tiada nombor pengelasan tunggal yang lengkap atau label belum ditentukan.')
        elif kind=='contoh' or re.search(r'[�–—-]', c) or '�' in r['subjek'] or '�' in r['penerangan'] or '�' in r['nota_pengkelasan']:
            r.update(status_semakan='Perlu Semakan', catatan='Contoh, julat, atau glif sumber perlu dirujuk pada PDF.')
        if len(groups[c])>1 and kind=='entri':
            r.update(status_semakan='Konflik', catatan='Kod sama dengan label berbeza dalam entri terperinci; semak semua kejadian.')
        if c=='130' and 14 in source_pages:
            r.update(status_semakan='Konflik', catatan='130 pada halaman 14 bercanggah dengan ringkasan halaman 2 (340).', cadangan_pembetulan='340')
        if c=='889.285' and 38 in source_pages:
            r.update(status_semakan='Perlu Semakan', catatan='Awalan tidak sepadan dengan siri Kesusasteraan Melayu pada halaman yang sama.', cadangan_pembetulan='899.285')
        if c in ('959.51032','959.5104') and 42 in source_pages:
            r.update(status_semakan='Perlu Semakan', catatan='Julat tahun pada teks sumber menurun; jangan gunakan sebagai keputusan muktamad.')
        if c=='915.95' and 45 in source_pages:
            r.update(status_semakan='Konflik', catatan='Contoh Geografi Sabah tidak sepadan dengan contoh 915.953 pada halaman sama.')
        if kind=='ringkasan' and groups[c] and c!='340' and not r['catatan']:
            r.update(status_semakan='Perlu Semakan', catatan='Label ringkasan berbeza daripada entri terperinci dengan kod sama.')
        if len(r['occurrences'])>1:
            r['catatan'] = (r['catatan']+' ' if r['catatan'] else '') + f"{len(r['occurrences'])} kejadian digabungkan; nilai asal dikekalkan."
        r['halaman_pdf'] = ', '.join(map(str,source_pages))
        r['nilai_asal'] = '\n'.join(r['occurrences'])
    rows = sorted(merged.values(), key=lambda r:(r['nombor_ddc'],r['halaman_pdf'],r['id']))
    return {'columns': FIELDS, 'rows':[[r[k] for k in FIELDS] for r in rows], 'qa':{'pages':len(pages), 'occurrences':len(raw),
        'statuses':dict(Counter(r['status_semakan'] for r in rows)), 'orphans':orphans}}


if __name__=='__main__':
    from pathlib import Path
    p=argparse.ArgumentParser()
    p.add_argument('pdf',type=Path); p.add_argument('output',type=Path); p.add_argument('--date',required=True)
    args=p.parse_args()
    with pdfplumber.open(args.pdf) as pdf:
        pages=[page.extract_text(layout=True) or '' for page in pdf.pages]
    result=parse(pages,args.date)
    args.output.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(result['qa'],ensure_ascii=True))
