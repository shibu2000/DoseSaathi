import os
import subprocess
import time
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H = 1920, 1080
FPS = 30
TRANSITION_FRAMES = 15 # 0.5s smooth crossfade

# Typography
bold_font_path = "node_modules/.bun/@expo-google-fonts+atkinson-hyperlegible-next@0.4.1/node_modules/@expo-google-fonts/atkinson-hyperlegible-next/700Bold/AtkinsonHyperlegibleNext_700Bold.ttf"
med_font_path = "node_modules/.bun/@expo-google-fonts+atkinson-hyperlegible-next@0.4.1/node_modules/@expo-google-fonts/atkinson-hyperlegible-next/500Medium/AtkinsonHyperlegibleNext_500Medium.ttf"
sym_font_path = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

hero_font = ImageFont.truetype(bold_font_path, 56)
brand_font = ImageFont.truetype(bold_font_path, 28)
brand_sub_font = ImageFont.truetype(bold_font_path, 13)
tag_font = ImageFont.truetype(bold_font_path, 17)
step_font = ImageFont.truetype(bold_font_path, 18)
sub_font = ImageFont.truetype(med_font_path, 24)
bullet_title_font = ImageFont.truetype(bold_font_path, 23)
bullet_desc_font = ImageFont.truetype(med_font_path, 22)
chip_font = ImageFont.truetype(bold_font_path, 16)
check_font = ImageFont.truetype(sym_font_path, 18)
footer_font = ImageFont.truetype(med_font_path, 18)

