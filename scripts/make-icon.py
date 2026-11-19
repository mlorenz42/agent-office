"""Draw the app icon (UFO beaming down on a desk) and build assets/icon.icns."""
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

SIZE = 1024


def draw():
    image = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    background = Image.new("RGBA", (SIZE, SIZE))
    pixels = ImageDraw.Draw(background)
    for y in range(SIZE):
        t = y / SIZE
        pixels.line([(0, y), (SIZE, y)], fill=(int(18 + 20 * t), int(24 + 26 * t), int(48 + 30 * t), 255))
    mask = Image.new("L", (SIZE, SIZE), 0)
    ImageDraw.Draw(mask).rounded_rectangle([40, 40, SIZE - 40, SIZE - 40], radius=200, fill=255)
    image.paste(background, (0, 0), mask)
    draw = ImageDraw.Draw(image)

    for x, y in [(190, 200), (300, 140), (820, 180), (760, 300), (230, 420), (860, 470), (150, 300)]:
        draw.ellipse([x - 6, y - 6, x + 6, y + 6], fill=(226, 232, 240, 255))

    beam = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    ImageDraw.Draw(beam).polygon([(440, 400), (584, 400), (760, 820), (264, 820)], fill=(170, 255, 170, 95))
    image.alpha_composite(beam.filter(ImageFilter.GaussianBlur(6)))

    draw.rectangle([300, 700, 724, 760], fill=(154, 107, 69, 255))
    draw.rectangle([300, 752, 724, 772], fill=(127, 87, 55, 255))
    draw.rectangle([430, 560, 594, 690], fill=(31, 41, 55, 255))
    draw.rectangle([446, 576, 578, 674], fill=(74, 222, 128, 255))
    for i, width in enumerate([90, 60, 100]):
        draw.rectangle([462, 596 + i * 24, 462 + width, 606 + i * 24], fill=(220, 252, 231, 255))
    draw.rectangle([496, 690, 528, 702], fill=(55, 65, 81, 255))

    draw.ellipse([412, 250, 612, 410], fill=(186, 230, 253, 230))
    draw.ellipse([262, 330, 762, 450], fill=(148, 163, 184, 255))
    draw.ellipse([262, 360, 762, 450], fill=(100, 116, 139, 255))
    for i in range(7):
        x = 330 + i * 60
        draw.ellipse([x - 14, 385, x + 14, 413], fill=(253, 224, 71, 255))
    return image


def main(target):
    target = Path(target)
    with tempfile.TemporaryDirectory() as tmp:
        iconset = Path(tmp) / "icon.iconset"
        iconset.mkdir()
        source = draw()
        for size in [16, 32, 128, 256, 512]:
            source.resize((size, size), Image.LANCZOS).save(iconset / f"icon_{size}x{size}.png")
            source.resize((size * 2, size * 2), Image.LANCZOS).save(iconset / f"icon_{size}x{size}@2x.png")
        source.save(target.with_suffix(".png"))
        subprocess.run(["iconutil", "-c", "icns", str(iconset), "-o", str(target)], check=True)
    print(f"wrote {target}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "assets/icon.icns")
