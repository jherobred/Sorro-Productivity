import os
import subprocess

# Palette mapping:
# B = Dark outline (#1C1917)
# T = Terracotta base (#D97757)
# H = Light terracotta highlight (#E89274)
# S = Warm chocolate shadow (#A25438)
# C = Cream ivory snout/tummy (#FDF8EE)
# W = White shine (#FFFFFF)
# N = Nose black (#1C1917)
# P = Pink blush (#F472B6)
# . = Transparent

PAL = {
    'B': '#1C1917',
    'T': '#D97757',
    'H': '#E89274',
    'S': '#A25438',
    'C': '#FDF8EE',
    'W': '#FFFFFF',
    'N': '#1C1917',
    'P': '#FB7185',
    '.': 'transparent',
}

# 1. Standing Chibi Otter (Big sparkling eyes, cream muzzle, paws clasped, cute tail)
OTTER_STANDING = [
    "....BB........BB....",
    "...BTTB......BTTB...",
    "...BTTBBBBBBBBTTB...",
    "..BTTHHTTTTTTHHTB...",
    ".BTHHHHHHHHHHHHTB...",
    ".BTTTTTTTTTTTTTTB...",
    ".BTBWBTTTTTTBWBTTB..",
    ".BTBBBTTTTTTBBBTB...",
    ".BTTTTTCCCTTCCCCB...",
    ".BTTTTCCNCCBCCCCB...",
    "..BTTTCCCCBCCCTB....",
    "..BTTTTTTTBBTTB.....",
    "..BTTBBTTTTBBTB.....",
    "..BTHHCCCTTTHTB.....",
    ".BTTHCCCCCTTTTTB....",
    ".BTTCCCCCCCCCTTTB...",
    ".BTTCCBCCBCCCTTTB.B.",
    ".BTTSCCCCCCCCSTTBBB.",
    "..BTTTSSSSSSTTTB.TB.",
    "...BBBTTTTTTBBB..TB.",
    "....BTTB..BTTB...TB.",
    "....BBBB..BBBB...BB.",
]

# 2. Floating On Back Otter (Classic otter posture holding hands on chest, swimming)
OTTER_FLOATING = [
    "....................",
    "....BBBB....BBBB....",
    "...BTTTTBBBBTTTTB...",
    "..BTHHHHHHHHHHTTB...",
    ".BTHHTTTTTTTTTTHB...",
    ".BTTBWBTTTTBWBTTB...",
    ".BTTBBBTTTTBBBTTB...",
    ".BTTTTTCCNCCCTTTB...",
    ".BTTTTTCCCCCCTTTB...",
    "..BTBBTTBBTTBBTB....",
    "..BTHHCCCCCCCHTB....",
    ".BTTHHCCCCCCCHTTB...",
    ".BTTTCCCCCCCCCTTB...",
    ".BTTTCCCCCCCCCTTB...",
    ".BTTTCCCCBCCCCTTB...",
    ".BTTTTTBBBBTTTTTB...",
    "..BTTTTTTTTTTTTB....",
    "...BBBBTTTTBBBB..BB.",
    "......BTTB..BTTBBTTB",
    "......BBBB..BBBBBB..",
]

# 3. Holding a Magic Stone / Note Otter (Sitting, paws wrapped around a shiny pebble)
OTTER_HOLDING = [
    "...BB..........BB...",
    "..BTTB........BTTB..",
    "..BTTBBBBBBBBBBTTB..",
    ".BTTHHTTTTTTTTHHTB..",
    ".BTHHHHHHHHHHHHHTB..",
    ".BTTTTTTTTTTTTTTTB..",
    ".BTBWBTTTTTTTBWBTTB.",
    ".BTBBBTTTTTTTBBBTTB.",
    ".BPTTTTCCNCCCTTTPTB.",
    ".BTTTTTCCCCCTTTTTB..",
    "..BTTTTTBBTTTTTTB...",
    "..BTTTHHWWHTTHTB....",
    ".BTTTHHWWWWHTTHTB...",
    ".BTTHHHWWWWHTTTTB...",
    ".BTTTTHHWWHTTTTTB...",
    ".BTTTTTTBBTTTTTTB...",
    ".BTTTCCCCCCCCCTTB...",
    ".BSTTCCCCCCCCCTTB...",
    "..BSTTTTTTTTTTTSB...",
    "...BBBBTTTTTBBBB....",
    ".....BTTB.BTTB......",
    ".....BBBB.BBBB......",
]