slides_data = [
    {
        "img": "/home/shibu-dhara/Pictures/dosesaathi-screenshots/1.jpg",
        "tag": "OFFLINE-FIRST HEALTHCARE",
        "h1": "Medicine Care,",
        "h2": "Made Calm & Simple.",
        "subtitle": "Private, offline-first medicine management designed for complete peace of mind.",
        "bullets": [
            ("100% Offline Autonomy", "Regimens & history stay strictly on your device"),
            ("Native Kotlin Alarms", "Over-lockscreen wake alerts that never fail"),
            ("Zero Account Needed", "Instant access with zero logins, ads, or tracking")
        ],
        "chips": ["Encrypted SQLite", "Over-Lockscreen Wake", "Zero Analytics", "Elderly-Friendly"],
        "accent": (0, 220, 160),
        "aura": (0, 130, 105)
    },
    {
        "img": "/home/shibu-dhara/Pictures/dosesaathi-screenshots/2.jpg",
        "tag": "COMPLETE DATA PRIVACY",
        "h1": "Your Health Data,",
        "h2": "Stays On Your Phone.",
        "subtitle": "No accounts, no external tracking servers, and zero telemetry collection.",
        "bullets": [
            ("Local SQLite Storage", "All medication records remain 100% on your device"),
            ("Zero Cloud Surveillance", "No tracking cookies, trackers, or SDK profiling"),
            ("Works in Flight Mode", "Full functionality without any network connection")
        ],
        "chips": ["100% Offline", "Local SQLite", "No Telemetry", "Patient Owned"],
        "accent": (168, 85, 247),
        "aura": (126, 34, 206)
    },
    {
        "img": "/home/shibu-dhara/Pictures/dosesaathi-screenshots/3.jpg",
        "tag": "UNMISSABLE MEDICINE ALARMS",
        "h1": "Clear Adherence,",
        "h2": "Right on Lockscreen.",
        "subtitle": "Wake-up alarms cut through notification noise with instant 1-tap logging.",
        "bullets": [
            ("Over-Lockscreen Wake", "Native Kotlin service wakes phone in deep Doze mode"),
            ("1-Tap Confirmation", "Mark taken or snooze instantly right from lockscreen"),
            ("5-Minute Safety Undo", "Reverses accidental taps without corrupting history")
        ],
        "chips": ["Foreground Alarms", "1-Tap Logging", "5-Min Undo Window", "Sequential Dosing"],
        "accent": (20, 184, 166),
        "aura": (13, 148, 136)
    },
    {
        "img": "/home/shibu-dhara/Pictures/dosesaathi-screenshots/4.jpg",
        "tag": "COMPREHENSIVE MEDICATION PLANS",
        "h1": "Complex Regimens,",
        "h2": "Organized Effortlessly.",
        "subtitle": "Manage multiple daily doses, meal timings, drops, and low-stock warnings.",
        "bullets": [
            ("Versatile Form Support", "Tablets, capsules, syrups, drops, and injections"),
            ("Meal Timing Logic", "Explicit Before Meal, With Meal, or After Meal rules"),
            ("Low-Stock Warnings", "Predictive pill count alerts you before medicine runs out")
        ],
        "chips": ["Multi-Dose Schedules", "Meal Reminders", "Stock Inventory", "PRN / SOS Support"],
        "accent": (245, 158, 11),
        "aura": (180, 83, 9)
    },
    {
        "img": "/home/shibu-dhara/Pictures/dosesaathi-screenshots/5.jpg",
        "tag": "INTUITIVE 4-STEP WIZARD",
        "h1": "Adding Medicines,",
        "h2": "In Just Four Steps.",
        "subtitle": "A progressive, distraction-free setup with instant visual previews.",
        "bullets": [
            ("Guided 4-Step Flow", "Effortlessly configure dosage, times, and refill rules"),
            ("Gentle Audio Chimes", "Custom notification tones tailored for calm delivery"),
            ("Schedule Validation", "Intelligent collision detection prevents duplicate reminders")
        ],
        "chips": ["4-Step Wizard", "Custom Audio Chimes", "Refill Tracking", "Conflict Checks"],
        "accent": (99, 102, 241),
        "aura": (67, 56, 202)
    },
    {
        "img": "/home/shibu-dhara/Pictures/dosesaathi-screenshots/6.jpg",
        "tag": "EPHEMERAL CAREGIVER SYNC",
        "h1": "Connect With Family,",
        "h2": "In Just 10 Seconds.",
        "subtitle": "Share adherence status safely with 6-digit ephemeral sync codes.",
        "bullets": [
            ("6-Digit Ephemeral Codes", "15-minute temporary link requires zero accounts"),
            ("Serverless Edge Core", "Powered by Cloudflare Workers and D1 database"),
            ("Zero-Knowledge Sync", "Only confirmation timestamps sync—no clinical notes")
        ],
        "chips": ["6-Digit Pairing", "Cloudflare D1", "No Passwords", "End-to-End TLS"],
        "accent": (14, 165, 233),
        "aura": (3, 105, 161)
    },
    {
        "img": "/home/shibu-dhara/Pictures/dosesaathi-screenshots/7.jpg",
        "tag": "INCLUSIVE ACCESSIBILITY",
        "h1": "Designed for Seniors,",
        "h2": "Soothing & High-Contrast.",
        "subtitle": "Engineered for visual clarity with Atkinson Hyperlegible typography.",
        "bullets": [
            ("Braille Institute Font", "Atkinson Hyperlegible eliminates letter ambiguity"),
            ("4 Calming Color Themes", "Midnight Teal, Lavender Calm, Rose Quartz, Slate"),
            ("Adaptive Launcher Icons", "Home screen icon morphs to match your chosen theme")
        ],
        "chips": ["Atkinson Typography", "4 Soothing Themes", "Dynamic Icons", "Large Touch Targets"],
        "accent": (244, 63, 94),
        "aura": (190, 18, 60)
    },
    {
        "img": "/home/shibu-dhara/Pictures/dosesaathi-screenshots/8.jpg",
        "tag": "CAREGIVER REASSURANCE HUB",
        "h1": "Peace of Mind,",
        "h2": "For the Whole Family.",
        "subtitle": "Real-time adherence reassurance for parents and loved ones from anywhere.",
        "bullets": [
            ("Remote Adherence Status", "Check morning or evening doses with zero guesswork"),
            ("Missed Dose Visibility", "Gentle awareness when critical doses remain pending"),
            ("Multi-Profile Support", "Manage parents, children, and relatives from one hub")
        ],
        "chips": ["Remote Adherence", "Multi-Profile", "Respectful Privacy", "Caregiver Alerts"],
        "accent": (16, 185, 129),
        "aura": (5, 150, 105)
    }
]

