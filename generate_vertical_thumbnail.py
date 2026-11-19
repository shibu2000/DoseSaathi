import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H = 1080, 1920

# Fonts
bold_font_path = "node_modules/.bun/@expo-google-fonts+atkinson-hyperlegible-next@0.4.1/node_modules/@expo-google-fonts/atkinson-hyperlegible-next/700Bold/AtkinsonHyperlegibleNext_700Bold.ttf"
med_font_path = "node_modules/.bun/@expo-google-fonts+atkinson-hyperlegible-next@0.4.1/node_modules/@expo-google-fonts/atkinson-hyperlegible-next/500Medium/AtkinsonHyperlegibleNext_500Medium.ttf"

hero_font = ImageFont.truetype(bold_font_path, 60)
sub_font = ImageFont.truetype(med_font_path, 27)
tag_font = ImageFont.truetype(bold_font_path, 20)
pill_font = ImageFont.truetype(bold_font_path, 21)

# Canvas: Deep Midnight Slate
canvas = Image.new("RGB", (W, H), (10, 15, 29))

# Ambient lighting
glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
gdraw = ImageDraw.Draw(glow)
# Emerald radial aura behind the phone
gdraw.ellipse([W//2 - 420, 600, W//2 + 420, 1600], fill=(0, 115, 95, 75))
# Violet aura behind top icon
gdraw.ellipse([W//2 - 250, 40, W//2 + 250, 350], fill=(120, 80, 220, 40))
glow = glow.filter(ImageFilter.GaussianBlur(150))
canvas.paste(Image.alpha_composite(Image.new("RGBA", (W, H), (10, 15, 29, 255)), glow).convert("RGB"))

# Real App Icon (at top)
icon_path = "assets/icon.png"
icon_size = 96
icon_x = (W - icon_size) // 2
icon_y = 80

if os.path.exists(icon_path):
    app_icon = Image.open(icon_path).convert("RGBA").resize((icon_size, icon_size), Image.Resampling.LANCZOS)
    imask = Image.new("L", (icon_size, icon_size), 0)
    ImageDraw.Draw(imask).rounded_rectangle([0, 0, icon_size, icon_size], radius=24, fill=255)
    app_icon.putalpha(imask)
    
    ishadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    isdraw = ImageDraw.Draw(ishadow)
    isdraw.rounded_rectangle([icon_x - 10, icon_y + 8, icon_x + icon_size + 10, icon_y + icon_size + 20], radius=28, fill=(0, 0, 0, 160))
    isdraw.ellipse([icon_x - 20, icon_y - 10, icon_x + icon_size + 20, icon_y + icon_size + 30], fill=(0, 160, 130, 50))
    ishadow = ishadow.filter(ImageFilter.GaussianBlur(18))
    
    canvas_rgba = canvas.convert("RGBA")
    canvas_rgba = Image.alpha_composite(canvas_rgba, ishadow)
    canvas_rgba.paste(app_icon, (icon_x, icon_y), app_icon)
    canvas = canvas_rgba.convert("RGB")

draw = ImageDraw.Draw(canvas)

# Clean Category Pill
chip_text = "DOSESAATHI  •  OFFLINE-FIRST"
cb = draw.textbbox((0, 0), chip_text, font=tag_font)
cw = cb[2] - cb[0] + 30
ch = cb[3] - cb[1] + 12
cx = (W - cw) // 2
cy = 195
draw.rounded_rectangle([cx, cy, cx + cw, cy + ch], radius=10, fill=(15, 23, 42), outline=(0, 160, 130), width=2)
draw.text((cx + 15, cy + 6), chip_text, font=tag_font, fill=(52, 211, 153))

# Bold Headlines
h1 = "Never Miss A Dose."
h1_b = draw.textbbox((0, 0), h1, font=hero_font)
h1_x = (W - (h1_b[2] - h1_b[0])) // 2
draw.text((h1_x, 250), h1, font=hero_font, fill=(255, 255, 255))

h2 = "Medicine Care Made Simple."
h2_b = draw.textbbox((0, 0), h2, font=sub_font)
h2_x = (W - (h2_b[2] - h2_b[0])) // 2
draw.text((h2_x, 325), h2, font=sub_font, fill=(148, 163, 184))

# 3 Minimalist Highlight Badges
badges = ["100% Offline", "Over-Lockscreen Alerts", "Zero Accounts"]
total_badge_w = 0
b_metrics = []
for b in badges:
    bb = draw.textbbox((0, 0), b, font=pill_font)
    bw_val = bb[2] - bb[0] + 28
    b_metrics.append((b, bw_val))
    total_badge_w += bw_val

spacing = 14
start_bx = (W - (total_badge_w + spacing * (len(badges) - 1))) // 2
curr_bx = start_bx
by = 380
bh_val = 38

for b, bw_val in b_metrics:
    draw.rounded_rectangle([curr_bx, by, curr_bx + bw_val, by + bh_val], radius=19, fill=(26, 36, 56), outline=(51, 65, 85), width=1)
    draw.text((curr_bx + 14, by + 8), b, font=pill_font, fill=(241, 245, 249))
    curr_bx += bw_val + spacing


# REALISTIC SMARTPHONE CHASSIS
# True tall phone proportions (19.5:9 aspect ratio)
shot_path = "/home/shibu-dhara/Pictures/dosesaathi-screenshots/3.jpg"
shot_raw = Image.open(shot_path).convert("RGBA")

# Keep the entire phone screen proportions intact!
phone_screen_w = 550
phone_screen_h = int(phone_screen_w * (2436 / 1080)) # ~1240px

bezel_side = 14
bezel_top = 22
bezel_bottom = 22

chassis_w = phone_screen_w + bezel_side * 2
chassis_h = phone_screen_h + bezel_top + bezel_bottom

phone_x = (W - chassis_w) // 2
phone_y = 460

# Resize screenshot
shot_scaled = shot_raw.resize((phone_screen_w, phone_screen_h), Image.Resampling.LANCZOS)

# Screen mask with realistic inner corner radius
smask = Image.new("L", (phone_screen_w, phone_screen_h), 0)
ImageDraw.Draw(smask).rounded_rectangle([0, 0, phone_screen_w, phone_screen_h], radius=38, fill=255)
shot_scaled.putalpha(smask)

# Build Phone Chassis (Hardware body)
phone_body = Image.new("RGBA", (chassis_w + 16, chassis_h + 10), (0, 0, 0, 0))
pbdraw = ImageDraw.Draw(phone_body)

# Hardware side buttons:
# Left volume buttons
pbdraw.rounded_rectangle([2, bezel_top + 180, 7, bezel_top + 260], radius=2, fill=(71, 85, 105)) # Vol Up
pbdraw.rounded_rectangle([2, bezel_top + 280, 7, bezel_top + 360], radius=2, fill=(71, 85, 105)) # Vol Down
# Right power button
pbdraw.rounded_rectangle([chassis_w + 9, bezel_top + 220, chassis_w + 14, bezel_top + 320], radius=2, fill=(71, 85, 105))

# Outer phone chassis (Titanium / Matte Dark Metal)
pbdraw.rounded_rectangle([8, 0, chassis_w + 8, chassis_h], radius=50, fill=(24, 32, 47), outline=(71, 85, 105), width=3)
# Inner bezel border
pbdraw.rounded_rectangle([8 + bezel_side - 2, bezel_top - 2, 8 + bezel_side + phone_screen_w + 2, bezel_top + phone_screen_h + 2], radius=40, fill=(15, 23, 42))

# Paste screen inside chassis
phone_body.paste(shot_scaled, (8 + bezel_side, bezel_top), shot_scaled)

# Top Speaker Grill
speaker_w = 60
speaker_x = 8 + (chassis_w - speaker_w) // 2
speaker_y = 10
pbdraw.rounded_rectangle([speaker_x, speaker_y, speaker_x + speaker_w, speaker_y + 4], radius=2, fill=(51, 65, 85))

# Front Camera Punch-hole (Centered inside screen top)
cam_x = 8 + chassis_w // 2
cam_y = bezel_top + 16
cam_r = 9
pbdraw.ellipse([cam_x - cam_r, cam_y - cam_r, cam_x + cam_r, cam_y + cam_r], fill=(8, 12, 20), outline=(30, 41, 59), width=1)
# Lens reflection specular dot
pbdraw.ellipse([cam_x - 3, cam_y - 3, cam_x, cam_y], fill=(30, 58, 138, 180))

# Bottom Home Indicator Bar (Swipe bar)
home_bar_w = 140
home_bar_x = 8 + (chassis_w - home_bar_w) // 2
home_bar_y = bezel_top + phone_screen_h - 12
pbdraw.rounded_rectangle([home_bar_x, home_bar_y, home_bar_x + home_bar_w, home_bar_y + 4], radius=2, fill=(148, 163, 184, 180))

# Drop Shadow for phone
canvas_rgba = canvas.convert("RGBA")
dshadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
dsdraw = ImageDraw.Draw(dshadow)
# Dual shadow: soft wide spread + deep contact shadow
dsdraw.rounded_rectangle([phone_x - 12, phone_y + 15, phone_x + chassis_w + 12, phone_y + chassis_h + 25], radius=56, fill=(0, 0, 0, 230))
dshadow = dshadow.filter(ImageFilter.GaussianBlur(38))

canvas_rgba = Image.alpha_composite(canvas_rgba, dshadow)
canvas_rgba.paste(phone_body, (phone_x - 8, phone_y), phone_body)

# Subtle footer watermark
footer_text = "Free & Open Source  •  React Native  •  TypeScript  •  Kotlin"
fdraw = ImageDraw.Draw(canvas_rgba)
fb = fdraw.textbbox((0, 0), footer_text, font=pill_font)
fx = (W - (fb[2] - fb[0])) // 2
fdraw.text((fx, H - 45), footer_text, font=pill_font, fill=(100, 116, 139))

final_img = canvas_rgba.convert("RGB")
output_path = "/home/shibu-dhara/Pictures/dosesaathi-screenshots/dosesaathi-thumbnail-vertical.png"
final_img.save(output_path, quality=95)
print(f"Saved realistic phone thumbnail to: {output_path}")

os.system(f"cp {output_path} /home/shibu-dhara/Developer/DoseSaathi/build-output/")
