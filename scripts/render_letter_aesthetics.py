import os
import subprocess

AESTHETICS = [
    (
        "Aesthetic 1: Retro-Future Triple Stripe (70s Braun / NASA)",
        """
        <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            <!-- 3 Parallel running lines forming a lowercase b -->
            <path d="M 16 10 L 16 42 A 14 14 0 0 0 44 42 A 14 14 0 0 0 16 42" stroke="#FBF7EE" stroke-width="3.5" fill="none"/>
            <path d="M 22 10 L 22 42 A 8 8 0 0 0 38 42 A 8 8 0 0 0 22 42" stroke="#D97757" stroke-width="3.5" fill="none"/>
            <path d="M 28 10 L 28 42 A 2 2 0 0 0 32 42 A 2 2 0 0 0 28 42" stroke="#F97316" stroke-width="3.5" fill="none"/>
        </svg>
        """,
        "Vintage industrial computing aesthetic: Multi-track parallel racing stripes with rounded loop turnaround."
    ),
    (
        "Aesthetic 2: 3D Isometric Monument 'B'",
        """
        <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            <!-- Top faces -->
            <path d="M 18 18 L 28 12 L 38 18 L 28 24 Z" fill="#F8B6A0"/>
            <path d="M 28 24 L 38 18 L 48 24 L 38 30 Z" fill="#F8B6A0"/>
            <!-- Left front faces -->
            <path d="M 18 18 L 28 24 L 28 50 L 18 44 Z" fill="#D97757"/>
            <path d="M 28 36 L 38 42 L 38 52 L 28 46 Z" fill="#D97757"/>
            <!-- Right shaded faces -->
            <path d="M 38 18 L 48 24 L 48 40 L 38 34 Z" fill="#8B4127"/>
            <path d="M 38 30 L 48 36 L 48 48 L 38 42 Z" fill="#6B2C16"/>
            <!-- Front loop accent -->
            <path d="M 28 24 L 38 30 L 38 44 L 28 38 Z" fill="#E88B6E"/>
        </svg>
        """,
        "Architectural 3D voxel monument: Bold isometric extruded planes conveying stability and deep structure."
    ),
    (
        "Aesthetic 3: Cyberpunk / Neo-Tokyo Angular 'b'",
        """
        <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            <!-- High-velocity diagonal cuts & mechanical joints -->
            <path d="M 14 10 L 26 10 L 26 28 L 46 16 L 52 24 L 34 35 L 52 46 L 44 54 L 26 43 L 26 54 L 14 54 Z" fill="#D97757"/>
            <path d="M 26 10 L 32 10 L 26 22 Z" fill="#FBF7EE"/>
            <rect x="18" y="14" width="4" height="36" fill="#0A0912"/>
        </svg>
        """,
        "Brutalist mecha & anime tech: Razor angular cuts, aggressive velocity angles, and mechanical negative space."
    ),
    (
        "Aesthetic 4: Organic Liquid Mercury / Blobitecture 'b'",
        """
        <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            <!-- Ultra-smooth continuous droplet contour -->
            <path d="
                M 22 8
                C 16 8, 16 20, 16 36
                C 16 48, 24 56, 36 56
                C 48 56, 52 46, 52 36
                C 52 26, 44 20, 32 20
                C 28 20, 26 22, 26 22
                L 26 12
                C 26 8, 24 8, 22 8
                Z
            " fill="#D97757"/>
            <!-- Liquid teardrop counter -->
            <path d="
                M 28 34
                C 28 28, 33 26, 38 28
                C 42 30, 44 35, 42 41
                C 40 46, 34 48, 30 46
                C 28 44, 28 38, 28 34
                Z
            " fill="#0A0912"/>
            <circle cx="21" cy="13" r="3" fill="#FBF7EE"/>
        </svg>
        """,
        "Modern luxury blobitecture: Fluid organic curves with molten teardrop counter and specular ivory pearl."
    ),
    (
        "Aesthetic 5: Swiss Monolith Ultra-Heavy 'b'",
        """
        <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            <!-- Maximum weight brutalist grotesque -->
            <rect x="12" y="8" width="40" height="48" rx="8" fill="#FBF7EE"/>
            <!-- Negative space top-right cutout -->
            <path d="M 28 8 L 52 8 L 52 26 L 28 26 Z" fill="#0A0912"/>
            <!-- Inner counter -->
            <rect x="26" y="34" width="14" height="12" rx="4" fill="#0A0912"/>
            <!-- Terracotta accent core -->
            <rect x="18" y="34" width="8" height="12" fill="#D97757"/>
        </svg>
        """,
        "Swiss modernist monolith: Massive optical weight, architectural negative-space cuts, and terracotta focal core."
    ),
    (
        "Aesthetic 6: Neon Wireframe Neural Cube 'b'",
        """
        <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            <!-- Interconnected isometric wireframe cube lattice -->
            <path d="M 16 10 L 16 54" stroke="#FBF7EE" stroke-width="4" stroke-linecap="round"/>
            <path d="M 16 32 L 34 22 L 50 32 L 34 42 Z" stroke="#D97757" stroke-width="4" fill="none" stroke-linejoin="round"/>
            <path d="M 34 42 L 34 54" stroke="#D97757" stroke-width="4" stroke-linecap="round"/>
            <path d="M 50 32 L 50 44 L 34 54" stroke="#D97757" stroke-width="4" stroke-linejoin="round"/>
            <path d="M 16 42 L 16 54 L 34 54" stroke="#FBF7EE" stroke-width="4" stroke-linejoin="round"/>
            <circle cx="34" cy="32" r="3.5" fill="#FBF7EE"/>
        </svg>
        """,
        "Neural graph & dimensional wireframe: Transparent isometric thought cube anchored to a vertical axis."
    ),
    (
        "Aesthetic 7: Origami Facet Fold 'b'",
        """
        <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            <!-- Folded polygonal planes -->
            <polygon points="16,8 28,16 28,48 16,56" fill="#FBF7EE"/>
            <polygon points="28,16 46,26 38,38 28,30" fill="#F8B6A0"/>
            <polygon points="38,38 52,38 46,54 28,48" fill="#D97757"/>
            <polygon points="28,30 38,38 28,48" fill="#A64F35"/>
        </svg>
        """,
        "Faceted origami fold: Sharp geometric paper planes creating tactile light and shadow depth."
    ),
    (
        "Aesthetic 8: Interlocking Torus / Infinity 'bd'",
        """
        <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            <!-- Left ring 'b' -->
            <circle cx="26" cy="36" r="14" stroke="#D97757" stroke-width="6" fill="none"/>
            <!-- Left ascender -->
            <line x1="12" y1="12" x2="12" y2="36" stroke="#D97757" stroke-width="6" stroke-linecap="round"/>
            <!-- Right ring 'd' -->
            <circle cx="38" cy="36" r="14" stroke="#FBF7EE" stroke-width="6" fill="none"/>
            <!-- Right ascender -->
            <line x1="52" y1="12" x2="52" y2="36" stroke="#FBF7EE" stroke-width="6" stroke-linecap="round"/>
        </svg>
        """,
        "Infinity loops & Venn geometry: Overlapping mathematical rings symbolizing interconnected systems."
    ),
]