# Audio settings: 30-second minimal music track
audio_path = "assets/audio/minimal_soundtrack_30s.mp3"
output_primary = "/home/shibu-dhara/Pictures/dosesaathi-screenshots/dosesaathi-showcase-landscape.mp4"
output_secondary = "/home/shibu-dhara/Developer/DoseSaathi/build-output/dosesaathi-showcase-landscape.mp4"

probe_cmd = ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", audio_path]
audio_duration = float(subprocess.check_output(probe_cmd).decode().strip())
print(f"Minimal soundtrack duration: {audio_duration:.2f}s")

# Target exact 30 seconds (900 frames at 30 FPS)
TARGET_SECONDS = 30.0
total_frames = int(TARGET_SECONDS * FPS)
num_slides = len(slides_data)
frames_per_slide = total_frames // num_slides
print(f"Total frames: {total_frames}, Slides: {num_slides}, Frames per slide: {frames_per_slide} (~{frames_per_slide/FPS:.2f}s per slide)")

# Phone dimensions
pw = 425
ph = int(pw * (2436 / 1080)) # ~959px
bezel_side = 13
bezel_top = 18
bezel_bottom = 18
cw = pw + bezel_side * 2
ch = ph + bezel_top + bezel_bottom

# App Icon
icon_size = 56
app_icon = None
if os.path.exists("assets/icon.png"):
    app_icon = Image.open("assets/icon.png").convert("RGBA").resize((icon_size, icon_size), Image.Resampling.LANCZOS)
    imask = Image.new("L", (icon_size, icon_size), 0)
    ImageDraw.Draw(imask).rounded_rectangle([0, 0, icon_size, icon_size], radius=14, fill=255)
    app_icon.putalpha(imask)

# Screen mask
smask = Image.new("L", (pw, ph), 0)
ImageDraw.Draw(smask).rounded_rectangle([0, 0, pw, ph], radius=38, fill=255)

print("Pre-rendering 8 creative, uncluttered advertisement slides...")
rendered_slides = []

