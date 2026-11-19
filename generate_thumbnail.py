import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H = 1920, 1080

# Fonts
bold_font_path = "node_modules/.bun/@expo-google-fonts+atkinson-hyperlegible-next@0.4.1/node_modules/@expo-google-fonts/atkinson-hyperlegible-next/700Bold/AtkinsonHyperlegibleNext_700Bold.ttf"
med_font_path = "node_modules/.bun/@expo-google-fonts+atkinson-hyperlegible-next@0.4.1/node_modules/@expo-google-fonts/atkinson-hyperlegible-next/500Medium/AtkinsonHyperlegibleNext_500Medium.ttf"
symbol_font_path = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

brand_font = ImageFont.truetype(bold_font_path, 48)
hero_font = ImageFont.truetype(bold_font_path, 66)
sub_font = ImageFont.truetype(med_font_path, 30)
pill_font = ImageFont.truetype(bold_font_path, 22)
symbol_font = ImageFont.truetype(symbol_font_path, 20)
badge_font = ImageFont.truetype(med_font_path, 24)

# Create canvas
canvas = Image.new("RGB", (W, H), (15, 23, 42)) # Deep Slate 900

# Background glow
glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
gdraw = ImageDraw.Draw(glow)
# Teal glow right under phone
gdraw.ellipse([W - 850, 100, W + 150, 1100], fill=(0, 97, 86, 85))
# Soft purple glow center/left
gdraw.ellipse([300, 250, 1100, 950], fill=(107, 70, 193, 45))
glow = glow.filter(ImageFilter.GaussianBlur(150))
canvas.paste(Image.alpha_composite(Image.new("RGBA", (W, H), (15, 23, 42, 255)), glow).convert("RGB"))

# Real App Icon
icon_path = "assets/icon.png"
icon_size = 100
if os.path.exists(icon_path):
    app_icon = Image.open(icon_path).convert("RGBA").resize((icon_size, icon_size), Image.Resampling.LANCZOS)
    
    # Mask with smooth rounded squircle corners
    imask = Image.new("L", (icon_size, icon_size), 0)
    idraw = ImageDraw.Draw(imask)
    idraw.rounded_rectangle([0, 0, icon_size, icon_size], radius=26, fill=255)
    app_icon.putalpha(imask)
    
    # Drop shadow for app icon
    ishadow = Image.new("RGBA", (icon_size + 30, icon_size + 30), (0, 0, 0, 0))
    isdraw = ImageDraw.Draw(ishadow)
    isdraw.rounded_rectangle([15, 15, icon_size + 15, icon_size + 15], radius=28, fill=(0, 0, 0, 140))
    ishadow = ishadow.filter(ImageFilter.GaussianBlur(12))
    
    canvas_rgba = canvas.convert("RGBA")
    canvas_rgba.paste(ishadow, (95, 95), ishadow)
    canvas_rgba.paste(app_icon, (110, 110), app_icon)
    canvas = canvas_rgba.convert("RGB")

draw = ImageDraw.Draw(canvas)

# Brand Title beside icon
draw.text((230, 120), "DoseSaathi", font=brand_font, fill=(255, 255, 255))

# Category tag chip
chip_text = "OFFLINE-FIRST MEDICINE COMPANION"
cb = draw.textbbox((0, 0), chip_text, font=pill_font)
cw, ch = cb[2] - cb[0] + 24, cb[3] - cb[1] + 12
draw.rounded_rectangle([230, 180, 230 + cw, 180 + ch], radius=10, fill=(0, 97, 86))
draw.text((242, 184), chip_text, font=pill_font, fill=(255, 255, 255))

# Main Hero Headline
draw.text((110, 275), "Never Miss A Dose.", font=hero_font, fill=(248, 250, 252))
draw.text((110, 355), "Calm, Private & On-Time.", font=hero_font, fill=(52, 211, 153)) # Emerald accent

# Subtitle description
draw.text((110, 465), "An open-source medication companion for seniors,\nchronic care patients, and the families who care for them.", font=sub_font, fill=(148, 163, 184))

