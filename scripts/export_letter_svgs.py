import os
import subprocess

SVGS = [
    (
        "01-cyber-mint.svg",
        """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="512" height="512" fill="none">
  <rect x="14" y="10" width="8" height="44" rx="4" fill="#6EE7B7"/>
  <path d="M 22 26 C 34 18, 48 24, 48 38 C 48 50, 34 54, 22 48" stroke="#10B981" stroke-width="7" stroke-linecap="round" fill="none"/>
  <circle cx="34" cy="38" r="4" fill="#6EE7B7"/>
  <line x1="22" y1="38" x2="30" y2="38" stroke="#05110E" stroke-width="3"/>
</svg>"""
    ),
    (
        "02-neon-violet.svg",
        """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="512" height="512" fill="none">
  <defs>
    <linearGradient id="gradViolet" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#C084FC"/>
      <stop offset="50%" stop-color="#A855F7"/>
      <stop offset="100%" stop-color="#EC4899"/>
    </linearGradient>
  </defs>
  <path d="M 18 10 L 18 42 C 18 50, 26 56, 36 56 C 46 56, 52 48, 52 38 C 52 28, 44 22, 34 22 C 24 22, 18 28, 18 36" stroke="url(#gradViolet)" stroke-width="8" stroke-linecap="round" fill="none"/>
  <circle cx="18" cy="14" r="4" fill="#FFFFFF"/>
</svg>"""
    ),
    (
        "03-solar-amber.svg",
        """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="512" height="512" fill="none">
  <path d="M 14 10 L 26 10 L 26 54 L 14 54 Z" fill="#F59E0B"/>
  <path d="M 26 26 L 46 16 L 52 26 L 36 36 L 52 46 L 44 54 L 26 40 Z" fill="#EF4444"/>
  <polygon points="18,14 22,14 22,50 18,50" fill="#FEF08A"/>
</svg>"""
    ),
    (
        "04-cobalt-cyan.svg",
        """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="512" height="512" fill="none">
  <rect x="14" y="8" width="10" height="48" rx="5" fill="#38BDF8"/>
  <path d="M 24 24 C 36 24, 48 30, 48 40 C 48 50, 36 56, 24 56 Z" fill="#2563EB"/>
  <circle cx="34" cy="40" r="7" fill="#050B14"/>
</svg>"""
    ),
    (
        "05-bubblegum-lavender.svg",
        """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="512" height="512" fill="none">
  <rect x="12" y="8" width="16" height="48" rx="8" fill="#F472B6"/>
  <circle cx="38" cy="38" r="16" fill="#C084FC"/>
  <circle cx="38" cy="38" r="8" fill="#12091A"/>
  <ellipse cx="18" cy="18" rx="3" ry="6" fill="#FFFFFF"/>
  <ellipse cx="44" cy="28" rx="4" ry="2" fill="#FFFFFF"/>
</svg>"""
    ),
    (
        "06-titanium-gold.svg",
        """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="512" height="512" fill="none">
  <rect x="16" y="10" width="6" height="44" fill="#F1F5F9"/>
  <path d="M 22 24 C 36 24, 46 30, 46 40 C 46 50, 36 54, 22 54" stroke="#F59E0B" stroke-width="6" fill="none"/>
  <circle cx="32" cy="39" r="4" fill="#F1F5F9"/>
</svg>"""
    ),
    (
        "07-bauhaus-primary.svg",
        """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="512" height="512" fill="none">
  <rect x="14" y="8" width="10" height="48" rx="4" fill="#38BDF8"/>
  <rect x="22" y="24" width="28" height="28" rx="6" fill="#FBBF24"/>
  <circle cx="36" cy="38" r="8" fill="#EC4899"/>
  <circle cx="36" cy="38" r="4" fill="#0B0E14"/>
</svg>"""
    ),
    (
        "08-acid-brutalist.svg",
        """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="512" height="512" fill="none">
  <path d="M 14 8 L 30 8 L 30 24 L 14 24 Z" fill="#CCFF00"/>
  <path d="M 14 28 L 30 28 L 30 56 L 14 56 Z" fill="#CCFF00"/>
  <path d="M 30 28 L 50 28 L 50 56 L 30 56 Z" fill="#FFFFFF"/>
  <rect x="36" y="36" width="8" height="12" fill="#09090B"/>
  <rect x="18" y="14" width="4" height="4" fill="#09090B"/>
</svg>"""
    ),
]

def export_svgs():
    out_dir = os.path.join("public", "letter-svgs")
    os.makedirs(out_dir, exist_ok=True)
    for filename, content in SVGS:
        filepath = os.path.join(out_dir, filename)
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"Exported SVG: {filepath}")

if __name__ == "__main__":
    export_svgs()