for idx, data in enumerate(slides_data):
    canvas = Image.new("RGB", (W, H), (8, 11, 20))
    accent_color = data["accent"]
    aura_color = data["aura"]
    
    # Ambient glows
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gdraw = ImageDraw.Draw(glow)
    gdraw.ellipse([1200, 80, 1920, 1000], fill=(*aura_color, 80))
    gdraw.ellipse([80, 200, 750, 750], fill=(*aura_color, 35))
    glow = glow.filter(ImageFilter.GaussianBlur(160))
    canvas.paste(Image.alpha_composite(Image.new("RGBA", (W, H), (8, 11, 20, 255)), glow).convert("RGB"))
    
    # Header Brand Icon
    if app_icon:
        canvas_rgba = canvas.convert("RGBA")
        canvas_rgba.paste(app_icon, (100, 70), app_icon)
        canvas = canvas_rgba.convert("RGB")
        
    draw = ImageDraw.Draw(canvas)
    
    # Brand title
    draw.text((172, 73), "DoseSaathi", font=brand_font, fill=(255, 255, 255))
    draw.text((172, 108), "OPEN-SOURCE MEDICATION COMPANION", font=brand_sub_font, fill=(100, 116, 139))
    
    # Step counter pill
    draw.rounded_rectangle([1120, 76, 1220, 114], radius=19, fill=(18, 24, 38), outline=(40, 52, 75), width=1)
    counter_str = f"0{idx + 1} / 0{num_slides}"
    draw.text((1142, 84), counter_str, font=step_font, fill=accent_color)
    
    # Category Tag Pill
    tag_str = data["tag"]
    tb = draw.textbbox((0, 0), tag_str, font=tag_font)
    tw = tb[2] - tb[0] + 46
    th = tb[3] - tb[1] + 16
    draw.rounded_rectangle([100, 210, 100 + tw, 210 + th], radius=10, fill=(14, 28, 35), outline=accent_color, width=1)
    draw.ellipse([116, 222, 126, 232], fill=accent_color)
    draw.text((134, 218), tag_str, font=tag_font, fill=accent_color)
    
    # Big Bold Hero Headline (2 lines)
    draw.text((100, 280), data["h1"], font=hero_font, fill=(255, 255, 255))
    draw.text((100, 350), data["h2"], font=hero_font, fill=accent_color)
    
    # Clear Subtitle
    draw.text((100, 440), data["subtitle"], font=sub_font, fill=(160, 175, 195))
    
    # 3 Sleek, Single-Line Bullets
    card_y = 520
    for b_title, b_desc in data["bullets"]:
        draw.rounded_rectangle([100, card_y, 1220, card_y + 76], radius=16, fill=(16, 23, 38), outline=(35, 48, 70), width=1)
        
        # Check circle
        draw.ellipse([122, card_y + 18, 162, card_y + 58], fill=(12, 45, 42), outline=accent_color, width=1)
        draw.text((134, card_y + 26), "✓", font=check_font, fill=accent_color)
        
        # Title + Description
        draw.text((182, card_y + 24), b_title, font=bullet_title_font, fill=(255, 255, 255))
        t_bb = draw.textbbox((0, 0), b_title, font=bullet_title_font)
        t_w = t_bb[2] - t_bb[0]
        sep_x = 182 + t_w + 14
        draw.text((sep_x, card_y + 24), "—  " + b_desc, font=bullet_desc_font, fill=(148, 163, 184))
        
        card_y += 94
        
    # Bottom Chip Tags
    chip_y = 810
    chip_x = 100
    for c in data["chips"]:
        cb = draw.textbbox((0, 0), c, font=chip_font)
        cw_val = cb[2] - cb[0] + 32
        draw.rounded_rectangle([chip_x, chip_y, chip_x + cw_val, chip_y + 40], radius=20, fill=(20, 28, 44), outline=(45, 60, 85), width=1)
        draw.text((chip_x + 16, chip_y + 9), c, font=chip_font, fill=(220, 230, 245))
        chip_x += cw_val + 14
        
    # Segmented Progress Bar
    prog_y = 910
    step_w = 110
    gap = 14
    start_px = 100
    for i in range(num_slides):
        px = start_px + i * (step_w + gap)
        if i == idx:
            draw.rounded_rectangle([px, prog_y, px + step_w, prog_y + 6], radius=3, fill=accent_color)
        else:
            draw.rounded_rectangle([px, prog_y, px + step_w, prog_y + 6], radius=3, fill=(30, 41, 59))
            
    # Clean Footer
    draw.text((100, 945), "Free & Open Source  •  github.com/shibu2000/DoseSaathi", font=footer_font, fill=(100, 116, 139))
    
    # -------------------------------------------------------------
    # SMARTPHONE HARDWARE CHASSIS
    # -------------------------------------------------------------
    shot = Image.open(data["img"]).convert("RGBA")
    shot_scaled = shot.resize((pw, ph), Image.Resampling.LANCZOS)
    shot_scaled.putalpha(smask)
    
    phone_body = Image.new("RGBA", (cw + 20, ch + 10), (0, 0, 0, 0))
    pbdraw = ImageDraw.Draw(phone_body)
    
    # Side hardware buttons
    pbdraw.rounded_rectangle([2, bezel_top + 140, 6, bezel_top + 210], radius=2, fill=(71, 85, 105)) # Vol Up
    pbdraw.rounded_rectangle([2, bezel_top + 230, 6, bezel_top + 300], radius=2, fill=(71, 85, 105)) # Vol Down
    pbdraw.rounded_rectangle([cw + 8, bezel_top + 180, cw + 12, bezel_top + 270], radius=2, fill=(71, 85, 105)) # Power
    
    # Phone Chassis
    pbdraw.rounded_rectangle([6, 0, cw + 6, ch], radius=48, fill=(22, 28, 42), outline=(65, 80, 105), width=3)
    pbdraw.rounded_rectangle([6 + bezel_side - 2, bezel_top - 2, 6 + bezel_side + pw + 2, bezel_top + ph + 2], radius=40, fill=(12, 18, 30))
    
    phone_body.paste(shot_scaled, (6 + bezel_side, bezel_top), shot_scaled)
    
    # Top speaker slit
    spk_w = 48
    spk_x = 6 + (cw - spk_w) // 2
    pbdraw.rounded_rectangle([spk_x, 8, spk_x + spk_w, 12], radius=2, fill=(51, 65, 85))
    
    # Selfie camera
    cam_x = 6 + cw // 2
    cam_y = bezel_top + 14
    pbdraw.ellipse([cam_x - 7, cam_y - 7, cam_x + 7, cam_y + 7], fill=(8, 12, 20), outline=(30, 41, 59), width=1)
    pbdraw.ellipse([cam_x - 2, cam_y - 2, cam_x, cam_y], fill=(30, 58, 138, 180))
    
    # Bottom home bar
    hbar_w = 110
    hbar_x = 6 + (cw - hbar_w) // 2
    pbdraw.rounded_rectangle([hbar_x, bezel_top + ph - 10, hbar_x + hbar_w, bezel_top + ph - 7], radius=2, fill=(148, 163, 184, 180))
    
    # Drop shadow
    phone_x = 1355
    phone_y = (H - ch) // 2
    
    canvas_rgba = canvas.convert("RGBA")
    dshadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(dshadow).rounded_rectangle([phone_x - 14, phone_y + 16, phone_x + cw + 14, phone_y + ch + 28], radius=50, fill=(0, 0, 0, 230))
    dshadow = dshadow.filter(ImageFilter.GaussianBlur(42))
    
    canvas_rgba = Image.alpha_composite(canvas_rgba, dshadow)
    canvas_rgba.paste(phone_body, (phone_x - 6, phone_y), phone_body)
    
    rendered_slides.append(canvas_rgba.convert("RGB"))
    print(f"Rendered slide {idx + 1}/8: {data['h1']} {data['h2']}")

