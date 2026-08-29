import os
import subprocess
import struct
import zlib

COLOR_MAP = {
    'K': '#141216',
    'O': '#3D1C12',
    '4': '#F8B6A0',
    '3': '#E88B6E',
    '2': '#D97757',
    '1': '#AA4C32',
    '0': '#782C18',
    'W': '#FFFFFF',
    'c': '#FDF9F2',
    'b': '#F4EAE0',
    'a': '#DECFC0',
    '9': '#BDA995',
    'p': '#FCA5A5',
    'P': '#F87171',
    'e': '#5C2212',
    'N': '#1C1917',
    'g': '#FEF08A',
    'G': '#FACC15',
    'Y': '#CA8A04',
    '.': 'transparent',
}

RGBA_MAP = {
    'K': (20, 18, 22, 255),
    'O': (61, 28, 18, 255),
    '4': (248, 182, 160, 255),
    '3': (232, 139, 110, 255),
    '2': (217, 119, 87, 255),
    '1': (170, 76, 50, 255),
    '0': (120, 44, 24, 255),
    'W': (255, 255, 255, 255),
    'c': (253, 249, 242, 255),
    'b': (244, 234, 224, 255),
    'a': (222, 207, 192, 255),
    '9': (189, 169, 149, 255),
    'p': (252, 165, 165, 255),
    'P': (248, 113, 113, 255),
    'e': (92, 34, 18, 255),
    'N': (28, 25, 23, 255),
    'g': (254, 240, 138, 255),
    'G': (250, 204, 21, 255),
    'Y': (202, 138, 4, 255),
    '.': (0, 0, 0, 0),
}

SPRITE_HERO = [
    "................................",
    "......KKKK............KKKK......",
    ".....KOOOOK..........KOOOOK.....",
    "....KO3333OKKKKKKKKKKO3333OK....",
    "...KO334433OOOOOOOOOO334433OK...",
    "..KO33444333333333333344433OK..",
    "..KO34444444444444444444443OK..",
    ".KO3443333333333333333333443OK.",
    ".KO34333333333333333333333343OK.",
    ".KO3333WW333333333333WW333333OK.",
    ".KO333WWeK3333333333WWeK33333OK.",
    ".KO333eeNK3333333333eeNK33333OK.",
    ".KOp33NNNK33bbbbbb33NNNK333p3OK.",
    ".KOp333KK33bccNccb333KK3333p3OK.",
    ".KO33333333baaaab333333333333OK.",
    "..KO333333339999333333333333OK..",
    "..KOO3333333333333333333333OOK..",
    "...KKOO333bbbbbbbb3333333OOKK...",
    "....KKO33bbccccccbb33333OOK.....",
    "....KO333bccccccccb333333OK.....",
    "...KO3333bccccccccb3333333OK....",
    "..KO33OO3bccccccccb3OO33333OK...",
    "..KO33OO3baaaaaaaab3OO33333OK...",
    "..KO33333baaaaaaaab33333333OK.KK",
    "...KO3333baaaaaaaab3333333OK.K3K",
    "...KOO3333bbbbbbbb3333333OOK.K3K",
    "....KO111111111111111111OOK.K43K",
    ".....KO0000000000000000OOK.K33OK",
    "......KKKKKOOOOOKKKKKOOKKK.KOOK.",
    "........KO3333OK...KO3333OK.KK..",
    "........KO1111OK...KO1111OK.....",
    ".........KKKKKK.....KKKKKK......",
]

