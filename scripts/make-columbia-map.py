# Generate a stylized Columbia River overview map (Astoria -> Pasco) as SVG/HTML.
# River geometry: OpenStreetMap via Overpass (misc/columbia_centerline.json).
# Cities + windsport launches: hand-placed approximate coordinates.
# Rasterize by screenshotting misc/columbia_map.html (#map element) in a browser.
import json, math, io

W, H, PAD = 2400, 800, 40
LON_MIN, LON_MAX = -124.15, -118.90
LAT_MIN, LAT_MAX = 45.30, 46.50
COSLAT = math.cos(math.radians(46.0))

def proj(lon, lat):
    x = (lon - LON_MIN) * COSLAT
    y = (LAT_MAX - lat)
    sx = (W - 2 * PAD) / ((LON_MAX - LON_MIN) * COSLAT)
    sy = (H - 2 * PAD) / (LAT_MAX - LAT_MIN)
    s = min(sx, sy * 3.2)  # favor width; vertical exaggeration cap
    return PAD + x * sx, PAD + y * sy

data = json.load(io.open('misc/columbia_centerline.json', encoding='utf-8'))
ways = [e for e in data['elements'] if e['type'] == 'way' and 'geometry' in e]
seen = set(w.get('id') for w in ways)
# the Columbia River waterway relation carries segments whose own ways are
# unnamed — include its members to close the gaps (estuary, Kalama reach)
for e in data['elements']:
    if e['type'] == 'relation':
        for m in e.get('members', []):
            if m.get('type') == 'way' and 'geometry' in m and m.get('ref') not in seen:
                seen.add(m.get('ref'))
                ways.append({'geometry': m['geometry']})
print('river ways:', len(ways))

LAT_CLIP = 46.34  # trim the Hanford Reach spur that exits the frame past Pasco

def river_width(lon):
    if lon < -123.40: return 17   # estuary
    if lon < -122.00: return 11   # lower river
    if lon < -120.00: return 8    # gorge
    return 8                      # upper river

paths = []
for w in ways:
    pts = [(g['lon'], g['lat']) for g in w['geometry'] if g]
    if len(pts) < 2: continue
    # split the polyline where it exceeds the clip latitude (upstream spur);
    # east of -119.5 only, so the (lower-lat) main stem is never touched
    runs, cur = [], []
    for lon, lat in pts:
        if lat > LAT_CLIP and lon > -119.5:
            if len(cur) >= 2: runs.append(cur)
            cur = []
        else:
            cur.append((lon, lat))
    if len(cur) >= 2: runs.append(cur)
    for run in runs:
        width = river_width(sum(p[0] for p in run) / len(run))
        d = 'M' + ' L'.join('%.1f,%.1f' % proj(lon, lat) for lon, lat in run)
        paths.append((d, width))

# (name, lat, lon, dx, dy, anchor)  — label offset tweaks for dense clusters
CITIES = [
    ('Astoria',        46.1879, -123.8313,   0, -14, 'middle'),
    ('Vancouver',      45.6387, -122.6615,   0, -14, 'middle'),
    ('Portland',       45.5152, -122.6784,   0,  20, 'middle'),
    ('Stevenson',      45.6957, -121.8845,   0, -16, 'middle'),
    ('Hood River',     45.7054, -121.5215,  -4,  26, 'middle'),
    ('The Dalles',     45.5946, -121.1787,   0,  20, 'middle'),
    ('Rufus',          45.6943, -120.7456, -10, -14, 'end'),
    ('Arlington',      45.7165, -120.2014,   0,  20, 'middle'),
    ('Boardman',       45.8398, -119.7006,   0,  20, 'middle'),
    ('Pasco',          46.2396, -119.1006,  12, -10, 'start'),
]

LAUNCHES = [
    ('Jones Beach',        46.1510, -123.3580,   0,  24, 'middle'),
    ('Rooster Rock SP',    45.5470, -122.2310,   8, -12, 'start'),
    ("Bob's Beach",        45.6940, -121.8930, -14, -10, 'end'),
    ('Home Valley',        45.7100, -121.7780,   0, -14, 'middle'),
    ('Viento SP',          45.6970, -121.6680,   0,  18, 'middle'),
    ('Hood River Event Site', 45.7130, -121.5160,  18,  10, 'start'),
    ('The Hook',           45.7150, -121.5300,  -6,  26, 'end'),
    ('The Hatchery',       45.7280, -121.5410,   2, -24, 'middle'),
    ('Swell City',         45.7235, -121.5635, -16,  -4, 'end'),
    ('Mosier Launch',      45.6890, -121.3950,  14,   8, 'start'),
    ("Doug's Beach SP",    45.6840, -121.2580,   4,  18, 'middle'),
    ('Avery Park',         45.6790, -121.0890,   0, -14, 'middle'),
    ('Celilo Park',        45.6470, -120.9750,   0,  18, 'middle'),
    ('Maryhill SP',        45.6832, -120.8225, -14,  12, 'end'),
    ('Rufus / Glass Factory', 45.6960, -120.7330,  12, -10, 'start'),
    ('Giles French Park',  45.7150, -120.6930,  10,  14, 'start'),
    ('Arlington Marina',   45.7180, -120.1990, -14,   6, 'end'),
    ('Roosevelt Park',     45.7280, -120.1700,  12, -10, 'start'),
    ('Boardman Marina',    45.8420, -119.7100, -14,  -8, 'end'),
    ('Irrigon Marina',     45.8990, -119.4880, -14,  -8, 'end'),
    ('Umatilla Marina',    45.9220, -119.3430,   0, -16, 'middle'),
    ('Hood Park',          46.2150, -119.0140,   0,  18, 'middle'),
]

