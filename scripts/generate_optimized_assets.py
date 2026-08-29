import os

def create_all_assets():
    # Ensure all directories exist
    dirs = [
        "public/textures",
        "public/mascots",
        "public/pixel-folders",
        "public/exercise-art",
        "public/tiers",
        "public/casino",
        "research"
    ]
    for d in dirs:
        os.makedirs(d, exist_ok=True)

    assets = {}

    # =========================================================================
    # 1. CORE BRAND ASSETS
    # =========================================================================

    # 1.1 Optimized basedly-otter-hero.svg (Path run-length encoded, ~2.3KB vs 44.0KB)
    assets["public/basedly-otter-hero.svg"] = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="100%" height="100%" shape-rendering="crispEdges">
  <path d="M6 1h4v1h-4zM22 1h4v1h-4zM5 2h1v1h-1zM9 2h1v1h-1zM21 2h1v1h-1zM25 2h1v1h-1zM4 3h1v1h-1zM8 3h14v1h-14zM26 3h1v1h-1zM3 4h1v1h-1zM7 4h10v1h-10zM27 4h1v1h-1zM2 5h1v2h-1zM28 5h1v2h-1zM1 7h1v2h-1zM29 7h1v2h-1zM1 9h1v6h-1zM29 9h1v6h-1zM2 15h1v2h-1zM28 15h1v2h-1zM3 17h1v1h-1zM27 17h1v1h-1zM4 18h1v1h-1zM26 18h1v1h-1zM4 19h1v1h-1zM26 19h1v1h-1zM3 20h1v1h-1zM27 20h1v1h-1zM2 21h1v3h-1zM28 21h1v3h-1zM3 24h1v1h-1zM27 24h1v1h-1zM30 24h2v1h-2zM3 25h1v1h-1zM26 25h1v1h-1zM30 25h1v2h-1zM4 26h1v1h-1zM24 26h1v1h-1zM5 27h1v1h-1zM22 27h1v1h-1zM6 28h5v1h-5zM15 28h4v1h-4zM21 28h4v1h-4zM8 29h1v2h-1zM14 29h1v2h-1zM19 29h1v2h-1zM25 29h1v2h-1zM9 31h6v1h-6zM20 31h6v1h-6z" fill="#141216"/>
  <path d="M5 3h4v1h-4zM21 3h4v1h-4zM4 4h4v1h-4zM22 4h4v1h-4zM7 5h18v1h-18zM2 17h2v1h-2zM26 17h2v1h-2zM3 18h2v1h-2zM25 18h2v1h-2zM3 26h2v1h-2zM25 26h2v1h-2zM4 27h2v1h-2zM23 27h2v1h-2zM5 28h2v1h-2zM11 28h4v1h-4zM19 28h2v1h-2zM8 30h1v1h-1zM14 30h1v1h-1zM19 30h1v1h-1zM25 30h1v1h-1z" fill="#3D1C12"/>
  <path d="M6 4h2v1h-2zM22 4h2v1h-2zM5 5h3v1h-3zM22 5h3v1h-3zM4 6h22v1h-22zM3 7h2v1h-2zM25 7h2v1h-2zM3 8h1v1h-1zM26 8h1v1h-1zM3 9h1v1h-1zM26 9h1v1h-1zM29 26h1v1h-1z" fill="#F8B6A0"/>
  <path d="M4 3h1v1h-1zM7 3h1v1h-1zM20 3h1v1h-1zM23 3h1v1h-1zM3 5h2v1h-2zM25 5h2v1h-2zM2 6h2v1h-2zM26 6h2v1h-2zM2 7h1v1h-1zM5 7h18v1h-18zM27 7h1v1h-1zM2 8h1v1h-1zM4 8h22v1h-22zM27 8h1v1h-1zM2 9h1v1h-1zM4 9h2v1h-2zM8 9h14v1h-14zM24 9h2v1h-2zM27 9h1v1h-1zM2 10h1v1h-1zM3 10h3v1h-3zM8 10h14v1h-14zM24 10h4v1h-4zM2 11h1v1h-1zM3 11h3v1h-3zM8 11h14v1h-14zM24 11h4v1h-4zM2 12h1v1h-1zM3 12h3v1h-3zM8 12h14v1h-14zM24 12h4v1h-4zM2 13h1v1h-1zM4 13h3v1h-3zM23 13h3v1h-3zM27 13h1v1h-1zM2 14h1v1h-1zM5 14h4v1h-4zM21 14h5v1h-5zM27 14h1v1h-1zM2 15h1v1h-1zM4 15h1v1h-1zM6 15h3v1h-3zM21 15h5v1h-5zM27 15h1v1h-1zM3 16h24v1h-24zM4 17h5v1h-5zM21 17h4v1h-4zM5 18h4v1h-4zM21 18h4v1h-4zM5 19h4v1h-4zM21 19h4v1h-4zM4 20h5v1h-5zM21 20h5v1h-5zM3 21h4v1h-4zM21 21h5v1h-5zM3 22h3v1h-3zM9 22h1v1h-1zM20 22h1v1h-1zM23 22h4v1h-4zM3 23h3v1h-3zM9 23h1v1h-1zM20 23h1v1h-1zM23 23h4v1h-4zM3 24h5v1h-5zM21 24h5v1h-5zM30 25h1v1h-1zM4 25h5v1h-5zM21 25h4v1h-4zM29 26h1v1h-1zM5 26h4v1h-4zM21 26h3v1h-3zM28 27h1v1h-1zM9 29h5v1h-5zM20 29h5v1h-5z" fill="#E88B6E"/>
  <path d="M6 9h2v1h-2zM22 9h2v1h-2zM6 10h1v1h-1zM22 10h1v1h-1z" fill="#FFFFFF"/>
  <path d="M7 10h1v1h-1zM23 10h1v1h-1zM6 11h1v1h-1zM22 11h1v1h-1z" fill="#5C2212"/>
  <path d="M7 11h1v1h-1zM23 11h1v1h-1zM6 12h2v1h-2zM22 12h2v1h-2zM14 13h2v1h-2z" fill="#1C1917"/>
  <path d="M2 12h1v2h-1zM27 12h1v2h-1z" fill="#FCA5A5"/>
  <path d="M12 12h6v1h-6zM12 13h1v1h-1zM17 13h1v1h-1zM9 17h12v1h-12zM9 18h2v1h-2zM19 18h2v1h-2zM9 19h1v1h-1zM20 19h1v1h-1zM9 20h1v1h-1zM20 20h1v1h-1zM9 21h1v1h-1zM20 21h1v1h-1zM9 24h12v1h-12z" fill="#F4EAE0"/>
  <path d="M13 13h4v1h-4zM11 18h8v1h-8zM10 19h10v1h-10zM10 20h10v1h-10zM10 21h10v1h-10z" fill="#FDF9F2"/>
  <path d="M10 22h10v1h-10zM10 23h10v1h-10z" fill="#DECFC0"/>
  <path d="M12 15h6v1h-6z" fill="#BDA995"/>
  <path d="M6 21h2v1h-2zM22 21h2v1h-2zM6 22h2v1h-2zM22 22h2v1h-2z" fill="#141216"/>
  <path d="M5 26h18v1h-18z" fill="#AA4C32"/>
  <path d="M6 27h16v1h-16z" fill="#782C18"/>