SPRITE_SCHOLAR = [
    "................................",
    "......KKKK............KKKK......",
    ".....KOOOOK..........KOOOOK.....",
    "....KO3333OKKKKKKKKKKO3333OK....",
    "...KO334433OOOOOOOOOO334433OK...",
    "..KO33444333333333333344433OK..",
    "..KO34444444444444444444443OK..",
    ".KO3443333333333333333333443OK.",
    ".KO3433KKKKKK3333KKKKKK333343OK.",
    ".KO333KWWWWWeK33KWWWWWeK33333OK.",
    ".KO333KWWeeNeKKKKWWeeNeK33333OK.",
    ".KO333KeeNNNeK33KeeNNNeK33333OK.",
    ".KOp333KKKKKK3333KKKKKK33333p3OK.",
    ".KOp333333bccNccb3333333333p3OK.",
    ".KO33333333baaaab333333333333OK.",
    "..KO333333339999333333333333OK..",
    "..KOO3333333333333333333333OOK..",
    "...KKOO333bbbbbbbb3333333OOKK...",
    "....KKO33bWWWWWWWWb33333OOK.....",
    "....KO333bWcaaaacWb333333OK.....",
    "...KO3333bWc9999cWb3333333OK....",
    "..KO33OO3bWWWWWWWWb3OO33333OK...",
    "..KO33OO3baaaaaaaab3OO33333OK...",
    "..KO33333baaaaaaaab33333333OK.KK",
    "...KO3333baaaaaaaab3333333OK.K3K",
    "...KOO3333bbbbbbbb3333333OOK.K3K",
    "....KO111111111111111111OOK.K43K",
    ".....KO0000000000000000OOK.K33OK",
    "......KKKKKOOOOOKKKKKOOKKK.KOOK.",
    "........KO3333OK...KO3333OK.KK..",
    "........KO1111OK...KO1111OK.....",
    ".........KKKKKK.....KKKKKK......",
]

def make_raw_png(grid, scale=16):
    h = len(grid)
    w = max(len(r) for r in grid)
    out_w = w * scale
    out_h = h * scale
    
    raw_data = bytearray()
    for y in range(out_h):
        raw_data.append(0) # Filter byte: None
        src_y = y // scale
        row_str = grid[src_y]
        for x in range(out_w):
            src_x = x // scale
            ch = row_str[src_x] if src_x < len(row_str) else '.'
            r, g, b, a = RGBA_MAP.get(ch, (0, 0, 0, 0))
            raw_data.extend([r, g, b, a])
            
    def chunk(tag, data):
        c = struct.pack('>I', len(data)) + tag + data
        crc = zlib.crc32(tag + data) & 0xffffffff
        return c + struct.pack('>I', crc)
        
    png = bytearray(b'\x89PNG\r\n\x1a\n')
    ihdr = struct.pack('>IIBBBBB', out_w, out_h, 8, 6, 0, 0, 0)
    png.extend(chunk(b'IHDR', ihdr))
    png.extend(chunk(b'IDAT', zlib.compress(bytes(raw_data), level=9)))
    png.extend(chunk(b'IEND', b''))
    return bytes(png)

def grid_to_svg(grid):
    h = len(grid)
    w = max(len(row) for row in grid)
    rects = []
    for y, row in enumerate(grid):
        for x, char in enumerate(row):
            color = COLOR_MAP.get(char, 'transparent')
            if color != 'transparent':
                rects.append(f'<rect x="{x}" y="{y}" width="1" height="1" fill="{color}"/>')
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" shape-rendering="crispEdges">{"".join(rects)}</svg>'