svg = []
svg.append('<svg id="map" xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d">' % (W, H, W, H))
svg.append('<rect width="%d" height="%d" fill="#84878b"/>' % (W, H))

# subtle state line label zones
svg.append('<text x="%d" y="34" font-family="Segoe UI, sans-serif" font-size="26" font-weight="700" fill="#f2f3f4" letter-spacing="3">COLUMBIA RIVER &#8212; ASTORIA TO PASCO</text>' % (PAD,))
svg.append('<text x="%d" y="58" font-family="Segoe UI, sans-serif" font-size="13" fill="#d8dadc">WASHINGTON (north bank) / OREGON (south bank) &#183; river geometry &#169; OpenStreetMap contributors</text>' % (PAD,))

# river: casing then fill for a crisp edge
for d, width in paths:
    svg.append('<path d="%s" fill="none" stroke="#5d6166" stroke-width="%d" stroke-linecap="round" stroke-linejoin="round"/>' % (d, width + 3))
for d, width in paths:
    svg.append('<path d="%s" fill="none" stroke="#2f7fd9" stroke-width="%d" stroke-linecap="round" stroke-linejoin="round"/>' % (d, width))

# launches: green triangles, label small italic
for name, lat, lon, dx, dy, anchor in LAUNCHES:
    x, y = proj(lon, lat)
    svg.append('<path d="M%.1f,%.1f l-6,10 l12,0 z" fill="#35d07f" stroke="#0e3d24" stroke-width="1"/>' % (x, y - 6))
    svg.append('<text x="%.1f" y="%.1f" text-anchor="%s" font-family="Segoe UI, sans-serif" font-size="12" font-style="italic" fill="#103e25" stroke="#cfd1d3" stroke-width="2.6" paint-order="stroke" stroke-linejoin="round">%s</text>'
               % (x + dx, y + dy, anchor, name))

# cities: dark dots, bold label
for name, lat, lon, dx, dy, anchor in CITIES:
    x, y = proj(lon, lat)
    svg.append('<circle cx="%.1f" cy="%.1f" r="4.5" fill="#1d1f21" stroke="#f2f3f4" stroke-width="1.4"/>' % (x, y))
    svg.append('<text x="%.1f" y="%.1f" text-anchor="%s" font-family="Segoe UI, sans-serif" font-size="13.5" font-weight="600" fill="#16181a" stroke="#caccce" stroke-width="3" paint-order="stroke" stroke-linejoin="round">%s</text>'
               % (x + dx, y + dy, anchor, name))

# legend
lx, ly = W - 330, H - 78
svg.append('<rect x="%d" y="%d" width="290" height="58" rx="8" fill="#6e7175" stroke="#f2f3f4" stroke-width="1"/>' % (lx, ly))
svg.append('<circle cx="%d" cy="%d" r="4.5" fill="#1d1f21" stroke="#f2f3f4" stroke-width="1.4"/>' % (lx + 22, ly + 20))
svg.append('<text x="%d" y="%d" font-family="Segoe UI, sans-serif" font-size="13" fill="#f2f3f4">City / town</text>' % (lx + 36, ly + 24))
svg.append('<path d="M%d,%d l-6,10 l12,0 z" fill="#35d07f" stroke="#0e3d24" stroke-width="1"/>' % (lx + 22, ly + 33))
svg.append('<text x="%d" y="%d" font-family="Segoe UI, sans-serif" font-size="13" fill="#f2f3f4">Windsport launch</text>' % (lx + 36, ly + 44))
svg.append('</svg>')

html = '<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#84878b}</style></head><body>%s</body></html>' % ''.join(svg)
io.open('misc/columbia_map.html', 'w', encoding='utf-8').write(html)
print('wrote misc/columbia_map.html (%d river paths)' % len(paths))
