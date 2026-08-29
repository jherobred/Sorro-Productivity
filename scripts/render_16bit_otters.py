import os
import subprocess

# Authentic 16-bit / 32-bit GBA Palette
COLOR_MAP = {
    # Outlines
    'K': '#141216',  # Deepest dark outline
    'O': '#3D1C12',  # Soft outline / contour shadow
    
    # Terracotta Fur Ramp (5 steps)
    '4': '#F8B6A0',  # Specular highlight
    '3': '#E88B6E',  # Light fur
    '2': '#D97757',  # Base terracotta
    '1': '#AA4C32',  # Fur shadow
    '0': '#782C18',  # Deep fur shadow
    
    # Cream Muzzle & Tummy Ramp (4 steps)
    'W': '#FFFFFF',  # Eye catchlight & bright white
    'c': '#FDF9F2',  # Pure cream highlight
    'b': '#F4EAE0',  # Cream base
    'a': '#DECFC0',  # Cream shadow
    '9': '#BDA995',  # Muzzle crease
    
    # Pink Blush & Inner Ear
    'p': '#FCA5A5',  # Soft pink blush
    'P': '#F87171',  # Ear pink
    
    # Eyes & Nose
    'e': '#5C2212',  # Warm eye iris
    'N': '#1C1917',  # Nose black
    
    # Gold Star / Gem
    'g': '#FEF08A',  # Star highlight
    'G': '#FACC15',  # Star gold
    'Y': '#CA8A04',  # Star shadow
    
    # Transparent
    '.': 'transparent',
}

