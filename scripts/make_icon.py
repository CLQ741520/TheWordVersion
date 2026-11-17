# 生成 AsyWL / 忆廿 的应用图标（1024x1024 PNG）。
# 优先使用项目根目录的「AsyWL图标.png」素材；没有素材时生成字母图标。
# 用法：python scripts/make_icon.py
from PIL import Image, ImageDraw, ImageFont
import os

SIZE = 1024
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(ROOT, "build", "icon.png")
os.makedirs(os.path.dirname(OUT), exist_ok=True)

source = os.path.join(ROOT, "AsyWL图标.png")
if os.path.exists(source):
    # 居中裁剪为正方形后缩放，避免拉伸变形
    img = Image.open(source).convert("RGBA")
    side = min(img.size)
    left = (img.width - side) // 2
    top = (img.height - side) // 2
    img = img.crop((left, top, left + side, top + side)).resize((SIZE, SIZE), Image.LANCZOS)
    img.save(OUT)
    print("已使用 AsyWL图标.png 生成 build/icon.png")
    raise SystemExit(0)

CANVAS = SIZE * 4
RADIUS = 220 * 4

TOP = (20, 184, 166)      # teal-500
BOTTOM = (15, 118, 110)   # teal-700

img = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
gradient = Image.new("RGBA", (CANVAS, CANVAS))
draw = ImageDraw.Draw(gradient)
for y in range(CANVAS):
    t = y / (CANVAS - 1)
    color = tuple(int(TOP[i] + (BOTTOM[i] - TOP[i]) * t) for i in range(3)) + (255,)
    draw.line([(0, y), (CANVAS, y)], fill=color)

mask = Image.new("L", (CANVAS, CANVAS), 0)
mask_draw = ImageDraw.Draw(mask)
mask_draw.rounded_rectangle([0, 0, CANVAS - 1, CANVAS - 1], radius=RADIUS, fill=255)
img.paste(gradient, (0, 0), mask)

font_candidates = [
    "C:/Windows/Fonts/msyhbd.ttc",
    "C:/Windows/Fonts/msyh.ttc",
    "C:/Windows/Fonts/arialbd.ttf",
    "/System/Library/Fonts/PingFang.ttc",
    "/System/Library/Fonts/Helvetica.ttc",
]


def load_font(size):
    for path in font_candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    return ImageFont.load_default(size)


draw = ImageDraw.Draw(img)

letter_font = load_font(560 * 4)
letter = "A"
bbox = draw.textbbox((0, 0), letter, font=letter_font)
letter_w = bbox[2] - bbox[0]
letter_h = bbox[3] - bbox[1]
letter_x = (CANVAS - letter_w) / 2 - bbox[0]
letter_y = 170 * 4 - bbox[1]
draw.text((letter_x, letter_y), letter, font=letter_font, fill=(255, 255, 255, 255))

name_font = load_font(150 * 4)
name = "忆廿"
bbox = draw.textbbox((0, 0), name, font=name_font)
name_w = bbox[2] - bbox[0]
name_x = (CANVAS - name_w) / 2 - bbox[0]
name_y = 780 * 4 - bbox[1]
draw.text((name_x, name_y), name, font=name_font, fill=(255, 255, 255, 215))

out = img.resize((SIZE, SIZE), Image.LANCZOS)
out.save(OUT)
print("已生成 build/icon.png")
