import os
import subprocess
import struct
import zlib

# Colors for pixel bird
PALETTE = {
    'B': (24, 24, 27, 255),       # Black outline #18181B
    'P': (192, 132, 252, 255),    # Lilac base #C084FC
    'L': (233, 213, 255, 255),    # Light Lilac highlight #E9D5FF
    'D': (147, 51, 234, 255),     # Deep purple shadow #9333EA
    'O': (251, 146, 60, 255),     # Orange beak #FB923C
    'H': (253, 186, 116, 255),    # Beak highlight #FDBA74
    'E': (24, 24, 27, 255),       # Eye black #18181B
    'W': (255, 255, 255, 255),    # Eye white #FFFFFF
    'F': (24, 24, 27, 255),       # Feet #18181B
    '.': (0, 0, 0, 0),            # Transparent
}

BIRD_GRID = [
    "........................",
    ".....BBB................",
    "....BLLLB...............",
    "....BPPPB...............",
    "....BPPPB...............",
    "....BPPPB...............",
    "....BPPPB...BBBB........",
    "....BPPPB..BLLLLB.......",
    "....BPPPBBBLPPPLB.......",
    "...BPPPPPPPPPPLPB.......",
    "..BLLPPPPPPWPPPLB.......",
    ".BLPPPPPPEPPEEEPB.BBB...",
    ".BPPPPPPPEEPEEEPBBOOOB..",
    "BBPPDPPPPPPPPPPLBBOOOB..",
    ".BPPPPLLLLLLLPPLB.BBB...",
    "..BPPPLLLLLLLLPPB.......",
    ".BDPPPLLLLLLLLPB........",
    ".BDPPPDDDDDDDDPB........",
    "..BDPPPPPPPPPPB.........",
    "...BBBBBBBBBBB..........",
    ".....FF....FF...........",
    ".....FF....FF...........",
    "....FFFF..FFFF..........",
    "........................",
]

def save_png(filename, width, height, rgba_data):
    raw_bytes = bytearray()
    for y in range(height):
        raw_bytes.append(0)  # Filter type 0
        start = y * width * 4
        raw_bytes.extend(rgba_data[start:start + width * 4])
    
    compressed = zlib.compress(bytes(raw_bytes), level=9)
    
    def chunk(chunk_type, data):
        c = chunk_type + data
        crc = zlib.crc32(c) & 0xffffffff
        return struct.pack('>I', len(data)) + c + struct.pack('>I', crc)
    
    png = bytearray(b'\x89PNG\r\n\x1a\n')
    # IHDR
    png.extend(chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)))
    # IDAT
    png.extend(chunk(b'IDAT', compressed))
    # IEND
    png.extend(chunk(b'IEND', b''))
    
    with open(filename, 'wb') as f:
        f.write(png)
    print(f"Generated: {filename} ({width}x{height})")

def generate_pixel_bird_png(scale=32):
    grid_h = len(BIRD_GRID)
    grid_w = len(BIRD_GRID[0])
    w = grid_w * scale
    h = grid_h * scale
    
    rgba = bytearray(w * h * 4)
    for gy in range(grid_h):
        for gx in range(grid_w):
            char = BIRD_GRID[gy][gx]
            color = PALETTE.get(char, (0, 0, 0, 0))
            for py in range(scale):
                for px in range(scale):
                    dest_y = gy * scale + py
                    dest_x = gx * scale + px
                    idx = (dest_y * w + dest_x) * 4
                    rgba[idx:idx+4] = bytes(color)
    
    save_png("public/basedly-bird.png", w, h, rgba)

def generate_html_snapshots():
    edge_paths = [
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    ]
    edge = next((p for p in edge_paths if os.path.exists(p)), None)
    if not edge:
        print("Edge binary not found for headless rasterization.")
        return

    # 1. Logo lockup HTML
    logo_html = """<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: transparent;
    display: inline-flex;
    align-items: center;
    justify-content: flex-start;
    padding: 32px 48px;
    font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif;
  }
  .lockup {
    display: flex;
    align-items: center;
    gap: 28px;
  }
  .bird {
    width: 120px;
    height: 120px;
    image-rendering: pixelated;
  }
  .text {
    font-size: 96px;
    font-weight: 800;
    letter-spacing: -0.04em;
    color: #FFFFFF;
    line-height: 1;
  }
</style>
</head>
<body>
  <div class="lockup">
    <img src="../public/basedly-bird.svg" class="bird" />
    <span class="text">basedly</span>
  </div>
</body>
</html>"""
    with open("scripts/logo_render.html", "w", encoding="utf-8") as f:
        f.write(logo_html)

    # 2. Wordmark only HTML
    wordmark_html = """<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: transparent;
    display: inline-flex;
    align-items: center;
    justify-content: flex-start;
    padding: 32px 48px;
    font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif;
  }
  .text {
    font-size: 96px;
    font-weight: 800;
    letter-spacing: -0.04em;
    color: #FFFFFF;
    line-height: 1;
  }
</style>
</head>
<body>
  <span class="text">basedly</span>
</body>
</html>"""
    with open("scripts/wordmark_render.html", "w", encoding="utf-8") as f:
        f.write(wordmark_html)

    # 3. App icon HTML
    app_icon_html = """<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: transparent;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 512px;
    height: 512px;
  }
  .icon-box {
    width: 512px;
    height: 512px;
    border-radius: 112px;
    background: #0A0912;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }
  .bird {
    width: 360px;
    height: 360px;
    image-rendering: pixelated;
  }
</style>
</head>
<body>
  <div class="icon-box">
    <img src="../public/basedly-bird.svg" class="bird" />
  </div>
</body>
</html>"""
    with open("scripts/app_icon_render.html", "w", encoding="utf-8") as f:
        f.write(app_icon_html)

    # Run Edge headless screenshot
    cwd = os.path.abspath(os.getcwd())
    
    # Render basedly-logo.png
    cmd_logo = [
        edge,
        "--headless",
        "--disable-gpu",
        "--hide-scrollbars",
        "--default-background-color=00000000",
        "--window-size=920,200",
        f"--screenshot={os.path.join(cwd, 'public', 'basedly-logo.png')}",
        f"file:///{os.path.join(cwd, 'scripts', 'logo_render.html')}"
    ]
    subprocess.run(cmd_logo, check=False)
    print("Rendered: public/basedly-logo.png via headless engine")

    # Render basedly-wordmark.png
    cmd_wordmark = [
        edge,
        "--headless",
        "--disable-gpu",
        "--hide-scrollbars",
        "--default-background-color=00000000",
        "--window-size=600,180",
        f"--screenshot={os.path.join(cwd, 'public', 'basedly-wordmark.png')}",
        f"file:///{os.path.join(cwd, 'scripts', 'wordmark_render.html')}"
    ]
    subprocess.run(cmd_wordmark, check=False)
    print("Rendered: public/basedly-wordmark.png via headless engine")

    # Render basedly-app-icon.png
    cmd_icon = [
        edge,
        "--headless",
        "--disable-gpu",
        "--hide-scrollbars",
        "--default-background-color=00000000",
        "--window-size=512,512",
        f"--screenshot={os.path.join(cwd, 'public', 'basedly-app-icon.png')}",
        f"file:///{os.path.join(cwd, 'scripts', 'app_icon_render.html')}"
    ]
    subprocess.run(cmd_icon, check=False)
    print("Rendered: public/basedly-app-icon.png via headless engine")

if __name__ == "__main__":
    generate_pixel_bird_png(scale=32)
    generate_html_snapshots()
