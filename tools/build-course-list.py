#!/usr/bin/env python3
"""v113: build data/us-courses.json (the "Courses near me" finder list) from the OpenGolfAPI US download.

  curl -LO https://github.com/opengolfapi/data/releases/latest/download/opengolfapi-us.ndjson.gz && gunzip opengolfapi-us.ndjson.gz
  python3 tools/build-course-list.py opengolfapi-us.ndjson

Keeps only name, city, state, lat/lng (4 decimals, about 10 m), course size (9/18, from par) and par for US courses.
Data licence: ODbL 1.0 – "Contains data from OpenGolfAPI (opengolfapi.org)", © OpenStreetMap contributors.
"""
import json, re, sys, gzip
src = sys.argv[1] if len(sys.argv) > 1 else 'opengolfapi-us.ndjson'
rows = []
for line in open(src, encoding='utf-8'):
    f = json.loads(line); p = f['properties']
    if p.get('country') != 'US': continue
    lng, lat = f['geometry']['coordinates']
    if lat is None or lng is None: continue
    name = re.sub(r'(?<=[a-z])tm\b', '', (p.get('name') or '').strip())  # a few names end in a run-together "tm" (trademark sign)
    rows.append([name, (p.get('city') or '').strip(), p.get('state') or '', round(lat, 4), round(lng, 4), p.get('holes') or 0, p.get('par') or 0])
# OpenStreetMap often maps one club many times (one entry per hole or nine). Keep one row per name + state within 1 mile.
from math import radians, sin, cos, asin, sqrt
def miles(a, b):
    p1, p2 = radians(a[3]), radians(b[3]); dl = radians(b[4] - a[4])
    return 2 * 3958.8 * asin(sqrt(sin((p2 - p1) / 2) ** 2 + cos(p1) * cos(p2) * sin(dl / 2) ** 2))
# OpenGolfAPI's "holes" is how many holes its scorecard has (often partial, e.g. 14 of 18), so the course size comes from
# the total par instead: 54+ is an 18-hole course (54 = 18 par-3s), 27–37 is a nine; anything unclear is left blank.
def size(holes, par):
    if par >= 54 or holes >= 10: return 18
    if 27 <= par <= 37 or holes == 9: return 9
    return 0
for r in rows: r[5] = size(r[5], r[6])
groups, kept = {}, []
for r in rows:
    k = (re.sub(r'[^a-z0-9]+', ' ', r[0].lower()).strip(), r[2]); same = next((o for o in groups.get(k, []) if miles(o, r) < 1), None)
    if same is None: groups.setdefault(k, []).append(r); kept.append(r)
    else: same[5] = max(same[5], r[5])
rows = kept
rows.sort(key=lambda r: (r[2], r[0]))
out = {'v': 1, 'source': 'Contains data from OpenGolfAPI (opengolfapi.org), US release, ODbL 1.0 – © OpenStreetMap contributors',
       'fields': ['name', 'city', 'state', 'lat', 'lng', 'holes', 'par'], 'courses': rows}
b = json.dumps(out, separators=(',', ':'), ensure_ascii=False).encode()
open('data/us-courses.json', 'wb').write(b)
print(len(rows), 'courses,', len(b), 'bytes,', len(gzip.compress(b, 9)), 'bytes gzipped')