# 32 wide x 32 tall high-detail GBA Sprite 1: Standing Chibi Otter Companion
SPRITE_STANDING = [
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

# 32x32 GBA Sprite 2: Floating Otter Holding a Glowing Gold Star
SPRITE_STAR = [
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
    "..KOO333333...gg...3333333OOK...",
    "...KKOO3333..gGGg..333333OOKK...",
    "....KKO33OO.gGGGGg.OO333OOK.....",
    "....KO333OOgGGGGGGgOO3333OK.....",
    "...KO3333..gGGGGGGg..33333OK....",
    "..KO333333..gYYYYg..3333333OK...",
    "..KO3333333..gYYg..33333333OK...",
    "..KO3333bbbaaaaaabbb3333333OK.KK",
    "...KO333bbbaaaaaabbb333333OK.K3K",
    "...KOO3333bbbbbbbb3333333OOK.K3K",
    "....KO111111111111111111OOK.K43K",
    ".....KO0000000000000000OOK.K33OK",
    "......KKKKKOOOOOKKKKKOOKKK.KOOK.",
    "........KO3333OK...KO3333OK.KK..",
    "........KO1111OK...KO1111OK.....",
    ".........KKKKKK.....KKKKKK......",
]

# 32x32 GBA Sprite 3: Scholar Otter (Round Glasses + Mini Notebook)
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

# 32x32 GBA Sprite 4: Cheerful Waving Otter (Playful Wink & Upraised Paw)
SPRITE_WAVING = [
    "............................KKKK",
    "......KKKK............KKKK.KO33K",
    ".....KOOOOK..........KOOOOKKO33K",
    "....KO3333OKKKKKKKKKKO3333OKO34K",
    "...KO334433OOOOOOOOOO334433OK33K",
    "..KO33444333333333333344433OK33K",
    "..KO34444444444444444444443OKO3K",
    ".KO3443333333333333333333443OKKK",
    ".KO34333333333333333333333343OK.",
    ".KO3333WW33333333333333333333OK.",
    ".KO333WWeK3333333333KKKK33333OK.",
    ".KO333eeNK333333333333KK33333OK.",
    ".KOp33NNNK33bbbbbb333333333p3OK.",
    ".KOp333KK33bccNccb333333333p3OK.",
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

MODELS = [
    (
        "Concept 1: The GBA Hero Otter (Standing Chibi)",
        SPRITE_STANDING,
        "Authentic 32-bit GBA pixel companion. Multi-tone terracotta fur, cream muzzle & belly, anime catchlight eyes, cute rounded ears, and curved tail."
    ),
    (
        "Concept 2: Star-Keeper Otter (Holding Gold Star)",
        SPRITE_STAR,
        "Standing 16-bit otter proudly holding a glittering multi-tone golden star in its front paws."
    ),
    (
        "Concept 3: Scholar Otter (Spectacles & Notebook)",
        SPRITE_SCHOLAR,
        "Intelligent companion wearing round pixel spectacles and holding a mini study notebook."
    ),
    (
        "Concept 4: Cheerful Waving Otter",
        SPRITE_WAVING,
        "Playful companion with an upraised waving paw, charming winking eye, and perked ears."
    ),
]

def render_sprite_to_svg(sprite):
    h = len(sprite)
    w = max(len(row) for row in sprite)
    rects = []
    for y, row in enumerate(sprite):
        for x, char in enumerate(row):
            color = COLOR_MAP.get(char, 'transparent')
            if color != 'transparent':
                rects.append(f'<rect x="{x}" y="{y}" width="1" height="1" fill="{color}"/>')
    return f'<svg viewBox="0 0 {w} {h}" width="100%" height="100%" shape-rendering="crispEdges">{"".join(rects)}</svg>'

def build_html():
    cards = []
    for idx, (title, sprite, desc) in enumerate(MODELS, 1):
        svg_code = render_sprite_to_svg(sprite)
        cards.append(f"""
        <div class="card">
            <div class="header">
                <span class="num">0{idx}</span>
                <h3>{title}</h3>
            </div>
            <div class="canvas-container">
                <div class="sprite-hero">
                    {svg_code}
                </div>
            </div>
            <div class="footer-row">
                <p class="desc">{desc}</p>
                <div class="lockup">
                    <div class="mini-sprite">{svg_code}</div>
                    <span class="wordmark">basedly</span>
                </div>
            </div>
        </div>
        """)

    html = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  body {{
    background: #0A0912;
    color: #FFFFFF;
    font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif;
    padding: 40px;
    display: flex;
    flex-direction: column;
    align-items: center;
  }}
  .title-area {{
    text-align: center;
    margin-bottom: 40px;
  }}
  .title-area h1 {{
    font-size: 32px;
    font-weight: 800;
    letter-spacing: -0.03em;
    margin-bottom: 8px;
    color: #FBF7EE;
  }}
  .title-area p {{
    font-size: 15px;
    color: #94A3B8;
  }}
  .grid {{
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 32px;
    width: 100%;
    max-width: 1200px;
  }}
  .card {{
    background: #14121E;
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 20px;
    padding: 26px;
    display: flex;
    flex-direction: column;
    gap: 20px;
    box-shadow: 0 12px 32px rgba(0,0,0,0.4);
  }}
  .header {{
    display: flex;
    align-items: center;
    gap: 12px;
  }}
  .num {{
    background: rgba(217, 119, 87, 0.2);
    color: #F8B6A0;
    font-size: 12px;
    font-weight: 800;
    padding: 4px 9px;
    border-radius: 8px;
    border: 1px solid rgba(217, 119, 87, 0.4);
  }}
  .header h3 {{
    font-size: 18px;
    font-weight: 700;
    color: #FBF7EE;
    letter-spacing: -0.02em;
  }}
  .canvas-container {{
    background: radial-gradient(circle at 50% 40%, #1A1726 0%, #0D0B14 100%);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 16px;
    height: 280px;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    overflow: hidden;
  }}
  .sprite-hero {{
    width: 200px;
    height: 200px;
    display: flex;
    align-items: center;
    justify-content: center;
    filter: drop-shadow(0 14px 24px rgba(0,0,0,0.5));
  }}
  .footer-row {{
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }}
  .desc {{
    font-size: 13px;
    color: #94A3B8;
    line-height: 1.45;
    flex: 1;
  }}
  .lockup {{
    display: flex;
    align-items: center;
    gap: 10px;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.08);
    padding: 7px 14px;
    border-radius: 12px;
    flex-shrink: 0;
  }}
  .mini-sprite {{
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
  }}
  .wordmark {{
    font-size: 20px;
    font-weight: 800;
    letter-spacing: -0.04em;
    color: #FBF7EE;
  }}
</style>
</head>
<body>
  <div class="title-area">
    <h1>16-Bit / 32-Bit GBA Pixel Otter Mascots</h1>
    <p>High-detail retro pixel sprite companions with rich shading, expressive eyes, and soft contours</p>
  </div>
  <div class="grid">
    {''.join(cards)}
  </div>
</body>
</html>"""
    with open("scripts/16bit_otters.html", "w", encoding="utf-8") as f:
        f.write(html)
    print("Wrote scripts/16bit_otters.html")

def render_png():
    edge_paths = [
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    ]
    edge = next((p for p in edge_paths if os.path.exists(p)), None)
    if not edge:
        return
    cwd = os.path.abspath(os.getcwd())
    cmd = [
        edge,
        "--headless",
        "--disable-gpu",
        "--hide-scrollbars",
        "--window-size=1280,1050",
        f"--screenshot={os.path.join(cwd, 'public', '16bit-otter-showcase.png')}",
        f"file:///{os.path.join(cwd, 'scripts', '16bit_otters.html')}"
    ]
    subprocess.run(cmd, check=False)
    print("Rendered: public/16bit-otter-showcase.png")

if __name__ == "__main__":
    build_html()
    render_png()