# 4. Waving / Cheerful Wink Otter
OTTER_WAVING = [
    "....BB........BB....",
    "...BTTB......BTTB...",
    "...BTTBBBBBBBBTTB...",
    "..BTTHHTTTTTTHHTB...",
    ".BTHHHHHHHHHHHHTB...",
    ".BTTTTTTTTTTTTTTB...",
    ".BTBWBTTTTTTTTTTB.BB",
    ".BTBBBTTTTTTBBBTBBTB",
    ".BPTTTTCCNCCBTTTBBTB",
    ".BTTTTTCCCCCTTTTTBTB",
    "..BTTTTTBBTTTTTTBB..",
    "..BTTTHCCCCHTTTB....",
    ".BTTHCCCCCCCHTTB....",
    ".BTTCCCCCCCCCCTTB...",
    ".BTTCCCCCCCCCTTTB...",
    ".BTTTCCCCCCCCSTTB...",
    "..BTTTSSSSSSTTTB.BB.",
    "...BBBTTTTTTBBB..BTB",
    "....BTTB..BTTB...BTB",
    "....BBBB..BBBB...BB.",
]

# 5. Peeking Desktop Otter (Resting cute paws on bottom border)
OTTER_PEEKING = [
    "....BB........BB....",
    "...BTTB......BTTB...",
    "...BTTBBBBBBBBTTB...",
    "..BTTHHTTTTTTHHTB...",
    ".BTHHHHHHHHHHHHTB...",
    ".BTTTTTTTTTTTTTTB...",
    ".BTBWBTTTTTTBWBTTB..",
    ".BTBBBTTTTTTBBBTB...",
    ".BPTTTTCCNCCCTTPTB..",
    ".BTTTTTCCCCCTTTTTB..",
    ".BTTTTTTTTTTTTTTTB..",
    ".BBBBTTTTTTTTBBBB...",
    "BCCCCBTTTTTTBCCCCB..",
    "BCCCCBBBBBBBBCCCCB..",
    ".BBBB........BBBB...",
]

# 6. Sleepy / Cozy Curled Otter
OTTER_COZY = [
    "....................",
    "....BB........BB....",
    "...BTTB......BTTB...",
    "..BTTHBBBBBBBBHTB...",
    ".BTHHHHHHHHHHHHTB...",
    ".BTTTTTTTTTTTTTTB...",
    ".BTTTBBTTTTBBTTTB...",
    ".BTTTTTCCNCCCTTTB...",
    ".BPTTTTCCCCCTTPTB...",
    "..BTTTTTTTTTTTTB....",
    ".BTTTTCCCCCCCCCTTB..",
    "BTTTTTCCCCCCCCCTTTB.",
    "BTTBTTCCCCCCCCCTTBTB",
    ".BB.BTTTTTTTTTTB.BB.",
    "....BBBBBBBBBBBB....",
]

MODELS = [
    ("Concept 1: Standing Chibi Otter", OTTER_STANDING, "Classic mascot stance with sparkling eyes, cream muzzle, tucked paws, and curved tail."),
    ("Concept 2: Floating Back-Swimmer", OTTER_FLOATING, "Signature otter swimming pose with paws resting on belly and rear flipper paws."),
    ("Concept 3: Magic Stone / Note Keeper", OTTER_HOLDING, "Sitting upright and holding a shiny glowing note/stone with cute blush cheeks."),
    ("Concept 4: Friendly Waving Otter", OTTER_WAVING, "One paw waving cheerful greeting, playful wink and perked ears."),
    ("Concept 5: Peeking Desktop Otter", OTTER_PEEKING, "Curious companion resting its little paws over a bottom baseline."),
    ("Concept 6: Cozy Curled Otter", OTTER_COZY, "Restful, gentle sleeping companion curled up comfortably."),
]

def render_grid_to_svg(grid):
    h = len(grid)
    w = max(len(row) for row in grid)
    rects = []
    for y, row in enumerate(grid):
        for x, char in enumerate(row):
            color = PAL.get(char, 'transparent')
            if color != 'transparent':
                rects.append(f'<rect x="{x}" y="{y}" width="1" height="1" fill="{color}"/>')
    return w, h, "".join(rects)