</svg>"""

    # 1.2 Optimized basedly-otter-scholar.svg (~2.3KB vs 44.1KB)
    assets["public/basedly-otter-scholar.svg"] = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="100%" height="100%" shape-rendering="crispEdges">
  <path d="M6 1h4v1h-4zM22 1h4v1h-4zM5 2h1v1h-1zM9 2h1v1h-1zM21 2h1v1h-1zM25 2h1v1h-1zM4 3h1v1h-1zM8 3h14v1h-14zM26 3h1v1h-1zM3 4h1v1h-1zM7 4h10v1h-10zM27 4h1v1h-1zM2 5h1v2h-1zM28 5h1v2h-1zM1 7h1v2h-1zM29 7h1v2h-1zM1 9h1v6h-1zM29 9h1v6h-1zM2 15h1v2h-1zM28 15h1v2h-1zM3 17h1v1h-1zM27 17h1v1h-1zM4 18h1v1h-1zM26 18h1v1h-1zM4 19h1v1h-1zM26 19h1v1h-1zM3 20h1v1h-1zM27 20h1v1h-1zM2 21h1v3h-1zM28 21h1v3h-1zM3 24h1v1h-1zM27 24h1v1h-1zM30 24h2v1h-2zM3 25h1v1h-1zM26 25h1v1h-1zM30 25h1v2h-1zM4 26h1v1h-1zM24 26h1v1h-1zM5 27h1v1h-1zM22 27h1v1h-1zM6 28h5v1h-5zM15 28h4v1h-4zM21 28h4v1h-4zM8 29h1v2h-1zM14 29h1v2h-1zM19 29h1v2h-1zM25 29h1v2h-1zM9 31h6v1h-6zM20 31h6v1h-6z" fill="#141216"/>
  <path d="M5 3h4v1h-4zM21 3h4v1h-4zM4 4h4v1h-4zM22 4h4v1h-4zM7 5h18v1h-18zM2 17h2v1h-2zM26 17h2v1h-2zM3 18h2v1h-2zM25 18h2v1h-2zM3 26h2v1h-2zM25 26h2v1h-2zM4 27h2v1h-2zM23 27h2v1h-2zM5 28h2v1h-2zM11 28h4v1h-4zM19 28h2v1h-2zM8 30h1v1h-1zM14 30h1v1h-1zM19 30h1v1h-1zM25 30h1v1h-1z" fill="#3D1C12"/>
  <path d="M6 4h2v1h-2zM22 4h2v1h-2zM5 5h3v1h-3zM22 5h3v1h-3zM4 6h22v1h-22zM3 7h2v1h-2zM25 7h2v1h-2zM3 8h1v1h-1zM26 8h1v1h-1zM3 9h1v1h-1zM26 9h1v1h-1zM29 26h1v1h-1z" fill="#F8B6A0"/>
  <path d="M4 3h1v1h-1zM7 3h1v1h-1zM20 3h1v1h-1zM23 3h1v1h-1zM3 5h2v1h-2zM25 5h2v1h-2zM2 6h2v1h-2zM26 6h2v1h-2zM2 7h1v1h-1zM5 7h18v1h-18zM27 7h1v1h-1zM2 8h1v1h-1zM4 8h22v1h-22zM27 8h1v1h-1zM2 9h1v1h-1zM4 9h2v1h-2zM12 9h6v1h-6zM24 9h2v1h-2zM27 9h1v1h-1zM2 10h1v1h-1zM3 10h3v1h-3zM12 10h6v1h-6zM24 10h4v1h-4zM2 11h1v1h-1zM3 11h3v1h-3zM12 11h6v1h-6zM24 11h4v1h-4zM2 12h1v1h-1zM3 12h3v1h-3zM12 12h6v1h-6zM24 12h4v1h-4zM2 13h1v1h-1zM4 13h3v1h-3zM23 13h3v1h-3zM27 13h1v1h-1zM2 14h1v1h-1zM5 14h4v1h-4zM21 14h5v1h-5zM27 14h1v1h-1zM2 15h1v1h-1zM4 15h1v1h-1zM6 15h3v1h-3zM21 15h5v1h-5zM27 15h1v1h-1zM3 16h24v1h-24zM4 17h5v1h-5zM21 17h4v1h-4zM5 18h4v1h-4zM21 18h4v1h-4zM5 19h4v1h-4zM21 19h4v1h-4zM4 20h5v1h-5zM21 20h5v1h-5zM3 21h4v1h-4zM21 21h5v1h-5zM3 22h3v1h-3zM9 22h1v1h-1zM20 22h1v1h-1zM23 22h4v1h-4zM3 23h3v1h-3zM9 23h1v1h-1zM20 23h1v1h-1zM23 23h4v1h-4zM3 24h5v1h-5zM21 24h5v1h-5zM30 25h1v1h-1zM4 25h5v1h-5zM21 25h4v1h-4zM29 26h1v1h-1zM5 26h4v1h-4zM21 26h3v1h-3zM28 27h1v1h-1zM9 29h5v1h-5zM20 29h5v1h-5z" fill="#E88B6E"/>
  <path d="M7 8h6v1h-6zM17 8h6v1h-6zM6 9h2v1h-2zM12 9h2v1h-2zM16 9h2v1h-2zM22 9h2v1h-2zM6 10h1v1h-1zM13 10h2v1h-2zM23 10h1v1h-1zM6 11h1v1h-1zM13 11h2v1h-2zM23 11h1v1h-1zM7 12h6v1h-6zM17 12h6v1h-6zM6 21h2v1h-2zM22 21h2v1h-2zM6 22h2v1h-2zM22 22h2v1h-2z" fill="#141216"/>
  <path d="M7 9h4v1h-4zM17 9h4v1h-4zM7 10h2v1h-2zM17 10h2v1h-2zM10 18h10v1h-10zM10 21h10v1h-10z" fill="#FFFFFF"/>
  <path d="M11 9h1v2h-1zM21 9h1v2h-1zM9 10h2v1h-2zM19 10h2v1h-2zM7 11h2v1h-2zM17 11h2v1h-2zM21 11h1v1h-1z" fill="#5C2212"/>
  <path d="M9 11h2v1h-2zM19 11h2v1h-2zM14 13h2v1h-2z" fill="#1C1917"/>
  <path d="M2 12h1v2h-1zM27 12h1v2h-1z" fill="#FCA5A5"/>
  <path d="M13 13h1v1h-1zM16 13h1v1h-1zM9 17h12v1h-12zM9 25h12v1h-12z" fill="#F4EAE0"/>
  <path d="M11 19h8v1h-8zM11 20h8v1h-8zM10 22h10v1h-10zM10 23h10v1h-10zM10 24h10v1h-10z" fill="#DECFC0"/>
  <path d="M12 15h6v1h-6zM13 20h4v1h-4z" fill="#BDA995"/>
  <path d="M5 26h18v1h-18z" fill="#AA4C32"/>
  <path d="M6 27h16v1h-16z" fill="#782C18"/>
</svg>"""

    # 1.3 Modern Theme-Adaptive Basedly Logo (Otter mascot + wordmark, supports light/dark via currentColor)
    assets["public/basedly-logo.svg"] = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 36" width="100%" height="100%" fill="none">
  <!-- Mascot Container (32x32) -->
  <g transform="translate(2, 2)">
    <svg width="32" height="32" viewBox="0 0 32 32" shape-rendering="crispEdges">
      <path d="M6 1h4v1h-4zM22 1h4v1h-4zM5 2h1v1h-1zM9 2h1v1h-1zM21 2h1v1h-1zM25 2h1v1h-1zM4 3h1v1h-1zM8 3h14v1h-14zM26 3h1v1h-1zM3 4h1v1h-1zM7 4h10v1h-10zM27 4h1v1h-1zM2 5h1v2h-1zM28 5h1v2h-1zM1 7h1v2h-1zM29 7h1v2h-1zM1 9h1v6h-1zM29 9h1v6h-1zM2 15h1v2h-1zM28 15h1v2h-1zM3 17h1v1h-1zM27 17h1v1h-1zM4 18h1v1h-1zM26 18h1v1h-1zM4 19h1v1h-1zM26 19h1v1h-1zM3 20h1v1h-1zM27 20h1v1h-1zM2 21h1v3h-1zM28 21h1v3h-1zM3 24h1v1h-1zM27 24h1v1h-1zM30 24h2v1h-2zM3 25h1v1h-1zM26 25h1v1h-1zM30 25h1v2h-1zM4 26h1v1h-1zM24 26h1v1h-1zM5 27h1v1h-1zM22 27h1v1h-1zM6 28h5v1h-5zM15 28h4v1h-4zM21 28h4v1h-4zM8 29h1v2h-1zM14 29h1v2h-1zM19 29h1v2h-1zM25 29h1v2h-1zM9 31h6v1h-6zM20 31h6v1h-6z" fill="#141216"/>
      <path d="M5 3h4v1h-4zM21 3h4v1h-4zM4 4h4v1h-4zM22 4h4v1h-4zM7 5h18v1h-18zM2 17h2v1h-2zM26 17h2v1h-2zM3 18h2v1h-2zM25 18h2v1h-2zM3 26h2v1h-2zM25 26h2v1h-2zM4 27h2v1h-2zM23 27h2v1h-2zM5 28h2v1h-2zM11 28h4v1h-4zM19 28h2v1h-2zM8 30h1v1h-1zM14 30h1v1h-1zM19 30h1v1h-1zM25 30h1v1h-1z" fill="#3D1C12"/>
      <path d="M6 4h2v1h-2zM22 4h2v1h-2zM5 5h3v1h-3zM22 5h3v1h-3zM4 6h22v1h-22zM3 7h2v1h-2zM25 7h2v1h-2zM3 8h1v1h-1zM26 8h1v1h-1zM3 9h1v1h-1zM26 9h1v1h-1zM29 26h1v1h-1z" fill="#F8B6A0"/>
      <path d="M4 3h1v1h-1zM7 3h1v1h-1zM20 3h1v1h-1zM23 3h1v1h-1zM3 5h2v1h-2zM25 5h2v1h-2zM2 6h2v1h-2zM26 6h2v1h-2zM2 7h1v1h-1zM5 7h18v1h-18zM27 7h1v1h-1zM2 8h1v1h-1zM4 8h22v1h-22zM27 8h1v1h-1zM2 9h1v1h-1zM4 9h2v1h-2zM8 9h14v1h-14zM24 9h2v1h-2zM27 9h1v1h-1zM2 10h1v1h-1zM3 10h3v1h-3zM8 10h14v1h-14zM24 10h4v1h-4zM2 11h1v1h-1zM3 11h3v1h-3zM8 11h14v1h-14zM24 11h4v1h-4zM2 12h1v1h-1zM3 12h3v1h-3zM8 12h14v1h-14zM24 12h4v1h-4zM2 13h1v1h-1zM4 13h3v1h-3zM23 13h3v1h-3zM27 13h1v1h-1zM2 14h1v1h-1zM5 14h4v1h-4zM21 14h5v1h-5zM27 14h1v1h-1zM2 15h1v1h-1zM4 15h1v1h-1zM6 15h3v1h-3zM21 15h5v1h-5zM27 15h1v1h-1zM3 16h24v1h-24zM4 17h5v1h-5zM21 17h4v1h-4zM5 18h4v1h-4zM21 18h4v1h-4zM5 19h4v1h-4zM21 19h4v1h-4zM4 20h5v1h-5zM21 20h5v1h-5zM3 21h4v1h-4zM21 21h5v1h-5zM3 22h3v1h-3zM9 22h1v1h-1zM20 22h1v1h-1zM23 22h4v1h-4zM3 23h3v1h-3zM9 23h1v1h-1zM20 23h1v1h-1zM23 23h4v1h-4zM3 24h5v1h-5zM21 24h5v1h-5zM30 25h1v1h-1zM4 25h5v1h-5zM21 25h4v1h-4zM29 26h1v1h-1zM5 26h4v1h-4zM21 26h3v1h-3zM28 27h1v1h-1zM9 29h5v1h-5zM20 29h5v1h-5z" fill="#E88B6E"/>
      <path d="M6 9h2v1h-2zM22 9h2v1h-2zM6 10h1v1h-1zM22 10h1v1h-1z" fill="#FFFFFF"/>
      <path d="M7 10h1v1h-1zM23 10h1v1h-1zM6 11h1v1h-1zM22 11h1v1h-1z" fill="#5C2212"/>
      <path d="M7 11h1v1h-1zM23 11h1v1h-1zM6 12h2v1h-2zM22 12h2v1h-2zM14 13h2v1h-2z" fill="#1C1917"/>
      <path d="M2 12h1v2h-1zM27 12h1v2h-1z" fill="#FCA5A5"/>
      <path d="M12 12h6v1h-6zM12 13h1v1h-1zM17 13h1v1h-1zM9 17h12v1h-12zM9 18h2v1h-2zM19 18h2v1h-2zM9 19h1v1h-1zM20 19h1v1h-1zM9 20h1v1h-1zM20 20h1v1h-1zM9 21h1v1h-1zM20 21h1v1h-1zM9 24h12v1h-12z" fill="#F4EAE0"/>
      <path d="M13 13h4v1h-4zM11 18h8v1h-8zM10 19h10v1h-10zM10 20h10v1h-10zM10 21h10v1h-10z" fill="#FDF9F2"/>
      <path d="M10 22h10v1h-10zM10 23h10v1h-10z" fill="#DECFC0"/>
      <path d="M12 15h6v1h-6z" fill="#BDA995"/>
      <path d="M6 21h2v1h-2zM22 21h2v1h-2zM6 22h2v1h-2zM22 22h2v1h-2z" fill="#141216"/>
      <path d="M5 26h18v1h-18z" fill="#AA4C32"/>
      <path d="M6 27h16v1h-16z" fill="#782C18"/>
    </svg>
  </g>
  <!-- Wordmark in currentColor (renders crisp on dark & light) -->
  <text x="42" y="24" font-family="-apple-system, BlinkMacSystemFont, 'Inter', 'SF Pro Display', Roboto, sans-serif" font-size="20" font-weight="800" letter-spacing="-0.03em" fill="currentColor">basedly</text>
