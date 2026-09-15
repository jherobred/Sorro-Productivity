#!/usr/bin/env python3
"""
Generate Basedly app icons across Web, PWA, and Android Capacitor builds.
Source: User-provided app icon artwork.
"""

import os
import base64
from io import BytesIO
from PIL import Image, ImageDraw

def main():
    root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    src_path = r"C:\Users\J30N\.gemini\antigravity\brain\3ee270e7-fdd1-42ba-a3f2-67b9808033e1\.user_uploaded\media_1789434484580.png"
    
    if not os.path.exists(src_path):
        raise FileNotFoundError(f"Source image not found: {src_path}")
    
    src = Image.open(src_path).convert("RGBA")
    print(f"Loaded source image: {src.size}")

    def create_squircle(im, size, rx_ratio=0.22):
        res = im.resize((size, size), Image.Resampling.LANCZOS)
        mask = Image.new("L", (size * 4, size * 4), 0)
        draw = ImageDraw.Draw(mask)
        rx = int(size * rx_ratio * 4)
        draw.rounded_rectangle((0, 0, size * 4, size * 4), radius=rx, fill=255)
        mask = mask.resize((size, size), Image.Resampling.LANCZOS)
        res.putalpha(mask)
        return res

    def create_circle(im, size):
        res = im.resize((size, size), Image.Resampling.LANCZOS)
        mask = Image.new("L", (size * 4, size * 4), 0)
        draw = ImageDraw.Draw(mask)
        draw.ellipse((0, 0, size * 4, size * 4), fill=255)
        mask = mask.resize((size, size), Image.Resampling.LANCZOS)
        res.putalpha(mask)
        return res

    def create_adaptive_foreground(im, canvas_size):
        # 70% scale centered inside 108dp canvas
        art_size = int(canvas_size * 0.70)
        art = create_squircle(im, art_size, rx_ratio=0.22)
        canvas = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
        offset = (canvas_size - art_size) // 2
        canvas.paste(art, (offset, offset), art)
        return canvas

    # 1. Generate public/basedly-app-icon.png (512x512 squircle)
    app_icon_512 = create_squircle(src, 512, rx_ratio=0.22)
    public_app_icon_path = os.path.join(root_dir, "public", "basedly-app-icon.png")
    app_icon_512.save(public_app_icon_path, "PNG")
    print(f"Saved {public_app_icon_path}")

    # Also save raw 512x512 full bleed PNG to public/icon.png if needed
    raw_512 = src.resize((512, 512), Image.Resampling.LANCZOS)
    raw_512.save(os.path.join(root_dir, "public", "icon.png"), "PNG")
    print("Saved public/icon.png")

    # 2. Generate public/icon.svg embedding 512x512 PNG with squircle clipPath
    buf = BytesIO()
    raw_512.save(buf, "PNG")
    b64_512 = base64.b64encode(buf.getvalue()).decode("utf-8")

    svg_content = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <clipPath id="squircle">
      <rect width="512" height="512" rx="112"/>
    </clipPath>
  </defs>
  <image width="512" height="512" href="data:image/png;base64,{b64_512}" clip-path="url(#squircle)"/>
</svg>
'''
    icon_svg_path = os.path.join(root_dir, "public", "icon.svg")
    with open(icon_svg_path, "w", encoding="utf-8") as f:
        f.write(svg_content)
    print(f"Saved {icon_svg_path}")

    # 3. Generate public/basedly-mark.svg
    buf_64 = BytesIO()
    raw_64 = src.resize((64, 64), Image.Resampling.LANCZOS)
    raw_64.save(buf_64, "PNG")
    b64_64 = base64.b64encode(buf_64.getvalue()).decode("utf-8")

    mark_svg_content = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <defs>
    <clipPath id="squircle">
      <rect width="64" height="64" rx="14"/>
    </clipPath>
  </defs>
  <image width="64" height="64" href="data:image/png;base64,{b64_64}" clip-path="url(#squircle)"/>
</svg>
'''
    mark_svg_path = os.path.join(root_dir, "public", "basedly-mark.svg")
    with open(mark_svg_path, "w", encoding="utf-8") as f:
        f.write(mark_svg_content)
    print(f"Saved {mark_svg_path}")

    # 4. Generate Android mipmap launcher icons
    # mdpi: 48 / 108
    # hdpi: 72 / 162
    # xhdpi: 96 / 216
    # xxhdpi: 144 / 324
    # xxxhdpi: 192 / 432
    densities = {
        "mipmap-mdpi": (48, 108),
        "mipmap-hdpi": (72, 162),
        "mipmap-xhdpi": (96, 216),
        "mipmap-xxhdpi": (144, 324),
        "mipmap-xxxhdpi": (192, 432),
    }

    res_dir = os.path.join(root_dir, "android", "app", "src", "main", "res")
    for folder, (base_sz, fg_sz) in densities.items():
        dir_path = os.path.join(res_dir, folder)
        os.makedirs(dir_path, exist_ok=True)
        
        # ic_launcher.png (squircle)
        sq = create_squircle(src, base_sz, rx_ratio=0.20)
        sq.save(os.path.join(dir_path, "ic_launcher.png"), "PNG")
        
        # ic_launcher_round.png (circle)
        ci = create_circle(src, base_sz)
        ci.save(os.path.join(dir_path, "ic_launcher_round.png"), "PNG")
        
        # ic_launcher_foreground.png (adaptive foreground)
        fg = create_adaptive_foreground(src, fg_sz)
        fg.save(os.path.join(dir_path, "ic_launcher_foreground.png"), "PNG")
        
        print(f"Updated Android {folder} ({base_sz}x{base_sz}, fg: {fg_sz}x{fg_sz})")

    # Update android/app/src/main/res/values/ic_launcher_background.xml
    bg_xml_path = os.path.join(res_dir, "values", "ic_launcher_background.xml")
    if os.path.exists(bg_xml_path):
        with open(bg_xml_path, "w", encoding="utf-8") as f:
            f.write('''<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#0B0A13</color>
</resources>
''')
        print("Updated ic_launcher_background.xml to #0B0A13")

    # Copy to android/app/src/main/assets/public/ if it exists
    android_assets_public = os.path.join(root_dir, "android", "app", "src", "main", "assets", "public")
    if os.path.exists(android_assets_public):
        app_icon_512.save(os.path.join(android_assets_public, "basedly-app-icon.png"), "PNG")
        with open(os.path.join(android_assets_public, "icon.svg"), "w", encoding="utf-8") as f:
            f.write(svg_content)
        print("Updated android/app/src/main/assets/public/ icons")

    # Copy to out/ if it exists
    out_dir = os.path.join(root_dir, "out")
    if os.path.exists(out_dir):
        app_icon_512.save(os.path.join(out_dir, "basedly-app-icon.png"), "PNG")
        with open(os.path.join(out_dir, "icon.svg"), "w", encoding="utf-8") as f:
            f.write(svg_content)
        print("Updated out/ icons")

    print("\nAll app icons successfully replaced!")

if __name__ == "__main__":
    main()
