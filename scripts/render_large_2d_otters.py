import os
import subprocess

# Palette
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

# 1. Option 1: Iconic Flat Terracotta Glyph (Minimalist Claude-lineage)
GLYPH_1 = """
<svg viewBox="0 0 48 48" fill="#D97757" width="100%" height="100%">
  <!-- Ears -->
  <circle cx="14" cy="11" r="4"/>
  <circle cx="34" cy="11" r="4"/>
  <!-- Head & Body Shell -->
  <rect x="10" y="10" width="28" height="28" rx="8"/>
  <!-- Side Paw Tabs -->
  <rect x="6" y="20" width="5" height="7" rx="2.5"/>
  <rect x="37" y="20" width="5" height="7" rx="2.5"/>
  <!-- Feet -->
  <rect x="15" y="36" width="5" height="6" rx="2.5"/>
  <rect x="28" y="36" width="5" height="6" rx="2.5"/>
  <!-- Tail -->
  <path d="M 36 32 C 42 32, 44 36, 42 40 C 40 42, 37 38, 36 35 Z"/>
  <!-- Negative Space Eyes -->
  <rect x="17" y="16" width="3.5" height="6" rx="1.75" fill="#0D0B16"/>
  <rect x="27.5" y="16" width="3.5" height="6" rx="1.75" fill="#0D0B16"/>
  <!-- Negative Space Snout -->
  <rect x="22" y="22" width="4" height="2.5" rx="1.25" fill="#0D0B16"/>
  <!-- Negative Space Clasped Paws -->
  <rect x="20.5" y="27" width="7" height="3" rx="1.5" fill="#0D0B16"/>
</svg>
"""

# 2. Option 2: 2D Pixel Chibi Otter Sprite
SPRITE_CHIBI = [
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

# 3. Option 3: 2D Floating Back-Swimmer Sprite
SPRITE_FLOATING = [
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

# 4. Option 4: 2D Peeking Desktop Otter Sprite
SPRITE_PEEKING = [
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

def grid_to_svg(grid):
    h = len(grid)
    w = max(len(row) for row in grid)
    rects = []
    for y, row in enumerate(grid):
        for x, char in enumerate(row):
            color = PAL.get(char, 'transparent')
            if color != 'transparent':
                rects.append(f'<rect x="{x}" y="{y}" width="1" height="1" fill="{color}"/>')
    return f'<svg viewBox="0 0 {w} {h}" width="100%" height="100%" shape-rendering="crispEdges">{"".join(rects)}</svg>'

def build_html():
    choices = [
        (
            "Option 1: Minimalist Terracotta Glyph",
            GLYPH_1,
            "Pure flat vector silhouette with iconic ear nubs, negative-space slot eyes, and clasped paws. Direct spiritual sibling to the Claude mascot."
        ),
        (
            "Option 2: 2D Pixel Chibi Otter Sprite",
            grid_to_svg(SPRITE_CHIBI),
            "High-detail 2D sprite with warm terracotta fur, cream muzzle & tummy, sparkling catchlight eyes, and tail."
        ),
        (
            "Option 3: 2D Floating Back-Swimmer",
            grid_to_svg(SPRITE_FLOATING),
            "Classic relaxed otter swimming on its back with paws folded across chest and little flipper feet."
        ),
        (
            "Option 4: 2D Peeking Desktop Companion",
            grid_to_svg(SPRITE_PEEKING),
            "Curious 2D companion with prominent ears, resting its cute paws over a baseline/toolbar."
        ),
    ]

    cards_html = []
    for idx, (title, svg_content, desc) in enumerate(choices, 1):
        cards_html.append(f"""
        <div class="card">
            <div class="header">
                <span class="num">0{idx}</span>
                <h3>{title}</h3>
            </div>
            <div class="canvas-container">
                <div class="mascot-display">
                    {svg_content}
                </div>
            </div>
            <div class="footer-row">
                <p class="desc">{desc}</p>
                <div class="lockup">
                    <div class="mini-mascot">{svg_content}</div>
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
    margin-bottom: 36px;
  }}
  .title-area h1 {{
    font-size: 30px;
    font-weight: 800;
    letter-spacing: -0.03em;
    margin-bottom: 8px;
    color: #FBF7EE;
  }}
  .title-area p {{
    font-size: 14.5px;
    color: #94A3B8;
  }}
  .grid {{
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 28px;
    width: 100%;
    max-width: 1150px;
  }}
  .card {{
    background: #14121E;
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 20px;
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }}
  .header {{
    display: flex;
    align-items: center;
    gap: 10px;
  }}
  .num {{
    background: rgba(217, 119, 87, 0.2);
    color: #D97757;
    font-size: 12px;
    font-weight: 800;
    padding: 3px 8px;
    border-radius: 6px;
    border: 1px solid rgba(217, 119, 87, 0.4);
  }}
  .header h3 {{
    font-size: 17px;
    font-weight: 700;
    color: #FBF7EE;
    letter-spacing: -0.02em;
  }}
  .canvas-container {{
    background: radial-gradient(circle at 50% 40%, #191624 0%, #0D0B14 100%);
    border: 1px solid rgba(255,255,255,0.05);
    border-radius: 16px;
    height: 220px;
    display: flex;
    align-items: center;
    justify-content: center;
  }}
  .mascot-display {{
    width: 140px;
    height: 140px;
    display: flex;
    align-items: center;
    justify-content: center;
  }}
  .footer-row {{
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }}
  .desc {{
    font-size: 12.5px;
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
    padding: 6px 12px;
    border-radius: 10px;
    flex-shrink: 0;
  }}
  .mini-mascot {{
    width: 28px;
    height: 28px;
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
    <h1>2D Pixel & Vector Otter Mascot Directions</h1>
    <p>Large, high-clarity 2D Otter companion choices in Anthropic terracotta (#D97757)</p>
  </div>
  <div class="grid">
    {''.join(cards_html)}
  </div>
</body>
</html>"""
    with open("scripts/large_2d_otters.html", "w", encoding="utf-8") as f:
        f.write(html)
    print("Wrote scripts/large_2d_otters.html")

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
        "--window-size=1200,900",
        f"--screenshot={os.path.join(cwd, 'public', 'final-2d-otter-choices.png')}",
        f"file:///{os.path.join(cwd, 'scripts', 'large_2d_otters.html')}"
    ]
    subprocess.run(cmd, check=False)
    print("Rendered: public/final-2d-otter-choices.png")

if __name__ == "__main__":
    build_html()
    render_png()