</svg>"""

    # 1.4 Standalone App Icon Mark (Squircle badge + Otter emblem)
    assets["public/basedly-mark.svg"] = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" fill="none">
  <rect width="64" height="64" rx="16" fill="#17161F" stroke="#7C6CFF" stroke-width="2"/>
  <g transform="translate(16, 16) scale(1)">
    <svg width="32" height="32" viewBox="0 0 32 32" shape-rendering="crispEdges">
      <path d="M6 1h4v1h-4zM22 1h4v1h-4zM5 2h1v1h-1zM9 2h1v1h-1zM21 2h1v1h-1zM25 2h1v1h-1zM4 3h1v1h-1zM8 3h14v1h-14zM26 3h1v1h-1zM3 4h1v1h-1zM7 4h10v1h-10zM27 4h1v1h-1zM2 5h1v2h-1zM28 5h1v2h-1zM1 7h1v2h-1zM29 7h1v2h-1zM1 9h1v6h-1zM29 9h1v6h-1zM2 15h1v2h-1zM28 15h1v2h-1zM3 17h1v1h-1zM27 17h1v1h-1zM4 18h1v1h-1zM26 18h1v1h-1zM4 19h1v1h-1zM26 19h1v1h-1zM3 20h1v1h-1zM27 20h1v1h-1zM2 21h1v3h-1zM28 21h1v3h-1zM3 24h1v1h-1zM27 24h1v1h-1zM30 24h2v1h-2zM3 25h1v1h-1zM26 25h1v1h-1zM30 25h1v2h-1zM4 26h1v1h-1zM24 26h1v1h-1zM5 27h1v1h-1zM22 27h1v1h-1zM6 28h5v1h-5zM15 28h4v1h-4zM21 28h4v1h-4zM8 29h1v2h-1zM14 29h1v2h-1zM19 29h1v2h-1zM25 29h1v2h-1zM9 31h6v1h-6zM20 31h6v1h-6z" fill="#141216"/>
      <path d="M5 3h4v1h-4zM21 3h4v1h-4zM4 4h4v1h-4zM22 4h4v1h-4zM7 5h18v1h-18zM2 17h2v1h-2zM26 17h2v1h-2zM3 18h2v1h-2zM25 18h2v1h-2zM3 26h2v1h-2zM25 26h2v1h-2zM4 27h2v1h-2zM23 27h2v1h-2zM5 28h2v1h-2zM11 28h4v1h-4zM19 28h2v1h-2zM8 30h1v1h-1zM14 30h1v1h-1zM19 30h1v1h-1zM25 30h1v1h-1z" fill="#3D1C12"/>
      <path d="M6 4h2v1h-2zM22 4h2v1h-2zM5 5h3v1h-3zM22 5h3v1h-3zM4 6h22v1h-22zM3 7h2v1h-2zM25 7h2v1h-2zM3 8h1v1h-1zM26 8h1v1h-1zM3 9h1v1h-1zM26 9h1v1h-1zM29 26h1v1h-1z" fill="#F8B6A0"/>
      <path d="M4 3h1v1h-1zM7 3h1v1h-1zM20 3h1v1h-1zM23 3h1v1h-1zM3 5h2v1h-2zM25 5h2v1h-2zM2 6h2v1h-2zM26 6h2v1h-2zM2 7h1v1h-1zM5 7h18v1h-18zM27 7h1v1h-1zM2 8h1v1h-1zM4 8h22v1h-22zM27 8h1v1h-1zM2 9h1v1h-1zM4 9h2v1h-2zM8 9h14v1h-14zM24 9h2v1h-2zM27 9h1v1h-1zM2 10h1v1h-1zM3 10h3v1h-3zM8 10h14v1h-14zM24 10h4v1h-4zM2 11h1v1h-1zM3 11h3v1h-3zM8 11h14v1h-14zM24 11h4v1h-4zM2 12h1v1h-1zM3 12h3v1h-3zM8 12h14v1h-14zM24 12h4v1h-4zM2 13h1v1h-1zM4 13h3v1h-3zM23 13h3v1h-3zM27 13h1v1h-1zM2 14h1v1h-1zM5 14h4v1h-4zM21 14h5v1h-5zM27 14h1v1h-1zM2 15h1v1h-1zM4 15h1v1h-1zM6 15h3v1h-3zM21 15h5v1h-5zM27 15h1v1h-1zM3 16h24v1h-24zM4 17h5v1h-5zM21 17h4v1h-4zM5 18h4v1h-4zM21 18h4v1h-4zM5 19h4v1h-4zM21 19h4v1h-4zM4 20h5v1h-5zM21 20h5v1h-5zM3 21h4v1h-4zM21 21h5v1h-5zM3 22h3v1h-3zM9 22h1v1h-1zM20 22h1v1h-1zM23 22h4v1h-4zM3 23h3v1h-3zM9 23h1v1h-1zM20 23h1v1h-1zM23 23h4v1h-4zM3 24h5v1h-5zM21 24h5v1h-5zM30 25h1v1h-1zM4 25h5v1h-5zM21 25h4v1h-4zM29 26h1v1h-1zM5 26h4v1h-4zM21 26h3v1h-3zM28 27h1v1h-1zM9 29h5v1h-5zM20 29h5v1h-5z" fill="#E88B6E"/>
      <path d="M6 9h2v1h-2zM22 9h2v1h-2zM6 10h1v1h-1zM22 10h1v1h-1z" fill="#FFFFFF"/>
      <path d="M7 10h1v1h-1zM23 10h1v1h-1zM6 11h1v1h-1zM22 11h1v1h-1z" fill="#5C2212"/>
      <path d="M7 11h1v1h-1zM23 11h1v1h-1zM6 12h2v1h-2zM22 12h2v1h-2zM14 13h2v1h-2z" fill="#1C1917"/>
      <path d="M2 12h1v2h-1zM27 12h1v2h-1z" fill="#FCA5A5"/>
      <path d="M12 12h6v1h-6zM12 13h1v1h-1zM17 13h1v1h-1zM9 17h12v1h-12zM9 18h2v1h-2zM19 18h2v1h-2zM9 19h1v1h-1zM20 19h1v1h-1zM9 20h1v1h-1zM20 20h1v1h-1zM9 21h1v1h-1zM20 21h1v1h-1zM9 24h12v1h-12z" fill="#F4EAE0"/>
      <path d="M13 13h4v1h-4zM11 18h8v1h-8zM10 19h10v1h-10zM10 20h10v1h-10zM10 21h10v1h-10z" fill="#FDF9F2"/>
      <path d="M10 22h10v1h-10zM10 23h10v1h-10z" fill="#DECFC0"/>
      <path d="M12 15h6v1h-6z" fill="#BDA995"/>
      <path d="M6 21h2v1h-2zM22 21h2v1h-2zM6 22h2v1h-2zM22 22h2v1h-2z" fill="#141216"/>
      <path d="M5 26h18v1h-18z" fill="#AA4C32"/>
      <path d="M6 27h16v1h-16z" fill="#782C18"/>
    </svg>
  </g>
</svg>"""

    # =========================================================================
    # 2. AMBIENT TEXTURES & BACKGROUND PATTERNS
    # =========================================================================

    # 2.1 Dot Grid Pattern (Subtle responsive dot grid)
    assets["public/textures/dot-grid.svg"] = """<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
  <circle cx="12" cy="12" r="1.2" fill="currentColor" opacity="0.16"/>
</svg>"""

    # 2.2 Isometric Grid Pattern
    assets["public/textures/isometric-grid.svg"] = """<svg xmlns="http://www.w3.org/2000/svg" width="48" height="28" viewBox="0 0 48 28" fill="none">
  <path d="M0 14 L24 0 L48 14 L24 28 Z" stroke="currentColor" stroke-width="0.8" opacity="0.12"/>
</svg>"""

    # 2.3 Blueprint Grid Pattern (Major/Minor grid)
    assets["public/textures/blueprint-grid.svg"] = """<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40" fill="none">
  <path d="M10 0v40M20 0v40M30 0v40M0 10h40M0 20h40M0 30h40" stroke="currentColor" stroke-width="0.5" opacity="0.08"/>
  <path d="M40 0v40M0 40h40" stroke="currentColor" stroke-width="1.2" opacity="0.15"/>
</svg>"""

    # 2.4 Subtle Noise Filter (Grain texture for glass panels)
    assets["public/textures/subtle-noise.svg"] = """<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
  <filter id="noiseFilter">
    <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" stitchTiles="stitch"/>
    <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.06 0"/>
  </filter>
  <rect width="100%" height="100%" filter="url(#noiseFilter)"/>
</svg>"""

    # 2.5 Topographic Elevation Contour Map (Trail/Challenges)
    assets["public/textures/topo-contour.svg"] = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200" width="100%" height="100%" fill="none">
  <path d="M-10 180 Q80 120 180 160 T380 130 T500 170" stroke="currentColor" stroke-width="1.2" opacity="0.12"/>
  <path d="M-10 150 Q100 80 220 120 T420 90 T520 140" stroke="currentColor" stroke-width="1.2" opacity="0.15"/>
  <path d="M-10 110 Q120 40 260 90 T440 60 T540 100" stroke="currentColor" stroke-width="1.4" opacity="0.18"/>
  <path d="M-10 70 Q140 10 300 60 T460 30 T560 70" stroke="currentColor" stroke-width="1.2" opacity="0.15"/>
  <path d="M-10 30 Q160 -20 340 30 T480 10 T580 40" stroke="currentColor" stroke-width="1.2" opacity="0.12"/>