def export_all():
    # 1. Standalone PNGs (512x512 crisp transparent)
    png_hero = make_raw_png(SPRITE_HERO, scale=16)
    with open("public/basedly-otter-hero.png", "wb") as f:
        f.write(png_hero)
    print("Exported: public/basedly-otter-hero.png (512x512)")

    png_scholar = make_raw_png(SPRITE_SCHOLAR, scale=16)
    with open("public/basedly-otter-scholar.png", "wb") as f:
        f.write(png_scholar)
    print("Exported: public/basedly-otter-scholar.png (512x512)")

    # 2. SVGs
    svg_hero = grid_to_svg(SPRITE_HERO)
    with open("public/basedly-otter-hero.svg", "w", encoding="utf-8") as f:
        f.write(svg_hero)
    print("Exported: public/basedly-otter-hero.svg")

    svg_scholar = grid_to_svg(SPRITE_SCHOLAR)
    with open("public/basedly-otter-scholar.svg", "w", encoding="utf-8") as f:
        f.write(svg_scholar)
    print("Exported: public/basedly-otter-scholar.svg")

    # 3. HTML for Full Lockups & App Icons
    html = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  body {{
    background: transparent;
    font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif;
  }}
  .lockup-hero {{
    width: 600px;
    height: 160px;
    display: flex;
    align-items: center;
    gap: 24px;
    padding: 20px;
    background: #0A0912;
  }}
  .lockup-scholar {{
    width: 600px;
    height: 160px;
    display: flex;
    align-items: center;
    gap: 24px;
    padding: 20px;
    background: #0A0912;
  }}
  .mascot-icon {{
    width: 100px;
    height: 100px;
  }}
  .wordmark {{
    font-size: 64px;
    font-weight: 800;
    letter-spacing: -0.04em;
    color: #FBF7EE;
  }}
</style>
</head>
<body>
  <div id="hero-lockup" class="lockup-hero">
    <div class="mascot-icon">{svg_hero}</div>
    <span class="wordmark">basedly</span>
  </div>
  <div id="scholar-lockup" class="lockup-scholar">
    <div class="mascot-icon">{svg_scholar}</div>
    <span class="wordmark">basedly</span>
  </div>
</body>
</html>"""
    with open("scripts/lockup_export.html", "w", encoding="utf-8") as f:
        f.write(html)

    # 4. Render Screenshot Lockups with Headless Edge
    edge_paths = [
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    ]
    edge = next((p for p in edge_paths if os.path.exists(p)), None)
    if edge:
        cwd = os.path.abspath(os.getcwd())
        # Hero Lockup HTML
        html_hero = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
* {{ margin: 0; padding: 0; box-sizing: border-box; }}
body {{ background: #0A0912; font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; gap: 20px; }}
.icon {{ width: 84px; height: 84px; }}
.wordmark {{ font-size: 56px; font-weight: 800; letter-spacing: -0.04em; color: #FBF7EE; }}
</style></head><body>
<div class="icon">{svg_hero}</div>
<span class="wordmark">basedly</span>
</body></html>"""
        with open("scripts/hero_lockup.html", "w", encoding="utf-8") as f:
            f.write(html_hero)

        # Scholar Lockup HTML
        html_scholar = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
* {{ margin: 0; padding: 0; box-sizing: border-box; }}
body {{ background: #0A0912; font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; gap: 20px; }}
.icon {{ width: 84px; height: 84px; }}
.wordmark {{ font-size: 56px; font-weight: 800; letter-spacing: -0.04em; color: #FBF7EE; }}
</style></head><body>
<div class="icon">{svg_scholar}</div>
<span class="wordmark">basedly</span>
</body></html>"""
        with open("scripts/scholar_lockup.html", "w", encoding="utf-8") as f:
            f.write(html_scholar)

        subprocess.run([
            edge, "--headless", "--disable-gpu", "--hide-scrollbars", "--window-size=500,160",
            f"--screenshot={os.path.join(cwd, 'public', 'basedly-logo-hero.png')}",
            f"file:///{os.path.join(cwd, 'scripts', 'hero_lockup.html')}"
        ], check=False)
        print("Exported: public/basedly-logo-hero.png")

        subprocess.run([
            edge, "--headless", "--disable-gpu", "--hide-scrollbars", "--window-size=500,160",
            f"--screenshot={os.path.join(cwd, 'public', 'basedly-logo-scholar.png')}",
            f"file:///{os.path.join(cwd, 'scripts', 'scholar_lockup.html')}"
        ], check=False)
        print("Exported: public/basedly-logo-scholar.png")

if __name__ == "__main__":
    export_all()

