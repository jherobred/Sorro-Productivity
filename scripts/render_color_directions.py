import os
import subprocess

DIRECTIONS = [
    {
        "num": "01",
        "title": "Cyber-Mint Emerald",
        "bg": "#05110E",
        "card_bg": "#0B1D19",
        "accent": "#10B981",
        "svg": """
        <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="14" y="10" width="8" height="44" rx="4" fill="#6EE7B7"/>
            <path d="M 22 26 C 34 18, 48 24, 48 38 C 48 50, 34 54, 22 48" stroke="#10B981" stroke-width="7" stroke-linecap="round" fill="none"/>
            <circle cx="34" cy="38" r="4" fill="#6EE7B7"/>
            <line x1="22" y1="38" x2="30" y2="38" stroke="#05110E" stroke-width="3"/>
        </svg>
        """,
        "desc": "Matrix & Bio-Tech aesthetic: Emerald glow (#10B981) + Mint (#6EE7B7) on deep forest midnight."
    },
    {
        "num": "02",
        "title": "Prismatic Neon Violet",
        "bg": "#0C0714",
        "card_bg": "#170E24",
        "accent": "#A855F7",
        "svg": """
        <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="gradViolet" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#C084FC"/>
                    <stop offset="50%" stop-color="#A855F7"/>
                    <stop offset="100%" stop-color="#EC4899"/>
                </linearGradient>
            </defs>
            <path d="M 18 10 L 18 42 C 18 50, 26 56, 36 56 C 46 56, 52 48, 52 38 C 52 28, 44 22, 34 22 C 24 22, 18 28, 18 36" stroke="url(#gradViolet)" stroke-width="8" stroke-linecap="round" fill="none"/>
            <circle cx="18" cy="14" r="4" fill="#FFFFFF"/>
        </svg>
        """,
        "desc": "Electric synth & second-brain wave: Prismatic violet-to-pink gradient loop on dark amethyst."
    },
    {
        "num": "03",
        "title": "Solar Amber & Hyper-Orange",
        "bg": "#140A06",
        "card_bg": "#22110A",
        "accent": "#F59E0B",
        "svg": """
        <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            <!-- Dynamic dual chevron flame -->
            <path d="M 14 10 L 26 10 L 26 54 L 14 54 Z" fill="#F59E0B"/>
            <path d="M 26 26 L 46 16 L 52 26 L 36 36 L 52 46 L 44 54 L 26 40 Z" fill="#EF4444"/>
            <polygon points="18,14 22,14 22,50 18,50" fill="#FEF08A"/>
        </svg>
        """,
        "desc": "High-octane discipline & energy: Solar amber (#F59E0B) + Hyper-crimson (#EF4444) on espresso obsidian."
    },
    {
        "num": "04",
        "title": "Cobalt Blue & Cyan Precision",
        "bg": "#050B14",
        "card_bg": "#0C1728",
        "accent": "#3B82F6",
        "svg": """
        <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="14" y="8" width="10" height="48" rx="5" fill="#38BDF8"/>
            <path d="M 24 24 C 36 24, 48 30, 48 40 C 48 50, 36 56, 24 56 Z" fill="#2563EB"/>
            <circle cx="34" cy="40" r="7" fill="#050B14"/>
        </svg>
        """,
        "desc": "Linear & Vercel engineering aesthetic: Electric cyan (#38BDF8) + Deep cobalt (#2563EB) on navy."
    },
    {
        "num": "05",
        "title": "Y2K Glossy Bubblegum & Lavender",
        "bg": "#12091A",
        "card_bg": "#20122E",
        "accent": "#F472B6",
        "svg": """
        <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            <!-- Puffy tactile pill letter -->
            <rect x="12" y="8" width="16" height="48" rx="8" fill="#F472B6"/>
            <circle cx="38" cy="38" r="16" fill="#C084FC"/>
            <circle cx="38" cy="38" r="8" fill="#12091A"/>
            <!-- Glossy specular highlights -->
            <ellipse cx="18" cy="18" rx="3" ry="6" fill="#FFFFFF"/>
            <ellipse cx="44" cy="28" rx="4" ry="2" fill="#FFFFFF"/>
        </svg>
        """,
        "desc": "Playful tactile Y2K bubble aesthetic: Bubblegum pink (#F472B6) + Soft lilac (#C084FC) with glossy highlights."
    },
    {
        "num": "06",
        "title": "Luxury Titanium & Champagne Gold",
        "bg": "#0D0D11",
        "card_bg": "#181820",
        "accent": "#E2E8F0",
        "svg": """
        <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            <!-- Precision Swiss architecture -->
            <rect x="16" y="10" width="6" height="44" fill="#F1F5F9"/>
            <path d="M 22 24 C 36 24, 46 30, 46 40 C 46 50, 36 54, 22 54" stroke="#F59E0B" stroke-width="6" fill="none"/>
            <circle cx="32" cy="39" r="4" fill="#F1F5F9"/>
        </svg>
        """,
        "desc": "Refined Swiss luxury & hardware: Brushed titanium silver (#F1F5F9) + Champagne gold (#F59E0B) on slate."
    },
    {
        "num": "07",
        "title": "Bauhaus Tri-Color Offset",
        "bg": "#0B0E14",
        "card_bg": "#151B26",
        "accent": "#EC4899",
        "svg": """
        <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            <!-- Blue Stem -->
            <rect x="14" y="8" width="10" height="48" rx="4" fill="#38BDF8"/>
            <!-- Yellow Square Counter Base -->
            <rect x="22" y="24" width="28" height="28" rx="6" fill="#FBBF24"/>
            <!-- Pink Circle Cutout -->
            <circle cx="36" cy="38" r="8" fill="#EC4899"/>
            <!-- Inner Eye -->
            <circle cx="36" cy="38" r="4" fill="#0B0E14"/>
        </svg>
        """,
        "desc": "Bauhaus modernist poster: Primary color clash with Cyan (#38BDF8), Yellow (#FBBF24), and Hot Pink (#EC4899)."
    },
    {
        "num": "08",
        "title": "Acid Lime Industrial Brutalist",
        "bg": "#09090B",
        "card_bg": "#141418",
        "accent": "#CCFF00",
        "svg": """
        <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            <!-- Stencil terminal cut -->
            <path d="M 14 8 L 30 8 L 30 24 L 14 24 Z" fill="#CCFF00"/>
            <path d="M 14 28 L 30 28 L 30 56 L 14 56 Z" fill="#CCFF00"/>
            <path d="M 30 28 L 50 28 L 50 56 L 30 56 Z" fill="#FFFFFF"/>
            <rect x="36" y="36" width="8" height="12" fill="#09090B"/>
            <rect x="18" y="14" width="4" height="4" fill="#09090B"/>
        </svg>
        """,
        "desc": "Terminal hacker & declassified blueprint: High-visibility Acid Lime (#CCFF00) + Pure White on carbon."
    },
]