</svg>"""

    # 2.6 Geometric Hexagonal Mesh Pattern
    assets["public/textures/geometric-hex.svg"] = """<svg xmlns="http://www.w3.org/2000/svg" width="56" height="96" viewBox="0 0 56 96" fill="none">
  <path d="M28 0 L56 16 L56 48 L28 64 L0 48 L0 16 Z" stroke="currentColor" stroke-width="0.8" opacity="0.1"/>
  <path d="M28 64 L56 80 L56 112 L28 128 L0 112 L0 80 Z" stroke="currentColor" stroke-width="0.8" opacity="0.1"/>
  <path d="M0 48 L28 64 L28 96 L0 112 L-28 96 L-28 64 Z" stroke="currentColor" stroke-width="0.8" opacity="0.1"/>
  <path d="M56 48 L84 64 L84 96 L56 112 L28 96 L28 64 Z" stroke="currentColor" stroke-width="0.8" opacity="0.1"/>
</svg>"""

    # =========================================================================
    # 3. MASCOT SUITE (14 Species)
    # =========================================================================

    mascots = {
        "fox": {
            "coat": "#F0894A", "muzzle": "#FFF1E2", "ear": "#C75C2E",
            "ears": '<path d="M6 17 L10 3 L20 17 Z" fill="#F0894A"/><path d="M42 17 L38 3 L28 17 Z" fill="#F0894A"/><path d="M9 15 L11 8 L16 15 Z" fill="#C75C2E"/><path d="M39 15 L37 8 L32 15 Z" fill="#C75C2E"/>',
            "face": '<ellipse cx="24" cy="32" rx="2.6" ry="2" fill="#20232E"/>'
        },
        "cat": {
            "coat": "#9AA6C4", "muzzle": "#EDF1FA", "ear": "#7A86A6",
            "ears": '<path d="M7 17 L12 4 L21 17 Z" fill="#9AA6C4"/><path d="M41 17 L36 4 L27 17 Z" fill="#9AA6C4"/><path d="M10 15 L13 8 L18 15 Z" fill="#7A86A6"/><path d="M38 15 L35 8 L30 15 Z" fill="#7A86A6"/>',
            "face": '<path d="M22 32 h4 l-2 2 z" fill="#20232E"/><g stroke="#20232E" stroke-width="1" stroke-linecap="round" opacity="0.55"><path d="M10 30 h6M10 33.5 h6M38 30 h-6M38 33.5 h-6"/></g>'
        },
        "bear": {
            "coat": "#B07A55", "muzzle": "#EBD9C6", "ear": "#8C5B3C",
            "ears": '<circle cx="11" cy="12" r="7" fill="#B07A55"/><circle cx="37" cy="12" r="7" fill="#B07A55"/><circle cx="11" cy="12" r="3.4" fill="#8C5B3C"/><circle cx="37" cy="12" r="3.4" fill="#8C5B3C"/>',
            "face": '<ellipse cx="24" cy="31.5" rx="3" ry="2.2" fill="#20232E"/>'
        },
        "owl": {
            "coat": "#8E7BC4", "muzzle": "#E6DEFA", "ear": "#6B58A0",
            "ears": '<path d="M11 14 L14 6 L20 13 Z" fill="#8E7BC4"/><path d="M37 14 L34 6 L28 13 Z" fill="#8E7BC4"/>',
            "face": '<circle cx="17.5" cy="27" r="6.4" fill="#E6DEFA" opacity="0.9"/><circle cx="30.5" cy="27" r="6.4" fill="#E6DEFA" opacity="0.9"/><path d="M24 29 l3.2 3.4 -3.2 3.4 -3.2 -3.4 z" fill="#FFC24B"/>'
        },
        "frog": {
            "coat": "#5FC46E", "muzzle": "#DFF6E2", "ear": "#3E9A4C",
            "ears": '<circle cx="14" cy="12" r="6.6" fill="#5FC46E"/><circle cx="34" cy="12" r="6.6" fill="#5FC46E"/>',
            "face": '<circle cx="20.5" cy="29" r="0.9" fill="#20232E" opacity="0.6"/><circle cx="27.5" cy="29" r="0.9" fill="#20232E" opacity="0.6"/>'
        },
        "panda": {
            "coat": "#F2F3F7", "muzzle": "#FFFFFF", "ear": "#2C3040",
            "ears": '<circle cx="11" cy="12" r="6.6" fill="#2C3040"/><circle cx="37" cy="12" r="6.6" fill="#2C3040"/>',
            "face": '<ellipse cx="16.5" cy="26" rx="5.4" ry="6" fill="#2C3040" transform="rotate(-14 16.5 26)"/><ellipse cx="31.5" cy="26" rx="5.4" ry="6" fill="#2C3040" transform="rotate(14 31.5 26)"/><ellipse cx="24" cy="31.5" rx="2.8" ry="2" fill="#20232E"/>'
        },
        "rabbit": {
            "coat": "#F0C7D4", "muzzle": "#FFF0F4", "ear": "#D794A8",
            "ears": '<ellipse cx="17" cy="7" rx="3.6" ry="10" fill="#F0C7D4" transform="rotate(-9 17 7)"/><ellipse cx="31" cy="7" rx="3.6" ry="10" fill="#F0C7D4" transform="rotate(9 31 7)"/><ellipse cx="17" cy="8" rx="1.7" ry="6.4" fill="#D794A8" transform="rotate(-9 17 8)"/><ellipse cx="31" cy="8" rx="1.7" ry="6.4" fill="#D794A8" transform="rotate(9 31 8)"/>',
            "face": '<path d="M22.4 31 h3.2 l-1.6 1.8 z" fill="#C4607F"/>'
        },
        "wolf": {
            "coat": "#7E8796", "muzzle": "#DCE2EC", "ear": "#5C6472",
            "ears": '<path d="M6 17 L9 2 L19 17 Z" fill="#7E8796"/><path d="M42 17 L39 2 L29 17 Z" fill="#7E8796"/><path d="M9.5 15 L11.5 8.5 L16 15 Z" fill="#5C6472"/><path d="M38.5 15 L36.5 8.5 L32 15 Z" fill="#5C6472"/>',
            "face": '<path d="M21.6 30.6 h4.8 l-2.4 2.4 z" fill="#20232E"/>'
        },
        "shiba": {
            "coat": "#EBA052", "muzzle": "#FFF6EB", "ear": "#C8782E",
            "ears": '<path d="M6 17 L10 3 L20 17 Z" fill="#EBA052"/><path d="M42 17 L38 3 L28 17 Z" fill="#EBA052"/><path d="M10 15 L12 9 L15 15 Z" fill="#FFF6EB"/><path d="M38 15 L36 9 L33 15 Z" fill="#FFF6EB"/>',
            "face": '<circle cx="16.5" cy="23.5" r="1.4" fill="#FFF6EB"/><circle cx="31.5" cy="23.5" r="1.4" fill="#FFF6EB"/><ellipse cx="24" cy="31.5" rx="2.6" ry="2" fill="#20232E"/>'
        },
        "capybara": {
            "coat": "#9A7150", "muzzle": "#D2AB8B", "ear": "#6E492E",
            "ears": '<circle cx="10" cy="17" r="4.8" fill="#6E492E"/><circle cx="38" cy="17" r="4.8" fill="#6E492E"/><circle cx="10" cy="17" r="2.2" fill="#4B311E"/><circle cx="38" cy="17" r="2.2" fill="#4B311E"/>',
            "face": '<rect x="18" y="27" width="12" height="7" rx="3.5" fill="#D2AB8B"/><ellipse cx="24" cy="31" rx="3" ry="1.8" fill="#20232E"/>'
        },
        "dragon": {
            "coat": "#2EB8A6", "muzzle": "#C2F5EE", "ear": "#FF9F1C",
            "ears": '<path d="M10 17 L7 5 L17 12 Z" fill="#FF9F1C"/><path d="M38 17 L41 5 L31 12 Z" fill="#FF9F1C"/>',
            "face": '<circle cx="21" cy="31" r="1" fill="#20232E"/><circle cx="27" cy="31" r="1" fill="#20232E"/>'
        },
        "raccoon": {
            "coat": "#636E80", "muzzle": "#EAEFF8", "ear": "#424A59",
            "ears": '<circle cx="12" cy="13" r="6" fill="#424A59"/><circle cx="36" cy="13" r="6" fill="#424A59"/><circle cx="12" cy="13" r="3" fill="#EAEFF8"/><circle cx="36" cy="13" r="3" fill="#EAEFF8"/>',
            "face": '<path d="M10 24 q14 -2 28 0 q-4 8 -14 7 q-10 1 -14 -7 z" fill="#252A36" opacity="0.92"/><ellipse cx="24" cy="32" rx="2.5" ry="1.8" fill="#20232E"/>'
        },
        "penguin": {
            "coat": "#22283A", "muzzle": "#FFFFFF", "ear": "#1A1E2C",
            "ears": '',
            "face": '<ellipse cx="24" cy="27" rx="11" ry="12" fill="#FFFFFF"/><path d="M20 29 l4 4 l4 -4 z" fill="#FFB703"/>'
        },
        "otter": {
            "coat": "#82593E", "muzzle": "#F0E5DB", "ear": "#5C3822",
            "ears": '<circle cx="10" cy="16" r="4.5" fill="#5C3822"/><circle cx="38" cy="16" r="4.5" fill="#5C3822"/>',
            "face": '<ellipse cx="24" cy="31.5" rx="3.2" ry="2.2" fill="#20232E"/><g stroke="#20232E" stroke-width="0.8" opacity="0.5" stroke-linecap="round"><path d="M12 33 h5M12 35 h5M36 33 h-5M36 35 h-5"/></g>'
        }
    }

    for name, s in mascots.items():
        assets[f"public/mascots/{name}.svg"] = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48" fill="none">
  <!-- Ears -->
  <g>{s['ears']}</g>
  <!-- Head Base -->
  <ellipse cx="24" cy="26" rx="15.5" ry="14.5" fill="{s['coat']}"/>
  <ellipse cx="24" cy="32.5" rx="9" ry="7" fill="{s['muzzle']}" opacity="0.95"/>
  <!-- Face Markings / Nose -->
  {s['face']}
  <!-- Eyes -->
  <g>
    <ellipse cx="17.5" cy="27" rx="2.7" ry="3.1" fill="#20232E"/>
    <ellipse cx="30.5" cy="27" rx="2.7" ry="3.1" fill="#20232E"/>
    <circle cx="18.5" cy="25.9" r="1" fill="#FFFFFF" opacity="0.9"/>
    <circle cx="31.5" cy="25.9" r="1" fill="#FFFFFF" opacity="0.9"/>
  </g>
  <!-- Eyebrows -->
  <g stroke="#20232E" stroke-width="1.8" stroke-linecap="round" opacity="0.85">
    <path d="M13.4 23.6 L21 26.6"/>
    <path d="M34.6 23.6 L27 26.6"/>
  </g>
  <!-- Mouth -->
  <path d="M20.6 34.8 q3.4 2.8 6.8 0" stroke="#20232E" stroke-width="1.7" fill="none" stroke-linecap="round"/>
</svg>"""

    # =========================================================================
    # 4. PIXEL PROJECT FOLDERS (12 Icons)
    # =========================================================================

    pixel_folders = {
        "core": """<g>
    <path d="M4 4H15V6H32V8H34V28H32V30H6V28H4V4Z" fill="#0F0D15"/>
    <path d="M5 6H8V28H5V6Z" fill="#78350F"/>
    <path d="M8 6H29V10H8V6Z" fill="#F8FAFC"/>
    <path d="M9 7H28V8H9V7ZM9 9H24V10H9V9Z" fill="#CBD5E1"/>
    <path d="M7 10H33V27H31V29H9V27H7V10Z" fill="#B45309"/>
    <path d="M9 12H31V13H9V12ZM9 13H10V26H9V13ZM30 13H31V26H30V13ZM9 26H31V27H9V26Z" fill="#FDE047" opacity="0.85"/>
    <path d="M12 15L23 26H20L10 16V15H12ZM18 13L30 25V23L20 13H18Z" fill="#FCD34D" opacity="0.45"/>
    <rect x="16" y="16" width="6" height="8" rx="1" fill="#FEF08A"/>
    <rect x="17" y="17" width="4" height="6" fill="#F59E0B"/>
    <circle cx="19" cy="19" r="1.2" fill="#78350F"/>
    <rect x="18.5" y="19" width="1" height="2.5" fill="#78350F"/>
  </g>""",
        "emerald": """<g>
    <path d="M2 22L5 19V26L2 29V22ZM4 26L7 23V29L4 31V26Z" fill="#34D399"/>
    <path d="M32 23L35 20V27L32 29V23Z" fill="#6EE7B7"/>
    <path d="M4 4H15V6H32V8H34V28H32V30H6V28H4V4Z" fill="#022C22"/>
    <path d="M8 6H29V10H8V6Z" fill="#ECFDF5"/>
    <path d="M9 7H28V8H9V7Z" fill="#A7F3D0"/>
    <path d="M7 10H33V27H31V29H9V27H7V10Z" fill="#047857"/>
    <path d="M10 13H30L26 26H14L10 13Z" fill="#065F46"/>
    <polygon points="10,13 20,13 16,19" fill="#10B981" opacity="0.8"/>
    <polygon points="20,13 30,13 24,19" fill="#34D399" opacity="0.85"/>
    <polygon points="10,13 16,19 14,26" fill="#059669"/>
    <polygon points="30,13 24,19 26,26" fill="#10B981"/>
    <polygon points="16,19 24,19 20,26" fill="#6EE7B7" opacity="0.9"/>
    <rect x="16" y="17" width="6" height="7" fill="#FBBF24"/>
    <polygon points="19,18 21,20 19,23 17,20" fill="#34D399"/>
    <polygon points="19,19 20,20 19,21 18,20" fill="#FFFFFF"/>
  </g>""",
        "ruby": """<g>
    <path d="M4 4H15V6H32V8H34V28H32V30H6V28H4V4Z" fill="#180408"/>
    <path d="M8 6H29V10H8V6Z" fill="#FFF1F2"/>
    <path d="M9 7H28V8H9V7Z" fill="#FECDD3"/>
    <path d="M7 10H33V27H31V29H9V27H7V10Z" fill="#B91C1C"/>
    <rect x="9" y="12" width="22" height="15" fill="none" stroke="#F59E0B" stroke-width="1"/>
    <circle cx="11" cy="14" r="1" fill="#FDE047"/><circle cx="29" cy="14" r="1" fill="#FDE047"/>
    <circle cx="11" cy="25" r="1" fill="#FDE047"/><circle cx="29" cy="25" r="1" fill="#FDE047"/>
    <path d="M12 21C13 18 15 16 16 16C15 19 16 22 17 23C18 20 20 17 20 14C22 17 23 20 24 22C24 19 26 17 27 16C26 21 24 24 21 25" stroke="#F59E0B" stroke-width="1.2" fill="none"/>
    <polygon points="20,15 23,19 20,24 17,19" fill="#EF4444"/>
    <polygon points="20,16 22,19 20,22 18,19" fill="#FECACA" opacity="0.85"/>
    <circle cx="20" cy="19" r="1" fill="#FFFFFF"/>
  </g>""",
        "amethyst": """<g>
    <rect x="3" y="5" width="30" height="24" rx="3" fill="#8B5CF6" opacity="0.3"/>
    <path d="M4 4H15V6H32V8H34V28H32V30H6V28H4V4Z" fill="#1E0E38"/>
    <path d="M8 6H29V10H8V6Z" fill="#F5F3FF"/>
    <path d="M9 7H28V8H9V7Z" fill="#DDD6FE"/>
    <path d="M7 10H33V27H31V29H9V27H7V10Z" fill="#6D28D9"/>
    <polygon points="8,11 11,11 8,14" fill="#C4B5FD"/><polygon points="32,11 29,11 32,14" fill="#C4B5FD"/>
    <polygon points="8,27 11,27 8,24" fill="#C4B5FD"/><polygon points="32,27 29,27 32,24" fill="#C4B5FD"/>
    <g transform="translate(2, 0)">
      <polygon points="18,12 21,17 18,25 15,17" fill="#8B5CF6"/>
      <polygon points="18,12 21,17 18,25" fill="#A78BFA"/>
      <polygon points="18,13 20,17 18,23" fill="#DDD6FE"/>
      <polygon points="14,16 16,18 14,23 12,19" fill="#7C3AED"/>
      <polygon points="22,16 24,19 22,23 20,18" fill="#C4B5FD"/>
    </g>
  </g>""",
        "cyber": """<g>
    <path d="M4 4H15V6H32V8H34V28H32V30H6V28H4V4Z" fill="#041824"/>
    <path d="M8 6H29V10H8V6Z" fill="#082F49"/>
    <path d="M9 7H28V8H9V7Z" fill="#0284C7"/>
    <path d="M7 10H33V27H31V29H9V27H7V10Z" fill="#1E293B"/>
    <path d="M9 15H14L17 18H23L26 15H31" stroke="#06B6D4" stroke-width="1.5" fill="none"/>
    <path d="M9 24H15L19 20H21L25 24H31" stroke="#22D3EE" stroke-width="1.2" fill="none"/>
    <path d="M12 12V15M28 12V15M17 18V26M23 18V26" stroke="#06B6D4" stroke-width="1" fill="none"/>
    <circle cx="12" cy="12" r="1.2" fill="#E0F2FE"/><circle cx="28" cy="12" r="1.2" fill="#E0F2FE"/>
    <circle cx="17" cy="26" r="1.2" fill="#E0F2FE"/><circle cx="23" cy="26" r="1.2" fill="#E0F2FE"/>
    <rect x="16" y="11" width="8" height="5" rx="1" fill="#334155" stroke="#06B6D4" stroke-width="1"/>
    <rect x="18" y="13" width="4" height="1.5" fill="#22D3EE"/>
  </g>""",
        "tech": """<g>
    <path d="M4 4H15V6H32V8H34V28H32V30H6V28H4V4Z" fill="#0B1120"/>
    <path d="M8 6H29V10H8V6Z" fill="#1E293B"/>
    <circle cx="11" cy="8" r="1" fill="#EF4444"/><circle cx="15" cy="8" r="1" fill="#FBBF24"/>
    <circle cx="19" cy="8" r="1" fill="#22C55E"/><circle cx="23" cy="8" r="1" fill="#38BDF8"/>
    <path d="M7 10H33V27H31V29H9V27H7V10Z" fill="#15803D"/>
    <path d="M10 13H15V18H10M25 13H30V18H25M10 24H14V21H17M23 21H26V24H30" stroke="#86EFAC" stroke-width="1" fill="none" opacity="0.65"/>
    <rect x="10" y="19" width="5" height="5" fill="#0F172A" stroke="#94A3B8" stroke-width="0.6"/>
    <rect x="25" y="19" width="5" height="5" fill="#0F172A" stroke="#94A3B8" stroke-width="0.6"/>
    <rect x="16" y="15" width="8" height="9" rx="1" fill="#94A3B8" stroke="#334155" stroke-width="1"/>
    <rect x="18" y="12" width="4" height="4" fill="none" stroke="#64748B" stroke-width="1.2"/>
    <circle cx="20" cy="18" r="1" fill="#0F172A"/><rect x="19.5" y="18" width="1" height="3" fill="#0F172A"/>
  </g>""",
        "glint": """<g>
    <path d="M4 4H15V6H32V8H34V28H32V30H6V28H4V4Z" fill="#1C1204"/>
    <path d="M8 6H29V10H8V6Z" fill="#E2E8F0"/>
    <path d="M9 7H28V8H9V7Z" fill="#FFFFFF"/>
    <path d="M7 10H33V27H31V29H9V27H7V10Z" fill="#D97706"/>
    <path d="M11 11L26 26H23L8 11H11ZM16 11L31 26H28L13 11H16ZM22 11L33 22V19L25 11H22Z" fill="#FEF08A" opacity="0.6"/>
    <g transform="translate(10, 12)"><polygon points="2,0 3,2 5,2 3,3 4,5 2,4 0,5 1,3 -1,2 1,2" fill="#FFFFFF"/></g>
    <g transform="translate(26, 22)"><polygon points="2,0 3,2 5,2 3,3 4,5 2,4 0,5 1,3 -1,2 1,2" fill="#FFFFFF"/></g>
  </g>""",
        "obsidian": """<g>
    <path d="M4 4H15V6H32V8H34V28H32V30H6V28H4V4Z" fill="#020617"/>
    <path d="M8 6H29V10H8V6Z" fill="#1E293B"/>
    <path d="M9 7H28V8H9V7Z" fill="#334155"/>
    <path d="M7 10H33V27H31V29H9V27H7V10Z" fill="#0F172A"/>
    <path d="M9 12H31L29 26H11L9 12Z" stroke="#475569" stroke-width="1" fill="#1E293B"/>
    <rect x="17" y="16" width="6" height="7" rx="1" fill="#020617" stroke="#94A3B8" stroke-width="1"/>
    <rect x="18" y="18" width="4" height="1" fill="#38BDF8"/><rect x="18" y="20" width="4" height="1" fill="#38BDF8"/>
  </g>""",
        "diamond": """<g>
    <path d="M4 4H15V6H32V8H34V28H32V30H6V28H4V4Z" fill="#082F49"/>
    <path d="M8 6H29V10H8V6Z" fill="#F0F9FF"/>
    <path d="M9 7H28V8H9V7Z" fill="#BAE6FD"/>
    <path d="M7 10H33V27H31V29H9V27H7V10Z" fill="#0284C7"/>
    <polygon points="20,12 28,18 20,27 12,18" fill="#38BDF8"/>
    <polygon points="20,12 28,18 20,18" fill="#BAE6FD"/>
    <polygon points="12,18 20,18 20,27" fill="#0EA5E9"/>
    <polygon points="20,18 28,18 20,27" fill="#7DD3FC"/>
    <polygon points="16,15 20,12 24,15 20,18" fill="#FFFFFF" opacity="0.9"/>
  </g>""",
        "floppy": """<g>
    <path d="M5 4H27L31 8V28H5V4Z" fill="#0F172A"/>
    <path d="M6 5H26L30 9V27H6V5Z" fill="#334155"/>
    <rect x="11" y="5" width="14" height="9" fill="#CBD5E1"/>
    <rect x="14" y="6" width="3" height="6" fill="#0F172A"/>
    <rect x="9" y="16" width="18" height="9" rx="1" fill="#F8FAFC"/>
    <rect x="11" y="18" width="14" height="1.5" fill="#EF4444"/>
    <rect x="11" y="20.5" width="14" height="1.5" fill="#3B82F6"/>
    <rect x="11" y="23" width="9" height="1" fill="#94A3B8"/>
  </g>""",
        "arcade": """<g>
    <path d="M4 4H15V6H32V8H34V28H32V30H6V28H4V4Z" fill="#1C1917"/>
    <path d="M8 6H29V10H8V6Z" fill="#FEFCE8"/>
    <path d="M7 10H33V27H31V29H9V27H7V10Z" fill="#EAB308"/>
    <rect x="9" y="12" width="22" height="15" fill="none" stroke="#CA8A04" stroke-width="1"/>
    <g transform="translate(14, 13)">
      <polygon points="6,0 8,4 12,5 9,8 10,12 6,10 2,12 3,8 0,5 4,4" fill="#FFFFFF"/>
      <polygon points="6,2 7,5 10,5 8,7 9,10 6,8 3,10 4,7 2,5 5,5" fill="#FACC15"/>
      <circle cx="5" cy="6" r="0.8" fill="#000000"/><circle cx="7" cy="6" r="0.8" fill="#000000"/>
    </g>
  </g>""",
        "sakura": """<g>
    <path d="M4 4H15V6H32V8H34V28H32V30H6V28H4V4Z" fill="#1C0A14"/>
    <path d="M8 6H29V10H8V6Z" fill="#FFF1F2"/>
    <path d="M9 7H28V8H9V7Z" fill="#FBCFE8"/>
    <path d="M7 10H33V27H31V29H9V27H7V10Z" fill="#BE185D"/>
    <path d="M9 19H31" stroke="#FDE047" stroke-width="1.5"/>
    <g transform="translate(16, 15)">
      <circle cx="4" cy="4" r="3" fill="#FCE7F3"/>
      <circle cx="4" cy="1" r="2" fill="#F472B6"/><circle cx="7" cy="4" r="2" fill="#F472B6"/>
      <circle cx="4" cy="7" r="2" fill="#F472B6"/><circle cx="1" cy="4" r="2" fill="#F472B6"/>
      <circle cx="4" cy="4" r="1.5" fill="#FEF08A"/>
    </g>
  </g>"""
    }

    for name, content in pixel_folders.items():
        assets[f"public/pixel-folders/{name}.svg"] = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 32" width="36" height="32" fill="none">
  {content}
