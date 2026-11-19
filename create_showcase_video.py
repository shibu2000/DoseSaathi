import os
import subprocess
import time
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H = 1080, 1920
FPS = 30
TRANSITION_FRAMES = 12

slides_data = [
    {
        "img": "/home/shibu-dhara/Pictures/dosesaathi-screenshots/1.jpg",
        "tag": "OPEN-SOURCE MEDICATION CARE",
        "tag_color": (0, 97, 86),
        "title": "Welcome to DoseSaathi 🌿",
        "subtitle": "A calm, private & offline-first medicine companion",
    },
    {
        "img": "/home/shibu-dhara/Pictures/dosesaathi-screenshots/2.jpg",
        "tag": "100% OFFLINE AUTONOMY",
        "tag_color": (107, 70, 193),
        "title": "Your Medicines. Always Accessible.",
        "subtitle": "Encrypted local SQLite • Zero accounts • 100% private",
    },
    {
        "img": "/home/shibu-dhara/Pictures/dosesaathi-screenshots/3.jpg",
        "tag": "INTUITIVE DASHBOARD",
        "tag_color": (0, 97, 86),
        "title": "Clear Daily Adherence",
        "subtitle": "Due, taken & upcoming doses with 1-tap confirmation",
    },
    {
        "img": "/home/shibu-dhara/Pictures/dosesaathi-screenshots/4.jpg",
        "tag": "STRUCTURED REGIMENS",
        "tag_color": (217, 119, 6),
        "title": "Comprehensive Medicine Plans",
        "subtitle": "Multi-dose daily schedules with dosage & intake notes",
    },
    {
        "img": "/home/shibu-dhara/Pictures/dosesaathi-screenshots/5.jpg",
        "tag": "GUIDED WIZARD",
        "tag_color": (107, 70, 193),
        "title": "Effortless 4-Step Setup",
        "subtitle": "Dosage, forms, exact timing & low-stock alerts",
    },
    {
        "img": "/home/shibu-dhara/Pictures/dosesaathi-screenshots/6.jpg",
        "tag": "ZERO-FRICTION PAIRING",
        "tag_color": (0, 97, 86),
        "title": "Connect With Family Instantly",
        "subtitle": "6-digit ephemeral sync codes • Cloudflare Workers + D1",
    },
    {
        "img": "/home/shibu-dhara/Pictures/dosesaathi-screenshots/7.jpg",
        "tag": "ELDERLY-FIRST ACCESSIBILITY",
        "tag_color": (217, 119, 6),
        "title": "Bespoke Appearance & Care",
        "subtitle": "4 calming themes with dynamic Android launcher icons",
    },
    {
        "img": "/home/shibu-dhara/Pictures/dosesaathi-screenshots/8.jpg",
        "tag": "CAREGIVER REASSURANCE",
        "tag_color": (107, 70, 193),
        "title": "Family Caregiver Hub",
        "subtitle": "Peace of mind and adherence visibility for loved ones",
    },
]

# Audio path
audio_path = "apps/mobile/android/app/src/main/res/raw/medchain_reminder_companion_female.ogg"
output_video = "/home/shibu-dhara/Pictures/dosesaathi-screenshots/dosesaathi-showcase.mp4"

# Determine audio duration via ffprobe
probe_cmd = ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", audio_path]
audio_duration = float(subprocess.check_output(probe_cmd).decode().strip())
print(f"Audio duration: {audio_duration:.2f}s")

total_frames = int(audio_duration * FPS)
num_slides = len(slides_data)
frames_per_slide = total_frames // num_slides
print(f"Total frames: {total_frames}, Frames per slide: {frames_per_slide}")

# Fonts
bold_font_path = "node_modules/.bun/@expo-google-fonts+atkinson-hyperlegible-next@0.4.1/node_modules/@expo-google-fonts/atkinson-hyperlegible-next/700Bold/AtkinsonHyperlegibleNext_700Bold.ttf"
med_font_path = "node_modules/.bun/@expo-google-fonts+atkinson-hyperlegible-next@0.4.1/node_modules/@expo-google-fonts/atkinson-hyperlegible-next/500Medium/AtkinsonHyperlegibleNext_500Medium.ttf"

tag_font = ImageFont.truetype(bold_font_path, 22)
title_font = ImageFont.truetype(bold_font_path, 42)
sub_font = ImageFont.truetype(med_font_path, 25)
footer_font = ImageFont.truetype(med_font_path, 22)

# Pre-render slide base images
print("Pre-rendering slide images...")
rendered_slides = []

phone_w = 640
phone_h = int(phone_w * (2436 / 1080))
bezel_padding = 10
bezel_w = phone_w + bezel_padding * 2
bezel_h = phone_h + bezel_padding * 2
phone_x = (W - bezel_w) // 2
phone_y = 295

# Shared drop shadow
shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
sdraw = ImageDraw.Draw(shadow)
sdraw.rounded_rectangle([phone_x - 4, phone_y + 12, phone_x + bezel_w + 4, phone_y + bezel_h + 20], radius=50, fill=(0, 0, 0, 160))
shadow = shadow.filter(ImageFilter.GaussianBlur(32))

