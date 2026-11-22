"""
Unpack Sweet Home 3D furniture libraries (.sh3f) and build a searchable catalogue plus preview sheets.

Usage (plain Python 3 with Pillow, not Blender):
  python tools/blender/sh3d_catalog.py --root <folder holding packs/> [--group closet "wardrobe|shoe|dress"] ...

  --root   folder holding packs/*.sh3f; writes extracted/<pack>/, catalog.json and preview/
  --group  NAME REGEX  (repeatable) adds a preview sheet of models whose name or tags match REGEX.
           Without --group, the default room groups below are used.

Each model gets a short code: pack letters + its catalogue number (C178 = Contributions #178).
That number is what sh3d_to_glb.py takes as --index.
"""
import argparse, json, os, re, zipfile

CODES = {'BlendSwap-CC-0': 'B0', 'BlendSwap-CC-BY': 'BB', 'Contributions': 'C', 'KatorLegaz': 'K',
         'LucaPresidente': 'L', 'Reallusion': 'R', 'Scopia': 'S', 'Trees': 'T'}
DEFAULT_GROUPS = {
    'closet': r'wardrobe|closet|cloth|dress|shoe|boot|hanger|coat|bag|hat|mannequin|jewel|vanity|dressing|make.?up|perfume|mirror|rack',
    'decor': r'vase|plant|flower|book|frame|picture|painting|poster|cushion|pillow|candle|clock|sculpt|statue|bowl|basket|globe|record|guitar|piano|radio|tv|television|aquarium|cat|dog|toy|teddy|rug|carpet|curtain',
    'seating': r'sofa|couch|armchair|chair|ottoman|pouf|stool|bench|chaise|bean',
    'tables': r'coffee table|side table|bedside|night|console|desk|dresser|sideboard|cabinet|shelf|shelving|bookcase|chest',
    'lights': r'lamp|light|chandelier|pendant|sconce',
    'bedroom': r'\bbed\b|bunk|cradle|crib',
}
SKIP_CATEGORIES = {'Exterior', 'Vehicles', 'Staircases', 'Doors and windows', 'Kitchen', 'Bathroom'}
SKIP_WORDS = r'outdoor|garden|exterior|car\b|truck|stair|window|door|toilet|sink|shower|bath|oven|fridge|kitchen|washing|radiator|garage|fence|pool'


def unpack(root):
    rows = []
    for f in sorted(os.listdir(os.path.join(root, 'packs'))):
        if not f.endswith('.sh3f'):
            continue
        pack = f[:-5]
        z = zipfile.ZipFile(os.path.join(root, 'packs', f))
        for n in z.namelist():  # refuse archives that write outside their folder
            if '..' in n.split('/') or n.startswith('/') or ':' in n:
                raise SystemExit(f'unsafe path in {f}: {n}')
        dest = os.path.join(root, 'extracted', pack)
        if not os.path.isdir(dest):
            z.extractall(dest)
        txt = z.read('PluginFurnitureCatalog.properties').decode('latin-1')
        txt = re.sub(r'\\u([0-9a-fA-F]{4})', lambda m: chr(int(m.group(1), 16)), txt)
        entries = {}
        for line in txt.splitlines():
            m = re.match(r'([A-Za-z]+)#(\d+)\s*=\s*(.*)', line)
            if m:
                entries.setdefault(int(m.group(2)), {})[m.group(1)] = m.group(3).strip()
        for i, e in sorted(entries.items()):
            rows.append({'code': f'{CODES.get(pack, pack)}{i}', 'pack': pack, 'index': i, **e})
    json.dump(rows, open(os.path.join(root, 'catalog.json'), 'w', encoding='utf-8'), indent=0, ensure_ascii=False)
    return rows


def sheets(root, rows, groups):
    from PIL import Image, ImageDraw, ImageFont
    out = os.path.join(root, 'preview')
    os.makedirs(out, exist_ok=True)
    try:
        font = ImageFont.truetype('segoeui.ttf', 13); bold = ImageFont.truetype('segoeuib.ttf', 14); title = ImageFont.truetype('segoeuib.ttf', 30)
    except OSError:
        font = bold = title = ImageFont.load_default()
    cell, cols, pad = 150, 10, 8
    seen, index = set(), []
    for g, pat in groups.items():
        items = [r for r in rows if r['code'] not in seen and r.get('category') not in SKIP_CATEGORIES
                 and not re.search(SKIP_WORDS, r.get('name', '') + ' ' + r.get('tags', ''), re.I)
                 and re.search(pat, r.get('name', '') + ' ' + r.get('tags', ''), re.I)]
        seen.update(r['code'] for r in items)
        sheet = Image.new('RGB', (cols * cell, 60 + -(-len(items) // cols) * (cell + 34)), '#FAF6EF')
        d = ImageDraw.Draw(sheet)
        d.text((pad, 12), f'{g}  ({len(items)})', fill='#3B0A1E', font=title)
        for k, r in enumerate(items):
            x, y = (k % cols) * cell, 60 + (k // cols) * (cell + 34)
            try:
                ic = Image.open(os.path.join(root, 'extracted', r['pack'], r['icon'].lstrip('/'))).convert('RGBA')
                ic.thumbnail((cell - 2 * pad, cell - 2 * pad))
                bg = Image.new('RGBA', ic.size, 'white'); bg.alpha_composite(ic)
                sheet.paste(bg.convert('RGB'), (x + (cell - ic.width) // 2, y + pad))
            except OSError:
                d.text((x + pad, y + pad), 'no icon', fill='red', font=font)
            d.text((x + pad, y + cell - 6), r['code'], fill='#B0123A', font=bold)
            d.text((x + pad, y + cell + 10), r.get('name', '')[:20], fill='#222', font=font)
            index.append('\t'.join([r['code'], g, r.get('name', ''), r['pack'], r.get('license', ''), r.get('creator', ''),
                                    f"{r.get('width')}x{r.get('depth')}x{r.get('height')}cm", r.get('model', '')]))
        sheet.save(os.path.join(out, f'{g}.jpg'), quality=85)
        print(g, len(items))
    open(os.path.join(out, 'index.tsv'), 'w', encoding='utf-8').write('code\tgroup\tname\tpack\tlicense\tcreator\tsize\tmodel\n' + '\n'.join(index))


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--root', required=True)
    ap.add_argument('--group', nargs=2, action='append', metavar=('NAME', 'REGEX'))
    a = ap.parse_args()
    rows = unpack(a.root)
    print(len(rows), 'models catalogued')
    sheets(a.root, rows, dict(a.group) if a.group else DEFAULT_GROUPS)