</svg>"""

    # =========================================================================
    # 5. EXERCISE MOVEMENT ART (10 Patterns, dual theme friendly)
    # =========================================================================

    stroke_def = 'fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"'
    thin_def = 'fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" opacity="0.65"'
    muscle_def = 'fill="#FF5252" opacity="0.85"'
    bar_template = """<g>
      <line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>
      <rect x="{cx1_1}" y="{cy1_1}" width="6" height="30" rx="2.5" fill="currentColor"/>
      <rect x="{cx1_2}" y="{cy1_2}" width="6" height="22" rx="2.5" fill="currentColor"/>
      <rect x="{cx2_1}" y="{cy2_1}" width="6" height="30" rx="2.5" fill="currentColor"/>
      <rect x="{cx2_2}" y="{cy2_2}" width="6" height="22" rx="2.5" fill="currentColor"/>
    </g>"""

    def make_bar(x1, y1, x2, y2):
        return bar_template.format(
            x1=x1, y1=y1, x2=x2, y2=y2,
            cx1_1=x1-8, cy1_1=y1-15, cx1_2=x1-16, cy1_2=y1-11,
            cx2_1=x2+2, cy2_1=y2-15, cx2_2=x2+10, cy2_2=y2-11
        )

    exercises = {
        "bench": f"""<g>
    <rect x="52" y="96" width="118" height="13" rx="6" fill="currentColor" opacity="0.25"/>
    <path d="M74 109v22M150 109v22" {thin_def}/>
    <circle cx="60" cy="82" r="13" {stroke_def}/>
    <path d="M74 90h62" {stroke_def}/>
    <path d="M84 78c14-9 32-9 44 0 5 4 5 12 0 16-14 8-30 8-44 0-5-4-5-12 0-16z" {muscle_def}/>
    <path d="M88 90c14 6 30 6 44 0" {thin_def}/>
    <path d="M92 88 90 56M132 88l2-32" {stroke_def}/>
    <path d="M136 92l26 6 6 26" {stroke_def}/>
    {make_bar(62, 50, 162, 50)}
  </g>""",
        "incline": f"""<g>
    <path d="M56 122 158 78" stroke="currentColor" stroke-width="13" stroke-linecap="round" fill="none" opacity="0.25"/>
    <path d="M70 126v14M144 100v40" {thin_def}/>
    <circle cx="150" cy="70" r="13" {stroke_def}/>
    <path d="M138 78 84 104" {stroke_def}/>
    <path d="M118 72c9-13 25-19 36-14 6 3 7 11 2 17-10 12-25 17-34 12-5-3-6-10-4-15z" {muscle_def}/>
    <path d="M76 108l-14 16" {stroke_def}/>
    <path d="M128 84 118 52M110 92 102 58" {stroke_def}/>
    {make_bar(72, 46, 158, 46)}
  </g>""",
        "ohp": f"""<g>
    <circle cx="110" cy="66" r="13" {stroke_def}/>
    <path d="M110 79v38" {stroke_def}/>
    <path d="M92 84c0-8 6-13 13-13s13 5 13 13-6 12-13 12-13-4-13-12z" {muscle_def}/>
    <path d="M96 84 84 50M124 84l12-34" {stroke_def}/>
    <path d="M110 117l-14 30M110 117l14 30" {stroke_def}/>
    {make_bar(64, 42, 156, 42)}
    <path d="M78 150h64" {thin_def}/>
  </g>""",
        "row": f"""<g>
    <circle cx="54" cy="70" r="12" {stroke_def}/>
    <path d="M66 76 128 92" {stroke_def}/>
    <path d="M84 74c16-4 32 0 42 10 4 4 2 11-4 12-16 3-32-1-40-9-4-4-3-11 2-13z" {muscle_def}/>
    <path d="M128 92l6 32M128 92l-4 34" {stroke_def}/>
    <path d="M92 84 88 116" {stroke_def}/>
    {make_bar(48, 120, 130, 120)}
    <path d="M66 150h72" {thin_def}/>
  </g>""",
        "pull": f"""<g>
    <path d="M40 30h140" stroke="currentColor" stroke-width="6" stroke-linecap="round" fill="none"/>
    <circle cx="110" cy="72" r="13" {stroke_def}/>
    <path d="M88 88c14-8 30-8 44 0 5 3 6 11 1 15-15 8-31 8-46 0-5-4-4-12 1-15z" {muscle_def}/>
    <path d="M110 85v32" {stroke_def}/>
    <path d="M98 84 84 34M122 84l14-50" {stroke_def}/>
    <path d="M110 117l-16 26M110 117l16 26" {stroke_def}/>
  </g>""",
        "squat": f"""<g>
    <circle cx="110" cy="56" r="12" {stroke_def}/>
    <path d="M110 68v30" {stroke_def}/>
    <path d="M92 116c12-6 24-6 36 0 5 3 6 12 2 18-11 8-29 8-40 0-4-6-3-15 2-18z" {muscle_def}/>
    <path d="M110 98l-18 22 4 28M110 98l18 22-4 28" {stroke_def}/>
    <path d="M96 148h-12M124 148h12" {thin_def}/>
    {make_bar(62, 74, 158, 74)}
  </g>""",
        "hinge": f"""<g>
    <circle cx="60" cy="62" r="12" {stroke_def}/>
    <path d="M72 68 126 84" {stroke_def}/>
    <path d="M92 104c14-6 28-4 36 6 4 5 1 13-6 14-14 2-28-3-33-9-3-5-1-9 3-11z" {muscle_def}/>
    <path d="M126 84l6 34-4 30" {stroke_def}/>
    <path d="M92 78v42" {stroke_def}/>
    {make_bar(52, 124, 134, 124)}
    <path d="M70 150h74" {thin_def}/>
  </g>""",
        "curl": f"""<g>
    <circle cx="110" cy="54" r="12" {stroke_def}/>
    <path d="M110 66v40" {stroke_def}/>
    <path d="M84 84c7-4 15-2 18 5 2 6-2 12-9 13s-13-3-13-9c0-4 2-7 4-9z" {muscle_def}/>
    <path d="M98 74 84 92l20 12M122 74l14 18-20 12" {stroke_def}/>
    <path d="M110 106l-12 40M110 106l12 40" {stroke_def}/>
    {make_bar(70, 106, 150, 106)}
  </g>""",
        "core": f"""<g>
    <path d="M34 132h152" stroke="currentColor" stroke-width="9" stroke-linecap="round" fill="none" opacity="0.25"/>
    <circle cx="74" cy="76" r="12" {stroke_def}/>
    <path d="M84 84 118 106" {stroke_def}/>
    <path d="M92 96c12-4 24 0 30 9 3 5-1 11-7 11-12 0-23-4-27-10-2-4 0-8 4-10z" {muscle_def}/>
    <path d="M118 106l30-6 8 26" {stroke_def}/>
    <path d="M86 88 96 104" {thin_def}/>
  </g>""",
        "cardio": f"""<g>
    <circle cx="118" cy="46" r="12" {stroke_def}/>
    <path d="M116 58 106 96" {stroke_def}/>
    <path d="M92 112c10-5 21-3 26 5 3 5 0 12-6 13-11 2-22-3-25-8-2-4 1-8 5-10z" {muscle_def}/>
    <path d="M108 70l22 10M112 76 84 88" {stroke_def}/>
    <path d="M106 96l22 18 4 30M106 96 78 112l-16 22" {stroke_def}/>
    <path d="M34 148h152" {thin_def}/>
    <path d="M52 60h26M44 78h20" stroke="currentColor" stroke-width="3" stroke-linecap="round" opacity="0.35" fill="none"/>
  </g>"""
    }

    for name, content in exercises.items():
        assets[f"public/exercise-art/{name}.svg"] = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 160" width="220" height="160" fill="none" role="img">
  {content}
</svg>"""

    # =========================================================================
    # 6. TIER ACHIEVEMENTS & RANK CRESTS (9 Tiers)
    # =========================================================================

    tiers = {
        "bronze": ("#CD7F32", """<path d="M32 4 L56 16 V36 C56 48 32 60 32 60 C32 60 8 48 8 36 V16 Z" fill="#211F2C" stroke="#CD7F32" stroke-width="2"/>
    <path d="M32 12 L48 22 V36 C48 45 32 53 32 53 C32 53 16 45 16 36 V22 Z" fill="#CD7F32" opacity="0.9"/>
    <circle cx="24" cy="20" r="2" fill="#FFFFFF" opacity="0.8"/>"""),
        "silver": ("#94A3B8", """<path d="M32 4 L56 16 V36 C56 48 32 60 32 60 C32 60 8 48 8 36 V16 Z" fill="#211F2C" stroke="#94A3B8" stroke-width="2"/>
    <polygon points="32,10 50,28 32,46 14,28" fill="#94A3B8"/>
    <circle cx="32" cy="28" r="6" fill="#FFFFFF" opacity="0.85"/>
    <circle cx="24" cy="20" r="2" fill="#FFFFFF" opacity="0.8"/>"""),
        "gold": ("#FFC24B", """<path d="M32 4 L56 16 V36 C56 48 32 60 32 60 C32 60 8 48 8 36 V16 Z" fill="#211F2C" stroke="#FFC24B" stroke-width="2"/>
    <polygon points="32,8 52,24 44,48 20,48 12,24" fill="#D97706"/>
    <polygon points="32,14 45,26 40,42 24,42 19,26" fill="#FFC24B"/>
    <circle cx="32" cy="28" r="5" fill="#FFFFFF"/>
    <circle cx="24" cy="20" r="2" fill="#FFFFFF" opacity="0.8"/>"""),
        "platinum": ("#34D9A0", """<path d="M32 4 L56 16 V36 C56 48 32 60 32 60 C32 60 8 48 8 36 V16 Z" fill="#211F2C" stroke="#34D9A0" stroke-width="2"/>
    <polygon points="32,6 54,20 46,50 18,50 10,20" fill="#047857"/>
    <path d="M32 12 L46 22 L32 44 L18 22 Z" fill="#34D9A0" opacity="0.95"/>
    <circle cx="32" cy="24" r="3" fill="#FFFFFF"/>
    <circle cx="24" cy="20" r="2" fill="#FFFFFF" opacity="0.8"/>"""),
        "diamond": ("#38BDF8", """<path d="M32 4 L56 16 V36 C56 48 32 60 32 60 C32 60 8 48 8 36 V16 Z" fill="#211F2C" stroke="#38BDF8" stroke-width="2"/>
    <polygon points="32,6 56,24 32,56 8,24" fill="#0284C7"/>
    <polygon points="32,14 46,26 32,48 18,26" fill="#E0F7FA" opacity="0.9"/>
    <line x1="8" y1="24" x2="56" y2="24" stroke="#FFFFFF" stroke-width="1.5"/>
    <line x1="32" y1="6" x2="32" y2="56" stroke="#FFFFFF" stroke-width="1.5"/>
    <circle cx="24" cy="20" r="2" fill="#FFFFFF" opacity="0.8"/>"""),
        "grandmaster": ("#FF6B6B", """<path d="M32 4 L56 16 V36 C56 48 32 60 32 60 C32 60 8 48 8 36 V16 Z" fill="#211F2C" stroke="#FF6B6B" stroke-width="2"/>
    <path d="M32 6 L56 16 L48 42 L32 56 L16 42 L8 16 Z" fill="#991B1B"/>
    <polygon points="32,12 48,24 40,42 24,42 16,24" fill="#FF6B6B"/>
    <path d="M6 14 L14 26 L4 32 Z" fill="#FF6B6B"/><path d="M58 14 L50 26 L60 32 Z" fill="#FF6B6B"/>
    <circle cx="32" cy="28" r="4" fill="#FFFFFF"/>"""),
        "celestial": ("#B07CFF", """<path d="M32 4 L56 16 V36 C56 48 32 60 32 60 C32 60 8 48 8 36 V16 Z" fill="#211F2C" stroke="#B07CFF" stroke-width="2"/>
    <circle cx="32" cy="32" r="22" fill="#6D28D9"/>
    <polygon points="32,10 36,26 52,26 39,36 44,52 32,42 20,52 25,36 12,26 28,26" fill="#FFFFFF"/>
    <ellipse cx="32" cy="32" rx="26" ry="10" fill="none" stroke="#FFFFFF" stroke-width="1.5" transform="rotate(-25 32 32)"/>"""),
        "eternity": ("#38D6F2", """<path d="M32 4 L56 16 V36 C56 48 32 60 32 60 C32 60 8 48 8 36 V16 Z" fill="#211F2C" stroke="#38D6F2" stroke-width="2"/>
    <circle cx="32" cy="32" r="24" fill="#0E7490"/>
    <path d="M24 32 C18 24 12 28 12 32 C12 36 18 40 24 32 C30 24 36 24 42 28 C46 32 46 36 42 36 C36 40 30 40 24 32 Z" fill="none" stroke="#FFFFFF" stroke-width="3.5" stroke-linecap="round"/>"""),
        "one-above-all": ("#FF6FA8", """<path d="M32 4 L56 16 V36 C56 48 32 60 32 60 C32 60 8 48 8 36 V16 Z" fill="#211F2C" stroke="#FF6FA8" stroke-width="2"/>
    <polygon points="32,4 58,18 52,50 32,60 12,50 6,18" fill="#BE185D"/>
    <polygon points="32,10 50,22 45,46 32,54 19,46 14,22" fill="#FF6FA8"/>
    <polygon points="32,16 44,25 40,40 32,46 24,40 20,25" fill="#FFC24B"/>
    <circle cx="32" cy="8" r="3" fill="#FFFFFF"/><circle cx="16" cy="14" r="2.5" fill="#FFFFFF"/><circle cx="48" cy="14" r="2.5" fill="#FFFFFF"/>""")
    }

    for name, (hue, content) in tiers.items():
        assets[f"public/tiers/{name}.svg"] = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" fill="none">
  {content}
