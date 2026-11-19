import os
import subprocess
import time
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H = 1920, 1080
FPS = 30
TRANSITION_FRAMES = 12

# Fonts
bold_font_path = "node_modules/.bun/@expo-google-fonts+atkinson-hyperlegible-next@0.4.1/node_modules/@expo-google-fonts/atkinson-hyperlegible-next/700Bold/AtkinsonHyperlegibleNext_700Bold.ttf"
med_font_path = "node_modules/.bun/@expo-google-fonts+atkinson-hyperlegible-next@0.4.1/node_modules/@expo-google-fonts/atkinson-hyperlegible-next/500Medium/AtkinsonHyperlegibleNext_500Medium.ttf"
sym_font_path = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

title_font = ImageFont.truetype(bold_font_path, 44)
brand_font = ImageFont.truetype(bold_font_path, 30)
tag_font = ImageFont.truetype(bold_font_path, 17)
slide_num_font = ImageFont.truetype(bold_font_path, 17)
sub_font = ImageFont.truetype(med_font_path, 23)
bullet_bold = ImageFont.truetype(bold_font_path, 22)
bullet_font = ImageFont.truetype(med_font_path, 20)
check_font = ImageFont.truetype(sym_font_path, 20)
footer_font = ImageFont.truetype(med_font_path, 19)
stat_val_font = ImageFont.truetype(bold_font_path, 20)
stat_lbl_font = ImageFont.truetype(med_font_path, 15)