print("All 8 slides rendered successfully!")

# Ensure output directories exist
os.makedirs(os.path.dirname(output_primary), exist_ok=True)
os.makedirs(os.path.dirname(output_secondary), exist_ok=True)

# FFmpeg encoding pipeline
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
    output_primary
]

print("Launching FFmpeg to encode 30-second minimal landscape video...")
proc = subprocess.Popen(ffmpeg_cmd, stdin=subprocess.PIPE)

t0 = time.time()
frame_count = 0

for slide_idx in range(num_slides):
    curr_slide = rendered_slides[slide_idx]
    next_slide = rendered_slides[(slide_idx + 1) % num_slides]
    
    if slide_idx == num_slides - 1:
        slide_frames = total_frames - frame_count
    else:
        slide_frames = frames_per_slide
        
    static_frames = slide_frames - TRANSITION_FRAMES
    
    # Static frames
    curr_bytes = curr_slide.tobytes()
    for _ in range(static_frames):
        proc.stdin.write(curr_bytes)
        frame_count += 1
        
    # Crossfade transition
    for t in range(TRANSITION_FRAMES):
        if slide_idx == num_slides - 1:
            # Subtle fade out at video end
            alpha = (t + 1) / TRANSITION_FRAMES
            frame_img = Image.blend(curr_slide, Image.new("RGB", (W, H), (8, 11, 20)), alpha)
        else:
            alpha = (t + 1) / TRANSITION_FRAMES
            frame_img = Image.blend(curr_slide, next_slide, alpha)
        proc.stdin.write(frame_img.tobytes())
        frame_count += 1

proc.stdin.close()
proc.wait()

print(f"Video created in {time.time() - t0:.2f}s! Total frames: {frame_count}")

# Copy to secondary output location
import shutil
shutil.copy2(output_primary, output_secondary)
print(f"Copied to {output_secondary}")
print("Creative landscape showcase video generation COMPLETE!")