def build_html():
    cards = []
    for idx, (title, grid, desc) in enumerate(MODELS, 1):
        w, h, rects = render_grid_to_svg(grid)
        cards.append(f"""
        <div class="card">
            <div class="header">
                <span class="num">0{idx}</span>
                <h3>{title}</h3>
            </div>
            <div class="preview-row">
                <!-- Large Icon Preview -->
                <div class="preview-box">
                    <svg viewBox="0 0 {w} {h}" class="otter-large" shape-rendering="crispEdges">
                        {rects}
                    </svg>
                    <span class="label">Mascot</span>
                </div>
                <!-- App Icon Squircle Preview -->
                <div class="app-icon-box">
                    <svg viewBox="0 0 {w} {h}" class="otter-app" shape-rendering="crispEdges">
                        {rects}
                    </svg>
                </div>
                <!-- Lockup with basedly wordmark -->
                <div class="lockup-box">
                    <svg viewBox="0 0 {w} {h}" class="otter-small" shape-rendering="crispEdges">
                        {rects}
                    </svg>
                    <span class="wordmark">basedly</span>
                </div>
            </div>
            <p class="desc">{desc}</p>
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
    margin-bottom: 36px;
  }}
  .title-area h1 {{
    font-size: 28px;
    font-weight: 800;
    letter-spacing: -0.03em;
    margin-bottom: 8px;
    color: #FBF7EE;
  }}
  .title-area p {{
    font-size: 14px;
    color: #94A3B8;
  }}
  .grid {{
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
    width: 100%;
    max-width: 1100px;
  }}
  .card {{
    background: #14121E;
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 16px;
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }}
  .header {{
    display: flex;
    align-items: center;
    gap: 10px;
  }}
  .num {{
    background: rgba(217, 119, 87, 0.2);
    color: #D97757;
    font-size: 11px;
    font-weight: 800;
    padding: 3px 7px;
    border-radius: 6px;
    border: 1px solid rgba(217, 119, 87, 0.4);
  }}
  .header h3 {{
    font-size: 16px;
    font-weight: 700;
    color: #FBF7EE;
    letter-spacing: -0.02em;
  }}
  .preview-row {{
    display: flex;
    align-items: center;
    gap: 16px;
    background: #0D0B16;
    padding: 18px;
    border-radius: 12px;
    border: 1px solid rgba(255,255,255,0.04);
  }}
  .preview-box {{
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }}
  .otter-large {{
    width: 80px;
    height: 80px;
  }}
  .app-icon-box {{
    width: 60px;
    height: 60px;
    border-radius: 16px;
    background: #1C1917;
    border: 1px solid rgba(255,255,255,0.1);
    display: flex;
    align-items: center;
    justify-content: center;
  }}
  .otter-app {{
    width: 44px;
    height: 44px;
  }}
  .label {{
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #64748B;
    font-weight: 600;
  }}
  .lockup-box {{
    display: flex;
    align-items: center;
    gap: 10px;
    margin-left: auto;
    padding-left: 16px;
    border-left: 1px solid rgba(255,255,255,0.08);
  }}
  .otter-small {{
    width: 36px;
    height: 36px;
  }}
  .wordmark {{
    font-size: 24px;
    font-weight: 800;
    letter-spacing: -0.04em;
    color: #FBF7EE;
  }}
  .desc {{
    font-size: 12.5px;
    color: #94A3B8;
    line-height: 1.45;
  }}
</style>
</head>
<body>
  <div class="title-area">
    <h1>Pixel Otter Mascot Showcase</h1>
    <p>High-charm pixel otter companion identities with warm Anthropic terracotta & ivory styling</p>
  </div>
  <div class="grid">
    {''.join(cards)}
  </div>
</body>
</html>"""
    with open("scripts/rich_otters.html", "w", encoding="utf-8") as f:
        f.write(html)
    print("Wrote scripts/rich_otters.html")

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
        "--window-size=1200,1200",
        f"--screenshot={os.path.join(cwd, 'public', 'otter-showcase.png')}",
        f"file:///{os.path.join(cwd, 'scripts', 'rich_otters.html')}"
    ]
    subprocess.run(cmd, check=False)
    print("Rendered: public/otter-showcase.png")

if __name__ == "__main__":
    build_html()
    render_png()
