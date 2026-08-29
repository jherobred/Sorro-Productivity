import os
import subprocess

# 1. Concept 1: Minimal Geometric Otter (Classic Claude-sibling)
OTTER_1 = [
    ".#..........#.",  # Ears
    "##############",  # Head top
    "##..######..##",  # Eye slots
    "##..######..##",  # Eye slots
    "##############",  # Snout level
    "####..##..####",  # Paws held in front
    "##############",  # Body
    "##############",  # Lower body
    "..##......##.#",  # Feet + tail nub
    "..##......##..",  # Feet
]

# 2. Concept 2: Whisker-Wing Otter (Has side whisker/paw tabs like Claude squid's side arms)
OTTER_2 = [
    ".#..........#.",  # Ears
    "##############",  # Head
    "##..######..##",  # Eyes
    "##..######..##",  # Eyes
    "######..######",  # Nose slot
    "##############",  # Cheeks
    "####..##..####",  # Center paws
    "##############",  # Body
    "..##......##.#",  # Feet + tail
    "..##......##..",  # Feet
]

# 3. Concept 3: Side-Arm Whisker Otter (With Claude-style horizontal side tabs + otter ears)
OTTER_3 = [
    ".#..........#.",  # Ears
    ".############.",  # Head top
    ".##..####..##.",  # Eyes
    ".##..####..##.",  # Eyes
    "##############",  # Side whisker/arms
    ".############.",  # Belly
    ".####.##.####.",  # Paws
    ".############.",  # Body
    "..##......##..",  # Feet
    "..##......##..",  # Feet
]

# 4. Concept 4: Floating Back-Swimmer Otter (Tucked ears, paws holding clam on belly)
OTTER_4 = [
    "##..........##",  # Rounded top ears
    "##############",  # Head
    "###.######.###",  # Narrow eye slots
    "###.######.###",  # Narrow eye slots
    "##############",  # Face
    "###...##...###",  # Paws holding center
    "##############",  # Belly
    ".############.",  # Tapered body
    "..##......##.#",  # Feet + tail
    "..##......##..",  # Feet
]

# 5. Concept 5: Chibi Round-Eared Otter
OTTER_5 = [
    ".##........##.",  # Cute rounded ears
    "##############",  # Head
    "##..######..##",  # Eyes
    "##..######..##",  # Eyes
    "######..######",  # Snout cutout
    "####..##..####",  # Paws
    "##############",  # Body
    ".############.",  # Lower body
    "..##......##..",  # Feet
]

# 6. Concept 6: Playful Tail-Up Otter
OTTER_6 = [
    ".#..........#.",  # Ears
    "##############",  # Head
    "##..######..##",  # Eyes
    "##..######..##",  # Eyes
    "##############",  # Face
    "###...##...###",  # Paws
    "##############.#", # Body + tail
    "..##########..##", # Lower body + tail tip
    "..##......##....", # Feet
    "..##......##....", # Feet
]

CONCEPTS = [
    ("Concept 1: Minimal Geometric Otter", OTTER_1, "Top ear nubs, vertical eye slots, tucked paws, and subtle tail. Closest direct sibling to the Claude sprite."),
    ("Concept 2: Whisker & Nose Slot Otter", OTTER_2, "Features centered nose cutout, ear nubs, tucked paws, and tail."),
    ("Concept 3: Side-Arm Whisker Otter", OTTER_3, "Has horizontal side whisker/arm tabs (matching Claude's silhouette) with top ears."),
    ("Concept 4: Floating Clam Otter", OTTER_4, "Rounded ears, narrow eye slots, and paws holding a pebble/clam."),
    ("Concept 5: Chibi Round-Eared Otter", OTTER_5, "Wider rounded top ears with snug centered paws."),
    ("Concept 6: Playful Tail-Up Otter", OTTER_6, "Extended side tail, ear nubs, and cheerful standing feet."),
]

def grid_to_svg_path(grid):
    rects = []
    for y, row in enumerate(grid):
        for x, char in enumerate(row):
            if char == '#':
                rects.append(f'<rect x="{x}" y="{y}" width="1" height="1"/>')
    return len(grid[0]), len(grid), "".join(rects)

def generate_comparison_html():
    cards_html = []
    
    # We will show both in Terracotta (#D97757) and Purple (#C084FC / #7C3AED)
    for idx, (title, grid, desc) in enumerate(CONCEPTS, 1):
        w, h, rects = grid_to_svg_path(grid)
        cards_html.append(f"""
        <div class="card">
            <div class="header">
                <span class="num">0{idx}</span>
                <h3>{title}</h3>
            </div>
            <div class="preview-row">
                <!-- Terracotta Version -->
                <div class="preview-box">
                    <svg viewBox="0 0 {w} {h}" class="otter-svg" fill="#D97757" shape-rendering="crispEdges">
                        {rects}
                    </svg>
                    <span class="label">Terracotta</span>
                </div>
                <!-- Lilac Purple Version -->
                <div class="preview-box">
                    <svg viewBox="0 0 {w} {h}" class="otter-svg" fill="#C084FC" shape-rendering="crispEdges">
                        {rects}
                    </svg>
                    <span class="label">Lilac Purple</span>
                </div>
                <!-- Lockup with basedly wordmark -->
                <div class="lockup-box">
                    <svg viewBox="0 0 {w} {h}" class="otter-small" fill="#D97757" shape-rendering="crispEdges">
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
    background: rgba(255,255,255,0.1);
    color: #FBF7EE;
    font-size: 11px;
    font-weight: 800;
    padding: 3px 7px;
    border-radius: 6px;
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
    gap: 14px;
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
  .otter-svg {{
    width: 80px;
    height: 80px;
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
    gap: 12px;
    margin-left: auto;
    padding-left: 16px;
    border-left: 1px solid rgba(255,255,255,0.08);
  }}
  .otter-small {{
    width: 44px;
    height: 44px;
  }}
  .wordmark {{
    font-size: 26px;
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
    <h1>Pixel Otter Mascot Explorations</h1>
    <p>Minimalist pixel-grid companion style inspired by the Claude Code sprite aesthetic</p>
  </div>
  <div class="grid">
    {''.join(cards_html)}
  </div>
</body>
</html>"""
    
    with open("scripts/otter_preview.html", "w", encoding="utf-8") as f:
        f.write(html)
    print("Wrote scripts/otter_preview.html")

def render_preview_png():
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
        f"--screenshot={os.path.join(cwd, 'public', 'otter-concepts.png')}",
        f"file:///{os.path.join(cwd, 'scripts', 'otter_preview.html')}"
    ]

    subprocess.run(cmd, check=False)
    print("Rendered: public/otter-concepts.png")

if __name__ == "__main__":
    generate_comparison_html()
    render_preview_png()