slides_data = [
    {
        "img": "/home/shibu-dhara/Pictures/dosesaathi-screenshots/1.jpg",
        "tag": "OPEN-SOURCE MEDICATION CARE",
        "tag_color": (0, 160, 130),
        "aura_color": (0, 115, 95),
        "title": "Welcome to DoseSaathi",
        "subtitle": "A calm, private & distraction-free medicine companion designed for peace of mind.",
        "points": [
            ("Built for Real-World Care", "Designed with empathy for patients, elderly seniors, and busy families"),
            ("Zero Distractions or Clutter", "No ads, no popups, no tracking cookies, and no product recommendations"),
            ("Fast & Responsive Native Core", "Built with React Native 0.81, TypeScript, and high-performance Kotlin"),
            ("100% Free & Open Source", "Full code transparency, community longevity, and auditability on GitHub")
        ],
        "features": [
            ("Zero Cloud Dependency", "100% Local Device Storage"),
            ("Native Android Alarms", "Over-Lockscreen Wake Support"),
            ("Privacy Preserved", "Zero Account Registration Needed")
        ]
    },
    {
        "img": "/home/shibu-dhara/Pictures/dosesaathi-screenshots/2.jpg",
        "tag": "OFFLINE-FIRST PRIVACY",
        "tag_color": (139, 92, 246),
        "aura_color": (107, 70, 193),
        "title": "Your Health Data Stays Yours",
        "subtitle": "Complete offline autonomy with zero surveillance and zero third-party tracking.",
        "points": [
            ("Local SQLite Architecture", "Regimens, logs, and sensitive notes stay strictly on your device"),
            ("Zero Account Requirement", "No phone numbers, email signups, or profiling ever required"),
            ("Operates Anywhere", "Full functionality in flight mode, rural areas, or during network outages"),
            ("Zero Data Monetization", "Never sells or aggregates user telemetry, prescriptions, or routines")
        ],
        "features": [
            ("Encrypted SQLite", "100% Local Storage"),
            ("Zero Tracking", "No Analytics or SDK Cookies"),
            ("Patient Ownership", "Export or Erase Data Anytime")
        ]
    },
    {
        "img": "/home/shibu-dhara/Pictures/dosesaathi-screenshots/3.jpg",
        "tag": "UNMISSABLE MEDICINE ALARMS",
        "tag_color": (0, 160, 130),
        "aura_color": (0, 115, 95),
        "title": "Clear Daily Adherence at a Glance",
        "subtitle": "Never miss a critical dose in everyday notification clutter.",
        "points": [
            ("Over-Lockscreen Alarms", "Native Android Kotlin module wakes your phone even in deep Doze mode"),
            ("1-Tap Instant Confirmation", "Mark taken or snooze directly with a single large, accessible tap"),
            ("5-Minute Safety Undo", "Quick rollback protects logs if a dose button is accidentally touched"),
            ("Sequential Dose Logic", "Dependent medication timers start only after the primary dose is taken")
        ],
        "features": [
            ("Reliable Wake Alarms", "Foreground Kotlin Alarms"),
            ("1-Tap Quick Action", "Mark Taken, Skip or Snooze"),
            ("Safety Undo Window", "Protects Adherence Records")
        ]
    },
    {
        "img": "/home/shibu-dhara/Pictures/dosesaathi-screenshots/4.jpg",
        "tag": "COMPREHENSIVE REGIMENS",
        "tag_color": (245, 158, 11),
        "aura_color": (217, 119, 6),
        "title": "Effortless Complex Regimens",
        "subtitle": "Handles multi-dose timings, dosage forms, meal instructions, and stock counts.",
        "points": [
            ("Versatile Form Support", "Native handling for tablets, capsules, drops, syrups, and injections"),
            ("Meal-Relative Timing", "Clear Before Meal, With Meal, or After Meal instructions"),
            ("Low-Stock Inventory Alerts", "Warns you in advance before your prescription runs out"),
            ("Cyclical & As-Needed (PRN)", "Supports recurring cycles (e.g. 21-day on / 7-day off) and SOS doses")
        ],
        "features": [
            ("Multi-Form Support", "Tablets, Liquids & Injections"),
            ("Smart Food Logic", "Before, With or After Food"),
            ("Inventory Watch", "Automatic Refill Warnings")
        ]
    },
    {
        "img": "/home/shibu-dhara/Pictures/dosesaathi-screenshots/5.jpg",
        "tag": "INTUITIVE 4-STEP WIZARD",
        "tag_color": (129, 140, 248),
        "aura_color": (79, 70, 229),
        "title": "Adding Medicines Made Simple",
        "subtitle": "A clean, progressive wizard makes creating elaborate schedules effortless.",
        "points": [
            ("Step-by-Step Guidance", "Broken into manageable steps with immediate visual previews"),
            ("Customizable Reminders", "Tailor vibration patterns, audio companion chimes, and snooze delays"),
            ("Refill Reminders", "Automatic pill count tracking keeps your medicine cabinet stocked"),
            ("Strict Input Validation", "Prevents duplicate dose times and invalid scheduling conflicts")
        ],
        "features": [
            ("Guided Onboarding", "4 Straightforward Steps"),
            ("Custom Audio Chimes", "Pleasant Gentle Soundscapes"),
            ("Conflict Prevention", "Smart Schedule Validation")
        ]
    },
    {
        "img": "/home/shibu-dhara/Pictures/dosesaathi-screenshots/6.jpg",
        "tag": "EPHEMERAL CAREGIVER SYNC",
        "tag_color": (20, 184, 166),
        "aura_color": (13, 148, 136),
        "title": "Connect With Loved Ones Instantly",
        "subtitle": "Share adherence visibility safely without passwords, phone numbers, or cloud lock-in.",
        "points": [
            ("6-Digit Ephemeral Codes", "Temporary 15-minute pairing code eliminates account management"),
            ("Cloudflare Workers + D1", "Lightweight, edge-hosted serverless architecture for blazing speed"),
            ("Encrypted Sync Payload", "Adherence logs sync securely over modern end-to-end TLS channels"),
            ("One-Way or Multi-Device", "Keep family members updated without giving up device autonomy")
        ],
        "features": [
            ("No Passwords Needed", "15-Min Ephemeral Pairing"),
            ("Edge Architecture", "Cloudflare Workers & D1"),
            ("Encrypted Sync", "Secure Over-the-Wire Payloads")
        ]
    },
    {
        "img": "/home/shibu-dhara/Pictures/dosesaathi-screenshots/7.jpg",
        "tag": "INCLUSIVE ACCESSIBILITY & THEMES",
        "tag_color": (244, 63, 94),
        "aura_color": (225, 29, 72),
        "title": "Bespoke Appearance & Calming Themes",
        "subtitle": "Engineered for seniors and low-vision users with maximum clarity and soothing colors.",
        "points": [
            ("Atkinson Hyperlegible Font", "Designed by the Braille Institute to prevent letter confusion"),
            ("4 Calming Color Palettes", "Midnight Teal, Lavender Calm, Rose Quartz, and Slate Contrast"),
            ("Dynamic Launcher Icons", "Changes your phone home-screen icon to match your chosen aesthetic"),
            ("Large Touch Targets", "Generous button padding and high-contrast typography reduce tap errors")
        ],
        "features": [
            ("Braille Institute Font", "Atkinson Hyperlegible"),
            ("4 Curated Palettes", "Teal, Lavender, Rose & Slate"),
            ("Adaptive Launcher Icons", "Dynamic Android Theming")
        ]
    },
    {
        "img": "/home/shibu-dhara/Pictures/dosesaathi-screenshots/8.jpg",
        "tag": "CAREGIVER REASSURANCE HUB",
        "tag_color": (16, 185, 129),
        "aura_color": (5, 150, 105),
        "title": "Peace of Mind for Families",
        "subtitle": "Stay reassured about your parents' and loved ones' daily health from anywhere.",
        "points": [
            ("Remote Adherence Status", "Check if morning or night doses were taken on time in real-time"),
            ("Missed Dose Visibility", "Get prompt awareness when doses remain pending past due times"),
            ("Multiple Loved Ones", "Manage and view profiles for parents, children, or elderly relatives"),
            ("Respectful Privacy Boundaries", "Only adherence status is shared—no invasive location or tracking")
        ],
        "features": [
            ("Remote Caregiver View", "Real-Time Adherence Status"),
            ("Multi-Profile Support", "Manage Family from One View"),
            ("Gentle Reassurance", "Stay Connected Respectfully")
        ]
    }
]

