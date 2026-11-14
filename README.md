# DoseSaathi (दोस साथी) 💊🌱
### A Warm, Trustworthy Family-Connected Medicine Companion

[![License: MIT](https://img.shields.io/badge/License-MIT-teal.svg)](https://opensource.org/licenses/MIT)
[![Release](https://img.shields.io/badge/Release-v1.0.3-006156.svg)](https://github.com/shibu2000/DoseSaathi/releases/latest)
[![Platform](https://img.shields.io/badge/Platform-Android%20%7C%20iOS-brightgreen.svg)]()
[![Architecture](https://img.shields.io/badge/Offline--First-SQLite%20%2B%20Exact%20Alarms-25845D.svg)]()
[![Monorepo](https://img.shields.io/badge/Built%20with-React%20Native%20%7C%20Expo%20%7C%20Bun-orange.svg)]()

> **DoseSaathi** is a modern, accessible, family-connected medicine reminder application. Designed specifically with a **Modern Clinical + Warm Human** aesthetic, it bridges clinical precision with elderly-friendly accessibility—empowering individuals to stay consistent with their treatments while allowing trusted family caregivers to stay connected remotely without invading privacy.

---

## 📥 Direct Downloads & Latest Builds (v1.0.3)

Download the pre-compiled production packages directly from the [GitHub Releases](https://github.com/shibu2000/DoseSaathi/releases/latest):

| Package | Platform | Target Architecture | Size | Who is this for? | Download Link |
|:---|:---|:---|:---|:---|:---:|
| **`dosesaathi-arm64-v8a-release.apk`** | Android | `arm64-v8a` | **46 MB** | **⭐ Recommended for 99% of Android phones** (Samsung, Pixel, OnePlus, Xiaomi, Vivo, Oppo, Realme, Motorola, etc.). Fastest performance and smallest download size. | [⬇️ Download APK](https://github.com/shibu2000/DoseSaathi/releases/latest/download/dosesaathi-arm64-v8a-release.apk) |
| **`dosesaathi-universal-release.apk`** | Android | All (Universal) | **126 MB** | Universal compatibility for any Android device, older architectures, custom ROMs, or if you are unsure of your processor. | [⬇️ Download APK](https://github.com/shibu2000/DoseSaathi/releases/latest/download/dosesaathi-universal-release.apk) |
| **`dosesaathi-armeabi-v7a-release.apk`** | Android | `armeabi-v7a` | **37 MB** | For older 32-bit legacy Android smartphones (released before 2017). | [⬇️ Download APK](https://github.com/shibu2000/DoseSaathi/releases/latest/download/dosesaathi-armeabi-v7a-release.apk) |
| **`dosesaathi-x86_64-release.apk`** | Android | `x86_64` | **48 MB** | For Android Studio emulators and ChromeOS/PC Android environments. | [⬇️ Download APK](https://github.com/shibu2000/DoseSaathi/releases/latest/download/dosesaathi-x86_64-release.apk) |
| **`DoseSaathi-Simulator.zip`** | iOS | Simulator (x86_64 / arm64) | **~35 MB** | For macOS iOS Simulator testing. Unzip and drag `DoseSaathi.app` directly into Xcode Simulator. | [⬇️ Download ZIP](https://github.com/shibu2000/DoseSaathi/releases/latest/download/DoseSaathi-Simulator.zip) |
| **`DoseSaathi-Unsigned.ipa`** | iOS | Physical iPhone | **~35 MB** | For physical iPhones via sideloading (AltStore, Sideloadly, TrollStore, or free personal Xcode signing). | [⬇️ Download IPA](https://github.com/shibu2000/DoseSaathi/releases/latest/download/DoseSaathi-Unsigned.ipa) |

---

## ✨ Key Capabilities & Highlights

### 🎨 Modern Clinical + Warm Human Design
- **4 Signature Colorways**:
  - 🌿 **Nature Green** (`#006156`) — Calm forest teal and gentle highlights (Default).
  - 🌊 **Ocean Blue** (`#186594`) — Crisp, clinical, and clean modern aesthetic.
  - 🌅 **Sunset Warm** (`#9E5716`) — Warm, friendly, and approachable terracotta tones.
  - 🪻 **Lavender Calm** (`#5B4D82`) — Soft, comfortable amethyst and lavender glow.
- **Dynamic Phone Launcher App Icons**: Changing the appearance inside Settings immediately updates the app's launcher icon outside the app on your Android home screen and app drawer using native `<activity-alias>` switching.
- **Elderly-Friendly Accessibility**: High-contrast typography scale (up to 32px headings), generous touch targets (≥56px), Dynamic Type font scaling, and zero tiny unreadable text.
- **True Dark Mode**: Seamless high-contrast dark surfaces across all dashboard cards, modals, time selectors, unit pickers, and family pairing sheets.

### ⏰ Mission-Critical Offline Alarms & Full-Screen Alerts
- **100% Offline-First Architecture**: Your medicines, schedules, and dose records are stored safely in an encrypted local SQLite database.
- **Reliable Wake-Lock Alarms**: Uses Android's `AlarmManager.setExactAndAllowWhileIdle()` and Full-Screen Intents (`USE_FULL_SCREEN_INTENT`) to ring over the lock screen even during battery optimization, Doze mode, or offline conditions.
- **Gentle Spoken Announcements**: Voice announcements in warm female or calm male voice (*"It's time for your medicine."*) paired with gentle chimes and vibration.
- **Device Reboot Resilience**: Native `BOOT_COMPLETED` receiver automatically restores and reconciles all scheduled alarms upon phone reboot without opening the app or needing an internet connection.

### 📱 Android Home Screen Live Widget
- Displays the **Next Upcoming Dose**, prescribed dosage quantity, and scheduled time.
- Features a **live minute-by-minute countdown ticker** (e.g., *In 24 mins*, *Due now*, *Snoozed 10m*).
- Adapts dynamically to the active color theme (Nature, Ocean, Sunset, Lavender).

### 👨‍👩‍👧‍👦 Privacy-First Family & Caregiver Sync
- **No Passwords or Accounts Required**: Patients generate a secure 6-digit pairing code or QR code to share schedule visibility with loved ones.
- **Granular Access Control**: Patients choose exactly what caregivers can see or edit (read-only vs. plan management). Access can be revoked instantly at any time.
- **Zero Cloud Dependence**: If the internet is disconnected, local medicine reminders and adherence records continue uninterrupted.

---

## 🛠️ Repository Architecture

DoseSaathi is built as a high-performance monorepo powered by **Bun**:

```
medchain/
├── apps/
│   ├── mobile/                    # React Native Expo mobile application
│   │   ├── app/                   # File-based routing (Expo Router)
│   │   │   ├── (patient)/         # Patient personal dashboard, medicines, family tabs
│   │   │   ├── (caregiver)/       # Caregiver multi-person management views
│   │   │   ├── alarm/             # Full-screen over-lockscreen alarm UI
│   │   │   ├── medicine/          # 4-step medicine creation wizard
│   │   │   └── settings/          # Appearance, voices, profile & system permissions
│   │   ├── assets/                # Themed app icons, illustrations & voice chimes
│   │   ├── modules/medchain-alarm # Native Kotlin Android module for exact alarms & widgets
│   │   └── src/
│   │       ├── alarms/            # Native alarm scheduler & reboot reconciliation
│   │       ├── components/        # Reusable design system components
│   │       ├── database/          # SQLite database migrations & repositories
│   │       └── theme/             # Centralized ThemeContext & semantic tokens
│   └── api/                       # Cloudflare Workers pairing & caregiver sync server
├── packages/
│   ├── domain/                    # Pure TypeScript scheduling & timezone domain logic
│   └── contracts/                 # Shared data models, validation schemas & DTOs
└── dosesaathi-*.apk               # Compiled release packages
```

---

## 🚀 Local Development Setup

### Prerequisites
- [Bun](https://bun.sh/) (v1.2+)
- [Node.js](https://nodejs.org/) (v18+)
- Android Studio & Android SDK (API 34+)
- Xcode 15+ (for macOS iOS builds)

### 1. Install Dependencies
```bash
git clone https://github.com/shibu2000/DoseSaathi.git
cd DoseSaathi
bun install
```

### 2. Run Test Suites
Run the 205 monorepo unit and integration tests:
```bash
bun test
```

### 3. Start Development Server
```bash
cd apps/mobile
bun run start
```

### 4. Build Android Release APK Locally
```bash
cd apps/mobile/android
./gradlew assembleRelease
```
Compiled APKs will be generated under `apps/mobile/android/app/build/outputs/apk/release/`.

---

## 🔒 Privacy & Security Standards

- **Local-First Data Ownership**: Medicine data never leaves your device unless explicitly shared via family pairing.
- **Zero Third-Party Trackers**: No third-party behavioral analytics, advertising SDKs, or data brokers.
- **Medical Precision**: Strict compliance with medical schedule calculation (fixed-interval, dependent-dose chaining, cycle on/off rules, and atomic 5-minute undo windows).

---

## 📄 License

DoseSaathi is licensed under the [MIT License](LICENSE).