# Feature Pills Grid
features = [
    ("✓", "Over-Lockscreen Alarms", (0, 97, 86)),
    ("✓", "100% Offline (SQLite)", (107, 70, 193)),
    ("✓", "Dependent Regimens", (180, 83, 9)),
    ("✓", "6-Digit Family Link", (13, 148, 136)),
    ("✓", "Gentle Voice Chimes", (147, 51, 234)),
    ("✓", "Elderly-Friendly UI", (217, 119, 6)),
]

start_px = 110
start_py = 590
col_w = 370
row_h = 64

for i, (symbol, feat_title, col) in enumerate(features):
    rx = start_px + (i % 2) * (col_w + 20)
    ry = start_py + (i // 2) * (row_h + 16)
    
    # Pill bg
    draw.rounded_rectangle([rx, ry, rx + col_w, ry + row_h], radius=16, fill=(30, 41, 59), outline=(51, 65, 85), width=2)
    # Symbol box
    draw.rounded_rectangle([rx + 10, ry + 10, rx + 48, ry + row_h - 10], radius=10, fill=col)
    draw.text((rx + 20, ry + 16), symbol, font=symbol_font, fill=(255, 255, 255))
    # Text
    draw.text((rx + 62, ry + 18), feat_title, font=pill_font, fill=(241, 245, 249))

# Footer open source badge
footer_tag = "Free & Open Source  •  React Native  •  TypeScript  •  Kotlin  •  Cloudflare"
draw.text((110, 955), footer_tag, font=badge_font, fill=(100, 116, 139))


# RIGHT SIDE: Dual Phone Mockup
shot_back_path = "/home/shibu-dhara/Pictures/dosesaathi-screenshots/6.jpg"
shot_front_path = "/home/shibu-dhara/Pictures/dosesaathi-screenshots/3.jpg"

phone_w = 405
phone_h = int(phone_w * (2436 / 1080))
b_pad = 8
bw = phone_w + b_pad * 2
bh = phone_h + b_pad * 2

def make_phone(path):
    s = Image.open(path).convert("RGBA").resize((phone_w, phone_h), Image.Resampling.LANCZOS)
    m = Image.new("L", (phone_w, phone_h), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, phone_w, phone_h], radius=32, fill=255)
    s.putalpha(m)
    
    frame = Image.new("RGBA", (bw, bh), (0, 0, 0, 0))
    fdraw = ImageDraw.Draw(frame)
    fdraw.rounded_rectangle([0, 0, bw, bh], radius=38, fill=(30, 41, 59), outline=(71, 85, 105), width=3)
    frame.paste(s, (b_pad, b_pad), s)
    return frame

phone_back = make_phone(shot_back_path)
phone_front = make_phone(shot_front_path)

canvas_rgba = canvas.convert("RGBA")

# Back phone position
bx, by = 1440, 75
bshadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
ImageDraw.Draw(bshadow).rounded_rectangle([bx - 10, by + 15, bx + bw + 10, by + bh + 25], radius=45, fill=(0, 0, 0, 170))
bshadow = bshadow.filter(ImageFilter.GaussianBlur(35))
canvas_rgba = Image.alpha_composite(canvas_rgba, bshadow)
canvas_rgba.paste(phone_back, (bx, by), phone_back)

# Front phone position
fx, fy = 1140, 120
fshadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
ImageDraw.Draw(fshadow).rounded_rectangle([fx - 15, fy + 20, fx + bw + 15, fy + bh + 30], radius=45, fill=(0, 0, 0, 210))
fshadow = fshadow.filter(ImageFilter.GaussianBlur(40))
canvas_rgba = Image.alpha_composite(canvas_rgba, fshadow)
canvas_rgba.paste(phone_front, (fx, fy), phone_front)

# Final save
final_img = canvas_rgba.convert("RGB")
output_path = "/home/shibu-dhara/Pictures/dosesaathi-screenshots/dosesaathi-thumbnail-landscape.png"
final_img.save(output_path, quality=95)
print(f"Saved landscape thumbnail to: {output_path}")

# Copy to build-output
os.system(f"cp {output_path} /home/shibu-dhara/Developer/DoseSaathi/build-output/")