# Audio path and duration
audio_path = "apps/mobile/android/app/src/main/res/raw/medchain_reminder_companion_female.ogg"
output_primary = "/home/shibu-dhara/Pictures/dosesaathi-screenshots/dosesaathi-showcase-landscape.mp4"
output_secondary = "/home/shibu-dhara/Developer/DoseSaathi/build-output/dosesaathi-showcase-landscape.mp4"

probe_cmd = ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", audio_path]
audio_duration = float(subprocess.check_output(probe_cmd).decode().strip())
print(f"Audio duration: {audio_duration:.2f}s")

total_frames = int(audio_duration * FPS)
num_slides = len(slides_data)
frames_per_slide = total_frames // num_slides
print(f"Total frames: {total_frames}, Slides: {num_slides}, Frames per slide: {frames_per_slide}")

# Pre-render phone chassis helper
pw = 420
ph = int(pw * (2436 / 1080)) # ~947px
bezel_side = 13
bezel_top = 18
bezel_bottom = 18
cw = pw + bezel_side * 2
ch = ph + bezel_top + bezel_bottom

# Prepare icon
icon_size = 64
app_icon = None
if os.path.exists("assets/icon.png"):
    app_icon = Image.open("assets/icon.png").convert("RGBA").resize((icon_size, icon_size), Image.Resampling.LANCZOS)
    imask = Image.new("L", (icon_size, icon_size), 0)
    ImageDraw.Draw(imask).rounded_rectangle([0, 0, icon_size, icon_size], radius=16, fill=255)
    app_icon.putalpha(imask)

# Screen mask for phones
smask = Image.new("L", (pw, ph), 0)
ImageDraw.Draw(smask).rounded_rectangle([0, 0, pw, ph], radius=36, fill=255)

# Render base slide images
print("Pre-rendering 8 advertisement slides in 1080p landscape...")
rendered_slides = []