</svg>"""

    # =========================================================================
    # 7. CASINO & MERRAMUN GAME SYMBOLS (10 Assets)
    # =========================================================================

    casino_symbols = {
        "ankh": """<defs>
    <linearGradient id="ankhGold" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFF2A8"/><stop offset="40%" stop-color="#F59E0B"/><stop offset="100%" stop-color="#92400E"/>
    </linearGradient>
    <radialGradient id="ruby" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#FF6B6B"/><stop offset="100%" stop-color="#991B1B"/>
    </radialGradient>
  </defs>
  <ellipse cx="32" cy="18" rx="11" ry="13" stroke="url(#ankhGold)" stroke-width="5.5" fill="none"/>
  <path d="M 12 33 Q 32 31 52 33 L 52 38 Q 32 36 12 38 Z" fill="url(#ankhGold)"/>
  <path d="M 28 34 L 28 58 Q 32 60 36 58 L 36 34 Z" fill="url(#ankhGold)"/>
  <circle cx="32" cy="35" r="3.5" fill="url(#ruby)" stroke="#78350F" stroke-width="1"/>
  <circle cx="31" cy="34" r="1" fill="#FFFFFF"/>""",
        "cobra": """<defs>
    <linearGradient id="cobraBlue" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#E0F2FE"/><stop offset="40%" stop-color="#38BDF8"/><stop offset="100%" stop-color="#0369A1"/>
    </linearGradient>
  </defs>
  <path d="M 40 16 Q 48 20 44 28 Q 38 36 44 44 Q 48 50 38 54 Q 26 56 22 48 Q 20 40 28 34 Q 34 30 32 24 Q 30 18 36 14 Q 42 10 44 14" stroke="url(#cobraBlue)" stroke-width="6" stroke-linecap="round" fill="none"/>
  <path d="M 32 16 Q 26 12 36 8 Q 46 12 40 16 Q 44 20 36 22 Q 28 20 32 16 Z" fill="url(#cobraBlue)"/>
  <circle cx="38" cy="11" r="1.5" fill="#FFFFFF"/>
  <path d="M 30 40 Q 34 38 38 40" stroke="#7DD3FC" stroke-width="2" fill="none"/>
  <path d="M 28 46 Q 34 44 40 46" stroke="#7DD3FC" stroke-width="2" fill="none"/>""",
        "eye": """<defs>
    <linearGradient id="eyeBronze" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FDE68A"/><stop offset="50%" stop-color="#D97706"/><stop offset="100%" stop-color="#78350F"/>
    </linearGradient>
  </defs>
  <path d="M 12 30 Q 32 14 52 30 Q 32 46 12 30 Z" stroke="url(#eyeBronze)" stroke-width="4.5" fill="#0A0F1D"/>
  <circle cx="32" cy="30" r="7" fill="url(#eyeBronze)"/>
  <circle cx="32" cy="30" r="3.5" fill="#020617"/>
  <circle cx="30" cy="28" r="1.2" fill="#FFFFFF"/>
  <path d="M 32 37 L 32 52 Q 28 54 26 48 L 28 37" fill="url(#eyeBronze)"/>
  <path d="M 44 34 Q 48 44 54 44 Q 50 48 42 40" stroke="url(#eyeBronze)" stroke-width="3" fill="none"/>""",
        "skull": """<defs>
    <linearGradient id="skullRed" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FCA5A5"/><stop offset="35%" stop-color="#DC2626"/><stop offset="100%" stop-color="#7F1D1D"/>
    </linearGradient>
  </defs>
  <path d="M 16 28 Q 16 12 32 12 Q 48 12 48 28 Q 48 38 42 42 L 42 50 Q 32 54 22 50 L 22 42 Q 16 38 16 28 Z" fill="url(#skullRed)"/>
  <ellipse cx="25" cy="28" rx="5" ry="6.5" fill="#0A0000"/><ellipse cx="39" cy="28" rx="5" ry="6.5" fill="#0A0000"/>
  <polygon points="32,34 29,40 35,40" fill="#0A0000"/>
  <line x1="26" y1="46" x2="26" y2="50" stroke="#0A0000" stroke-width="2"/>
  <line x1="30" y1="46" x2="30" y2="51" stroke="#0A0000" stroke-width="2"/>
  <line x1="34" y1="46" x2="34" y2="51" stroke="#0A0000" stroke-width="2"/>
  <line x1="38" y1="46" x2="38" y2="50" stroke="#0A0000" stroke-width="2"/>""",
        "urn": """<defs>
    <linearGradient id="urnGold" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FEF08A"/><stop offset="50%" stop-color="#CA8A04"/><stop offset="100%" stop-color="#713F12"/>
    </linearGradient>
  </defs>
  <ellipse cx="32" cy="14" rx="10" ry="3.5" fill="url(#urnGold)"/>
  <rect x="26" y="16" width="12" height="4" fill="url(#urnGold)"/>
  <path d="M 24 20 Q 14 30 18 42 Q 22 52 32 54 Q 42 52 46 42 Q 50 30 40 20 Z" fill="url(#urnGold)"/>
  <path d="M 20 24 Q 10 32 20 38" stroke="url(#urnGold)" stroke-width="3" fill="none"/>
  <path d="M 44 24 Q 54 32 44 38" stroke="url(#urnGold)" stroke-width="3" fill="none"/>
  <path d="M 22 34 Q 32 37 42 34" stroke="#713F12" stroke-width="2" fill="none"/>
  <ellipse cx="32" cy="54" rx="8" ry="2.5" fill="url(#urnGold)"/>""",
        "scroll": """<defs>
    <linearGradient id="scrollPaper" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FEF3C7"/><stop offset="50%" stop-color="#FDE68A"/><stop offset="100%" stop-color="#D97706"/>
    </linearGradient>
  </defs>
  <g transform="rotate(-30 32 32)">
    <rect x="18" y="24" width="28" height="16" rx="4" fill="url(#scrollPaper)"/>
    <ellipse cx="18" cy="32" rx="3.5" ry="8" fill="#B45309"/>
    <ellipse cx="46" cy="32" rx="3.5" ry="8" fill="url(#scrollPaper)"/>
    <rect x="30" y="24" width="4" height="16" fill="#DC2626"/>
  </g>""",
        "bastet": """<defs>
    <linearGradient id="bastetGlow" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#93C5FD"/><stop offset="40%" stop-color="#3B82F6"/><stop offset="100%" stop-color="#1E3A8A"/>
    </linearGradient>
  </defs>
  <polygon points="20,24 24,10 29,20" fill="url(#bastetGlow)"/><polygon points="44,24 40,10 35,20" fill="url(#bastetGlow)"/>
  <ellipse cx="32" cy="22" rx="10" ry="9" fill="url(#bastetGlow)"/>
  <path d="M 26 28 Q 22 42 20 54 Q 32 58 44 54 Q 42 42 38 28 Z" fill="url(#bastetGlow)"/>
  <path d="M 42 52 Q 52 46 50 36 Q 48 30 44 32" stroke="url(#bastetGlow)" stroke-width="4" stroke-linecap="round" fill="none"/>
  <path d="M 26 29 Q 32 32 38 29" stroke="#FDE047" stroke-width="2.5" fill="none"/>
  <circle cx="28" cy="20" r="1.5" fill="#FFFFFF"/><circle cx="36" cy="20" r="1.5" fill="#FFFFFF"/>""",
        "anubis": """<defs>
    <linearGradient id="anubisDark" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#A5B4FC"/><stop offset="40%" stop-color="#6366F1"/><stop offset="100%" stop-color="#1E1B4B"/>
    </linearGradient>
  </defs>
  <path d="M 18 24 L 20 6 Q 26 10 28 22 Z" fill="url(#anubisDark)"/><path d="M 46 24 L 44 6 Q 38 10 36 22 Z" fill="url(#anubisDark)"/>
  <path d="M 24 22 L 32 18 L 40 22 L 38 34 L 46 36 L 46 40 L 34 44 L 28 38 Z" fill="url(#anubisDark)"/>
  <path d="M 28 14 Q 32 8 36 14 Q 38 6 42 12" stroke="#38BDF8" stroke-width="2" fill="none"/>
  <path d="M 20 42 Q 32 50 44 42 L 48 54 Q 32 60 16 54 Z" fill="url(#anubisDark)" stroke="#F59E0B" stroke-width="1.5"/>
  <polygon points="34,26 38,28 34,30" fill="#38BDF8"/><circle cx="36" cy="28" r="0.8" fill="#FFFFFF"/>""",
        "scatter": """<defs>
    <linearGradient id="moonGold" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF"/><stop offset="30%" stop-color="#FEF08A"/><stop offset="70%" stop-color="#EAB308"/><stop offset="100%" stop-color="#854D0E"/>
    </linearGradient>
  </defs>
  <circle cx="32" cy="32" r="26" stroke="#FDE047" stroke-width="2" stroke-dasharray="4 2" opacity="0.7"/>
  <path d="M 34 10 A 22 22 0 1 0 46 46 A 17 17 0 1 1 34 10 Z" fill="url(#moonGold)" stroke="#CA8A04" stroke-width="1.5"/>
  <polygon points="38,26 40,22 42,26 46,28 42,30 40,34 38,30 34,28" fill="#FFFFFF"/>"""
    }

    for name, content in casino_symbols.items():
        assets[f"public/casino/{name}.svg"] = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" fill="none">
  {content}
</svg>"""

    # Gator Gus Avatar
    assets["public/casino/gator-gus.svg"] = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 180" width="200" height="180" fill="none">
  <defs>
    <linearGradient id="gatorSkin" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#14532D"/><stop offset="45%" stop-color="#166534"/><stop offset="100%" stop-color="#0F3D20"/>
    </linearGradient>
    <linearGradient id="gatorHat" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1E293B"/><stop offset="100%" stop-color="#0F172A"/>
    </linearGradient>
    <linearGradient id="gatorGold" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FDE047"/><stop offset="50%" stop-color="#F59E0B"/><stop offset="100%" stop-color="#B45309"/>
    </linearGradient>
  </defs>
  <!-- Shoulders & Tuxedo Collar -->
  <path d="M 50 145 Q 100 170 150 145 L 160 180 Q 100 195 40 180 Z" fill="#090D14"/>
  <path d="M 72 148 L 100 166 L 128 148 L 100 138 Z" fill="#F8FAFC"/>
  <!-- Velvet Bow Tie -->
  <polygon points="80,150 100,158 80,166" fill="#DC2626"/><polygon points="120,150 100,158 120,166" fill="#DC2626"/><circle cx="100" cy="158" r="4.5" fill="#991B1B"/>
  <!-- Head Base -->
  <ellipse cx="100" cy="98" rx="54" ry="44" fill="url(#gatorSkin)" stroke="#052E16" stroke-width="2.5"/>
  <!-- Snout -->
  <path d="M 48 92 Q 100 78 152 92 Q 176 112 166 128 Q 100 148 34 128 Q 24 112 48 92 Z" fill="url(#gatorSkin)" stroke="#052E16" stroke-width="3"/>
  <!-- Nostrils -->
  <ellipse cx="82" cy="94" rx="4" ry="3" fill="#021A0C"/><ellipse cx="118" cy="94" rx="4" ry="3" fill="#021A0C"/>
  <!-- Teeth & 24K Gold Tooth -->
  <polygon points="56,120 62,111 68,120" fill="#FFFFFF"/><polygon points="74,123 80,113 86,123" fill="#FFFFFF"/>
  <polygon points="94,125 100,114 106,125" fill="url(#gatorGold)" stroke="#78350F" stroke-width="0.5"/>
  <polygon points="114,123 120,113 126,123" fill="#FFFFFF"/><polygon points="132,120 138,111 144,120" fill="#FFFFFF"/>
  <!-- Eyes -->
  <ellipse cx="70" cy="68" rx="19" ry="17" fill="url(#gatorSkin)" stroke="#052E16" stroke-width="2.5"/><ellipse cx="130" cy="68" rx="19" ry="17" fill="url(#gatorSkin)" stroke="#052E16" stroke-width="2.5"/>
  <circle cx="70" cy="68" r="12" fill="#FACC15"/><circle cx="130" cy="68" r="12" fill="#FACC15"/>
  <ellipse cx="70" cy="68" rx="3.2" ry="10" fill="#0A0912"/><ellipse cx="130" cy="68" rx="3.2" ry="10" fill="#0A0912"/>
  <circle cx="68" cy="63" r="2.8" fill="#FFFFFF"/><circle cx="128" cy="63" r="2.8" fill="#FFFFFF"/>
  <!-- Fedora Hat -->
  <ellipse cx="100" cy="48" rx="52" ry="11" fill="url(#gatorHat)" stroke="#020617" stroke-width="1.5"/>
  <path d="M 66 46 L 72 12 Q 100 10 128 12 L 134 46 Z" fill="url(#gatorHat)" stroke="#020617" stroke-width="1.5"/>
  <path d="M 69 43 L 71 34 Q 100 32 129 34 L 131 43 Z" fill="url(#gatorGold)"/>
  <g transform="rotate(14 118 18)">
    <rect x="118" y="18" width="13" height="19" rx="2.5" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="0.8"/>
    <text x="120" y="31" font-size="8.5" font-weight="900" fill="#DC2626">A♥</text>
  </g>
</svg>"""

    # Write all assets
    total_bytes = 0
    for path, content in assets.items():
        with open(path, "w", encoding="utf-8") as f:
            f.write(content.strip() + "\n")
        size = os.path.getsize(path)
        total_bytes += size
        print(f"Wrote {path} ({size} bytes)")

    print(f"\nSuccessfully created {len(assets)} assets. Total added weight: {total_bytes} bytes ({total_bytes / 1024:.2f} KB).")

if __name__ == "__main__":
    create_all_assets()