def build_html():
    cards = []
    for d in DIRECTIONS:
        cards.append(f"""
        <div class="card" style="background: {d['card_bg']}; border-color: rgba(255,255,255,0.08);">
            <div class="header">
                <span class="num" style="background: rgba(255,255,255,0.08); color: {d['accent']}; border: 1px solid {d['accent']};">{d['num']}</span>
                <h3 style="color: #FFFFFF;">{d['title']}</h3>
            </div>
            <div class="preview-row" style="background: {d['bg']}; border-color: rgba(255,255,255,0.06);">
                <!-- Large Mark Box -->
                <div class="glyph-box">
                    <div class="svg-wrap">{d['svg']}</div>
                    <span class="label">Mark</span>
                </div>
                <!-- App Icon Squircle -->
                <div class="app-icon-box" style="background: {d['card_bg']};">
                    <div class="svg-app">{d['svg']}</div>
                </div>
                <!-- Wordmark Lockup -->
                <div class="lockup-box">
                    <div class="svg-small">{d['svg']}</div>
                    <span class="wordmark" style="color: #FFFFFF;">basedly</span>
                </div>
            </div>
            <p class="desc">{d['desc']}</p>
        </div>
        """)

    html = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  body {{
    background: #08080C;
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
    font-size: 32px;
    font-weight: 800;
    letter-spacing: -0.03em;
    margin-bottom: 8px;
    color: #FFFFFF;
  }}
  .title-area p {{
    font-size: 15px;
    color: #94A3B8;
  }}
  .grid {{
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 28px;
    width: 100%;
    max-width: 1200px;
  }}
  .card {{
    border-radius: 20px;
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
  }}
  .header {{
    display: flex;
    align-items: center;
    gap: 10px;
  }}
  .num {{
    font-size: 12px;
    font-weight: 800;
    padding: 3px 8px;
    border-radius: 6px;
  }}
  .header h3 {{
    font-size: 17px;
    font-weight: 700;
    letter-spacing: -0.02em;
  }}
  .preview-row {{
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 18px;
    border-radius: 14px;
    border: 1px solid;
  }}
  .glyph-box {{
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }}
  .svg-wrap {{
    width: 72px;
    height: 72px;
    display: flex;
    align-items: center;
    justify-content: center;
  }}
  .svg-wrap svg {{
    width: 100%;
    height: 100%;
  }}
  .label {{
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #94A3B8;
    font-weight: 600;
  }}
  .app-icon-box {{
    width: 56px;
    height: 56px;
    border-radius: 14px;
    border: 1px solid rgba(255,255,255,0.1);
    display: flex;
    align-items: center;
    justify-content: center;
  }}
  .svg-app {{
    width: 38px;
    height: 38px;
    display: flex;
    align-items: center;
    justify-content: center;
  }}
  .svg-app svg {{
    width: 100%;
    height: 100%;
  }}
  .lockup-box {{
    display: flex;
    align-items: center;
    gap: 12px;
    margin-left: auto;
    padding-left: 16px;
    border-left: 1px solid rgba(255,255,255,0.08);
  }}
  .svg-small {{
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
  }}
  .svg-small svg {{
    width: 100%;
    height: 100%;
  }}
  .wordmark {{
    font-size: 24px;
    font-weight: 800;
    letter-spacing: -0.04em;
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
    <h1>Distinct Color Palettes & Art Directions</h1>
    <p>8 vibrant, diverse aesthetic worlds for 'basedly' brandmark</p>
  </div>
  <div class="grid">
    {''.join(cards)}
  </div>
</body>
</html>"""
    with open("scripts/color_directions.html", "w", encoding="utf-8") as f:
        f.write(html)
    print("Wrote scripts/color_directions.html")

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
        "--window-size=1280,1400",
        f"--screenshot={os.path.join(cwd, 'public', 'color-directions-showcase.png')}",
        f"file:///{os.path.join(cwd, 'scripts', 'color_directions.html')}"
    ]
    subprocess.run(cmd, check=False)
    print("Rendered: public/color-directions-showcase.png")

if __name__ == "__main__":
    build_html()
    render_png()