for idx, data in enumerate(slides_data):
    canvas = Image.new("RGB", (W, H), (10, 15, 29))
    
    # Ambient glows
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gdraw = ImageDraw.Draw(glow)
    aura_rgb = data["aura_color"]
    # Right phone glow
    gdraw.ellipse([1250, 100, 1900, 980], fill=(*aura_rgb, 75))
    # Left soft ambient aura
    gdraw.ellipse([100, 200, 800, 800], fill=(*aura_rgb, 30))
    glow = glow.filter(ImageFilter.GaussianBlur(150))
    canvas.paste(Image.alpha_composite(Image.new("RGBA", (W, H), (10, 15, 29, 255)), glow).convert("RGB"))
    
    # Header Icon
    if app_icon:
        canvas_rgba = canvas.convert("RGBA")
        canvas_rgba.paste(app_icon, (90, 55), app_icon)
        canvas = canvas_rgba.convert("RGB")
        
    draw = ImageDraw.Draw(canvas)
    
    # Brand Name & Subtitle badge
    draw.text((170, 58), "DoseSaathi", font=brand_font, fill=(255, 255, 255))
    
    brand_sub = "OFFLINE-FIRST MEDICINE COMPANION"
    bs_font = ImageFont.truetype(bold_font_path, 13)
    bs_bbox = draw.textbbox((0, 0), brand_sub, font=bs_font)
    bs_w = bs_bbox[2] - bs_bbox[0] + 20
    draw.rounded_rectangle([170, 96, 170 + bs_w, 122], radius=6, fill=(15, 45, 40), outline=(0, 160, 130), width=1)
    draw.text((180, 100), brand_sub, font=bs_font, fill=(52, 211, 153))
    
    # Slide counter pill
    counter_text = f"0{idx + 1} / 0{num_slides}"
    draw.rounded_rectangle([1160, 62, 1260, 94], radius=8, fill=(20, 28, 45), outline=(51, 65, 85), width=1)
    draw.text((1176, 68), counter_text, font=slide_num_font, fill=(148, 163, 184))
    
    # Slide Tag Pill
    tag_str = data["tag"]
    tb_font = tag_font
    tb_bbox = draw.textbbox((0, 0), tag_str, font=tb_font)
    tb_w = tb_bbox[2] - tb_bbox[0] + 32
    tb_h = tb_bbox[3] - tb_bbox[1] + 16
    draw.rounded_rectangle([90, 160, 90 + tb_w, 160 + tb_h], radius=10, fill=(18, 26, 42), outline=data["tag_color"], width=2)
    draw.text((106, 168), tag_str, font=tb_font, fill=data["tag_color"])
    
    # Headline & Subtitle
    draw.text((90, 220), data["title"], font=title_font, fill=(255, 255, 255))
    draw.text((90, 285), data["subtitle"], font=sub_font, fill=(148, 163, 184))
    
    # 4 Advantage Cards
    card_w = 1170
    card_h = 88
    gap = 14
    y_pos = 350
    
    for c_title, c_desc in data["points"]:
        draw.rounded_rectangle([90, y_pos, 90 + card_w, y_pos + card_h], radius=16, fill=(18, 26, 42), outline=(42, 54, 76), width=1)
        
        # Checkmark circle badge
        circle_d = 40
        cx = 112
        cy = y_pos + (card_h - circle_d) // 2
        draw.ellipse([cx, cy, cx + circle_d, cy + circle_d], fill=(13, 75, 65), outline=(0, 160, 130), width=1)
        draw.text((cx + 12, cy + 8), "✓", font=check_font, fill=(52, 211, 153))
        
        draw.text((172, y_pos + 18), c_title, font=bullet_bold, fill=(255, 255, 255))
        draw.text((172, y_pos + 48), c_desc, font=bullet_font, fill=(148, 163, 184))
        
        y_pos += card_h + gap
        
    # Feature Badges Bar
    badges_y = 780
    draw.line([(90, badges_y), (90 + card_w, badges_y)], fill=(30, 41, 59), width=1)
    
    badge_box_w = 370
    for b_idx, (f_title, f_sub) in enumerate(data["features"]):
        bx = 90 + b_idx * (badge_box_w + 30)
        by = badges_y + 16
        draw.rounded_rectangle([bx, by, bx + badge_box_w, by + 60], radius=10, fill=(15, 23, 38), outline=(33, 46, 68), width=1)
        draw.ellipse([bx + 16, by + 24, bx + 28, by + 36], fill=(52, 211, 153))
        draw.text((bx + 38, by + 12), f_title, font=stat_val_font, fill=(241, 245, 249))
        draw.text((bx + 38, by + 35), f_sub, font=stat_lbl_font, fill=(100, 116, 139))
        
    # Bottom Slide Indicator Dots
    dot_y = 905
    start_dot_x = 90
    curr_x = start_dot_x
    for i in range(num_slides):
        if i == idx:
            draw.rounded_rectangle([curr_x, dot_y, curr_x + 36, dot_y + 10], radius=5, fill=(52, 211, 153))
            curr_x += 46
        else:
            draw.ellipse([curr_x, dot_y + 1, curr_x + 8, dot_y + 9], fill=(51, 65, 85))
            curr_x += 20
            
    # Footer
    footer_text = "github.com/shibu2000/DoseSaathi  •  Free & Open Source Medication Management"
    draw.text((90, 940), footer_text, font=footer_font, fill=(100, 116, 139))
    
    # -------------------------------------------------------------
    # BUILD SMARTPHONE HARDWARE CHASSIS ON RIGHT SIDE
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
    pbdraw.rounded_rectangle([6, 0, cw + 6, ch], radius=46, fill=(24, 32, 47), outline=(71, 85, 105), width=3)
    pbdraw.rounded_rectangle([6 + bezel_side - 2, bezel_top - 2, 6 + bezel_side + pw + 2, bezel_top + ph + 2], radius=38, fill=(15, 23, 42))
    
    # Screen
    phone_body.paste(shot_scaled, (6 + bezel_side, bezel_top), shot_scaled)
    
    # Top speaker slit
    spk_w = 48
    spk_x = 6 + (cw - spk_w) // 2
    pbdraw.rounded_rectangle([spk_x, 8, spk_x + spk_w, 12], radius=2, fill=(51, 65, 85))
    
    # Selfie camera punch hole
    cam_x = 6 + cw // 2
    cam_y = bezel_top + 14
    pbdraw.ellipse([cam_x - 7, cam_y - 7, cam_x + 7, cam_y + 7], fill=(8, 12, 20), outline=(30, 41, 59), width=1)
    pbdraw.ellipse([cam_x - 2, cam_y - 2, cam_x, cam_y], fill=(30, 58, 138, 180))
    
    # Bottom home gesture bar
    hbar_w = 110
    hbar_x = 6 + (cw - hbar_w) // 2
    pbdraw.rounded_rectangle([hbar_x, bezel_top + ph - 10, hbar_x + hbar_w, bezel_top + ph - 7], radius=2, fill=(148, 163, 184, 180))
    
    # Drop shadow
    phone_x = 1370
    phone_y = (H - ch) // 2
    
    canvas_rgba = canvas.convert("RGBA")
    dshadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(dshadow).rounded_rectangle([phone_x - 14, phone_y + 16, phone_x + cw + 14, phone_y + ch + 28], radius=50, fill=(0, 0, 0, 220))
    dshadow = dshadow.filter(ImageFilter.GaussianBlur(40))
    
    canvas_rgba = Image.alpha_composite(canvas_rgba, dshadow)
    canvas_rgba.paste(phone_body, (phone_x - 6, phone_y), phone_body)
    
    rendered_slides.append(canvas_rgba.convert("RGB"))
    print(f"Rendered slide {idx + 1}/8: {data['title']}")

print("All 8 slides rendered successfully!")

# Ensure output directory exists
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

print("Launching FFmpeg to encode 1080p landscape promotional video...")
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
            alpha = (t + 1) / TRANSITION_FRAMES
            frame_img = Image.blend(curr_slide, Image.new("RGB", (W, H), (10, 15, 29)), alpha)
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
print("Landscape advert showcase video generation COMPLETE!")