for idx, data in enumerate(slides_data):
    # Background
    bg = Image.new("RGB", (W, H), (15, 23, 42)) # Slate 900
    
    # Ambient aura matching tag color
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gdraw = ImageDraw.Draw(glow)
    gcolor = (*data["tag_color"], 60)
    gdraw.ellipse([W//2 - 350, 480, W//2 + 350, 1380], fill=gcolor)
    glow = glow.filter(ImageFilter.GaussianBlur(130))
    bg.paste(Image.alpha_composite(Image.new("RGBA", (W, H), (15, 23, 42, 255)), glow).convert("RGB"))

    draw = ImageDraw.Draw(bg)

    # 1. Category Tag Chip
    tag_text = data["tag"]
    tb = draw.textbbox((0, 0), tag_text, font=tag_font)
    tw = tb[2] - tb[0] + 36
    th = tb[3] - tb[1] + 16
    tx = (W - tw) // 2
    ty = 70
    draw.rounded_rectangle([tx, ty, tx + tw, ty + th], radius=16, fill=data["tag_color"])
    draw.text((tx + 18, ty + 7), tag_text, font=tag_font, fill=(255, 255, 255))

    # 2. Title
    title_text = data["title"]
    tit_b = draw.textbbox((0, 0), title_text, font=title_font)
    tit_x = (W - (tit_b[2] - tit_b[0])) // 2
    draw.text((tit_x, 140), title_text, font=title_font, fill=(248, 250, 252))

    # 3. Subtitle
    sub_text = data["subtitle"]
    sub_b = draw.textbbox((0, 0), sub_text, font=sub_font)
    sub_x = (W - (sub_b[2] - sub_b[0])) // 2
    draw.text((sub_x, 210), sub_text, font=sub_font, fill=(148, 163, 184))

    # 4. Phone Mockup
    shot = Image.open(data["img"]).convert("RGBA")
    shot = shot.resize((phone_w, phone_h), Image.Resampling.LANCZOS)
    
    mask = Image.new("L", (phone_w, phone_h), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rounded_rectangle([0, 0, phone_w, phone_h], radius=44, fill=255)
    shot.putalpha(mask)

    b_img = Image.new("RGBA", (bezel_w, bezel_h), (0, 0, 0, 0))
    bdraw = ImageDraw.Draw(b_img)
    bdraw.rounded_rectangle([0, 0, bezel_w, bezel_h], radius=50, fill=(30, 41, 59), outline=(71, 85, 105), width=2)
    b_img.paste(shot, (bezel_padding, bezel_padding), shot)

    # Compose background + shadow + phone
    bg = Image.alpha_composite(bg.convert("RGBA"), shadow)
    bg.paste(b_img, (phone_x, phone_y), b_img)

    # 5. Slide Indicator Dots at bottom
    dot_y = 1785
    total_dots_w = (num_slides - 1) * 22 + 36
    start_dot_x = (W - total_dots_w) // 2
    fdraw = ImageDraw.Draw(bg)

    curr_x = start_dot_x
    for i in range(num_slides):
        if i == idx:
            fdraw.rounded_rectangle([curr_x, dot_y - 2, curr_x + 36, dot_y + 8], radius=6, fill=data["tag_color"])
            curr_x += 44
        else:
            fdraw.ellipse([curr_x, dot_y, curr_x + 6, dot_y + 6], fill=(71, 85, 105))
            curr_x += 16

    # 6. Footer Watermark
    footer_text = "github.com/shibu2000/DoseSaathi • Free & Open Source"
    fb = fdraw.textbbox((0, 0), footer_text, font=footer_font)
    fx = (W - (fb[2] - fb[0])) // 2
    fdraw.text((fx, H - 72), footer_text, font=footer_font, fill=(100, 116, 139))

    rendered_slides.append(bg.convert("RGB"))

print(f"Rendered {len(rendered_slides)} base slides.")

# Launch FFmpeg process to pipe raw frames
ffmpeg_cmd = [
    "ffmpeg", "-y",
    "-f", "rawvideo",
    "-pix_fmt", "rgb24",
    "-s", f"{W}x{H}",
    "-r", str(FPS),
    "-i", "-",
    "-i", audio_path,
    "-c:v", "libx264",
    "-preset", "medium",
    "-crf", "18",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", "192k",
    "-shortest",
    output_video
]

print("Starting FFmpeg encoder...")
proc = subprocess.Popen(ffmpeg_cmd, stdin=subprocess.PIPE)

t0 = time.time()
frame_count = 0

for slide_idx in range(num_slides):
    curr_slide = rendered_slides[slide_idx]
    next_slide = rendered_slides[(slide_idx + 1) % num_slides]
    
    # Calculate how many frames this slide gets
    # Last slide gets remaining frames
    if slide_idx == num_slides - 1:
        slide_frames = total_frames - frame_count
    else:
        slide_frames = frames_per_slide

    static_frames = slide_frames - TRANSITION_FRAMES
    
    # Static display
    curr_bytes = curr_slide.tobytes()
    for _ in range(static_frames):
        proc.stdin.write(curr_bytes)
        frame_count += 1
        
    # Crossfade transition to next slide
    for t in range(TRANSITION_FRAMES):
        if slide_idx == num_slides - 1:
            # Fade to black on very last slide
            alpha = (t + 1) / TRANSITION_FRAMES
            frame_img = Image.blend(curr_slide, Image.new("RGB", (W, H), (15, 23, 42)), alpha)
        else:
            alpha = (t + 1) / TRANSITION_FRAMES
            frame_img = Image.blend(curr_slide, next_slide, alpha)
        proc.stdin.write(frame_img.tobytes())
        frame_count += 1

proc.stdin.close()
proc.wait()

print(f"Video created in {time.time() - t0:.2f}s! Total frames rendered: {frame_count}")
print(f"Saved to: {output_video}")
