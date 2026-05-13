"""Run once to generate PNG icons: python generate_icons.py"""
import base64, os

# Minimal red ticket SVG
SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {s} {s}">
  <rect width="{s}" height="{s}" rx="{r}" fill="#e63946"/>
  <text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle"
        font-family="Arial" font-size="{f}" font-weight="bold" fill="white">T</text>
</svg>"""

try:
    from cairosvg import svg2png
    for size, r, f in [(16,3,10),(48,8,30),(128,20,80)]:
        svg2png(bytestring=SVG.format(s=size,r=r,f=f).encode(),
                write_to=f"icon{size}.png")
    print("Icons generated with cairosvg.")
except ImportError:
    # Fallback: write placeholder 1x1 transparent PNGs so the extension loads
    PNG1 = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
    )
    for size in (16, 48, 128):
        path = os.path.join(os.path.dirname(__file__), f"icon{size}.png")
        with open(path, "wb") as f:
            f.write(PNG1)
    print("Placeholder icons written (install cairosvg for real icons).")
