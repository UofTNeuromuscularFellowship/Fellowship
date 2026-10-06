#!/usr/bin/env python3
"""Apply a content patch to the NMDx compendium (src/data/compendium.html).

The compendium keeps its entries as one JSON line (`const DATA = [...]`) and the
review-article citations as another (`const REFS = {...}`). A patch is a JSON
file:

  {
    "refs": {"izenberg2023": {"cite": "<html citation>", "short": "Izenberg 2023",
                              "plain": "<plain-text citation>", "text": "path/to/source.txt"}},
    "entries": {
      "<entry id>": {
        "summary": "replacement summary",                 # optional
        "replace": {"management": "whole new section"},   # optional
        "append":  {"clinical": ["new paragraph [R:izenberg2023]"]},
        "aliases_add": ["..."], "features_add": ["..."],
        "sources_add": [{"src": "ref", "key": "izenberg2023"}]
      }
    }
  }

Each paragraph drawn from a review article ends with [R:<key>], which the page
renders as an author-year tag. Before writing, every new or changed paragraph
is checked against its source's extracted text: any run of 8 or more words
copied verbatim is reported and the patch is refused (pass --force to write
anyway). Usage:

  python3 tools/nmdx/update.py patch.json [--dry-run] [--force]
"""
import json, re, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
HTML = ROOT / 'src/data/compendium.html'
SECTIONS = ['clinical', 'investigations', 'differential', 'management']
N = 8


def load():
    lines = HTML.read_text().split('\n')
    di = next(i for i, l in enumerate(lines) if l.startswith('const DATA = '))
    ri = next(i for i, l in enumerate(lines) if l.startswith('const REFS = '))
    fi = next(i for i, l in enumerate(lines) if l.startswith('const FEATURES = ['))
    data = json.loads(lines[di][len('const DATA = '):].rstrip().rstrip(';'))
    refs = json.loads(lines[ri][len('const REFS = '):].rstrip().rstrip(';'))
    # feature keys, from the FEATURES block (rows like ["key","Label"])
    block = '\n'.join(lines[fi:fi + 40])
    block = block[:block.index('];') + 1]
    feats = set(re.findall(r'\["([a-z0-9-]+)",\s*"', block))
    return lines, di, ri, data, refs, feats


def words(t):
    return re.findall(r"[a-z0-9]+", t.lower())


def shingles(t):
    w = words(t)
    return {' '.join(w[i:i + N]) for i in range(len(w) - N + 1)}


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    dry, force = '--dry-run' in sys.argv, '--force' in sys.argv
    patch = json.loads(pathlib.Path(args[0]).read_text())
    lines, di, ri, data, refs, feats = load()
    refs.update({k: {kk: vv for kk, vv in v.items() if kk != 'text'} for k, v in patch.get('refs', {}).items()})
    src_text = {k: pathlib.Path(v['text']).read_text() for k, v in patch.get('refs', {}).items() if v.get('text')}
    src_sh = {k: shingles(t) for k, t in src_text.items()}
    by_id = {e['id']: e for e in data}
    problems, report = [], []

    def check(eid, field, para):
        for key in re.findall(r'\[R:([a-z0-9_-]+)\]', para):
            if key not in refs:
                problems.append(f'{eid}.{field}: unknown ref {key}')
            elif key in src_sh:
                hits = shingles(para) & src_sh[key]
                if hits:
                    problems.append(f'{eid}.{field}: {len(hits)} copied 8-word run(s) from {key}, {sorted(hits)}')

    for eid, ch in patch.get('entries', {}).items():
        e = by_id.get(eid)
        if not e:
            problems.append(f'unknown entry {eid}')
            continue
        if 'summary' in ch:
            check(eid, 'summary', ch['summary']); e['summary'] = ch['summary']
        for sec, text in ch.get('replace', {}).items():
            assert sec in SECTIONS, sec
            for p in re.split(r'\n\n+', text): check(eid, sec, p)
            e[sec] = text
        for sec, paras in ch.get('append', {}).items():
            assert sec in SECTIONS, sec
            for p in paras: check(eid, sec, p)
            e[sec] = (e.get(sec, '').rstrip() + '\n\n' + '\n\n'.join(paras)).strip()
        for a in ch.get('aliases_add', []):
            if a not in e.setdefault('aliases', []): e['aliases'].append(a)
        for f in ch.get('features_add', []):
            if f not in feats: problems.append(f'{eid}: unknown feature {f}')
            elif f not in e.setdefault('features', []): e['features'].append(f)
        for s in ch.get('sources_add', []):
            if s not in e.setdefault('sources', []): e['sources'].append(s)
        used = set(re.findall(r'\[R:([a-z0-9_-]+)\]', json.dumps(e)))
        listed = {s.get('key') for s in e.get('sources', []) if s.get('src') == 'ref'}
        for k in used - listed:
            problems.append(f'{eid}: cites {k} in text but not in sources')
        report.append(f'  {eid}: ' + ', '.join(
            [f'summary' for _ in [1] if 'summary' in ch] +
            [f'replaced {s}' for s in ch.get('replace', {})] +
            [f'+{len(p)} {s}' for s, p in ch.get('append', {}).items()]))

    print('\n'.join(report))
    if problems:
        print('PROBLEMS:\n  ' + '\n  '.join(problems))
        if not force: sys.exit(1)
    if dry:
        print('dry run, nothing written'); return
    lines[di] = 'const DATA = ' + json.dumps(data, ensure_ascii=False) + ';'
    lines[ri] = 'const REFS = ' + json.dumps(refs, ensure_ascii=False) + ';'
    HTML.write_text('\n'.join(lines))
    print(f'wrote {HTML.relative_to(ROOT)} ({len(patch.get("entries", {}))} entries)')


if __name__ == '__main__':
    main()