def build_html():
    cards = []
    for idx, (title, svg_code, desc) in enumerate(AESTHETICS, 1):
        cards.append(f"""
        <div class="card">
            <div class="header">
                <span class="num">0{idx}</span>
                <h3>{title}</h3>
            </div>
            <div class="preview-row">
                <!-- Large Glyph Box -->
                <div class="glyph-box">
                    <div class="svg-wrap">{svg_code}</div>
                    <span class="label">Mark</span>
                </div>
                <!-- App Icon Squircle -->
                <div class="app-icon-box">
                    <div class="svg-app">{svg_code}</div>
                </div>
                <!-- Wordmark Lockup -->
                <div class="lockup-box">
                    <div class="svg-small">{svg_code}</div>
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
    gap: 28px;
    width: 100%;
    max-width: 1200px;
  }}
  .card {{
    background: #14121E;
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 20px;
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
    font-size: 12px;
    font-weight: 800;
    padding: 3px 8px;
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
    border-radius: 14px;
    border: 1px solid rgba(255,255,255,0.04);
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
    color: #64748B;
    font-weight: 600;
  }}
  .app-icon-box {{
    width: 56px;
    height: 56px;
    border-radius: 14px;
    background: #1C1917;
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
    <h1>Diverse Lettermark Aesthetic Directions</h1>
    <p>8 radically distinct design aesthetics for 'basedly' in Ivory (#FBF7EE) & Anthropic Terracotta (#D97757)</p>
  </div>
  <div class="grid">
    {''.join(cards)}
  </div>
</body>
</html>"""
    with open("scripts/letter_aesthetics.html", "w", encoding="utf-8") as f:
        f.write(html)
    print("Wrote scripts/letter_aesthetics.html")

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
        f"--screenshot={os.path.join(cwd, 'public', 'letter-aesthetics-showcase.png')}",
        f"file:///{os.path.join(cwd, 'scripts', 'letter_aesthetics.html')}"
    ]
    subprocess.run(cmd, check=False)
    print("Rendered: public/letter-aesthetics-showcase.png")

if __name__ == "__main__":
    build_html()
    render_png()
