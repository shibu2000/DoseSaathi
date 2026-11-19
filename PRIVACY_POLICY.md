# Privacy Policy for DoseSaathi

**Effective Date:** November 19, 2026  
**Application ID:** `com.dosesaathi.app`  
**Developer:** Shibu Dhara  
**Hosted Policy URL:** [https://shibu2000.github.io/DoseSaathi/privacy](https://shibu2000.github.io/DoseSaathi/privacy)

---

## 1. Introduction & Core Philosophy
**DoseSaathi** is an open-source, privacy-first medication reminder and adherence companion designed for patients, seniors, and caregivers.

We believe that personal medical information is private and sacred. **DoseSaathi is built as an offline-first application.** 
- **100% Offline Local Storage:** All medication schedules, adherence logs, notes, and counts are kept in an encrypted SQLite database on your personal device.
- **Zero Account Requirement:** We do not ask for phone numbers, email addresses, names, or passwords.
- **Zero Commercial Trackers:** No advertising networks, analytics SDKs, or data brokers are integrated into this application.
- **No Data Monetization:** We never sell, rent, or trade user data.

---

## 2. Information Handled by DoseSaathi

### Information Stored Locally on Your Device
- **Medications:** Name, dosage forms (tablets, drops, syrups, injections), strength, meal-relative instructions (before/with/after meals), and pill counts.
- **Schedules:** Daily scheduled times, dose intervals, and cyclical schedules (e.g., 21-day regimens).
- **Adherence History:** Timestamps when doses are confirmed taken, snoozed, or skipped.
- **Preferences:** User-selected themes, audio chime choices, and accessibility configurations.

### Information We Never Collect
- No personal identifiers (name, email, phone number, address, or government ID).
- No financial or credit card information.
- No location, GPS, or biometric sensor tracking.

---

## 3. Android Device Permissions & Usage

Every permission requested by DoseSaathi is strictly necessary for critical medicine alarm functionality:

| Permission | Android Identifier | Purpose |
|---|---|---|
| **Exact Alarms** | `SCHEDULE_EXACT_ALARM` | Guarantees medication reminders ring at the exact minute scheduled without delay from Android power management. |
| **Full-Screen Alert** | `USE_FULL_SCREEN_INTENT` | Displays the full-screen medication confirmation screen over the lockscreen when a dose is due. |
| **Post Notifications** | `POST_NOTIFICATIONS` | Required on Android 13+ to deliver dose reminders, snooze alerts, and inventory refill notifications. |
| **Wake CPU** | `WAKE_LOCK` | Briefly wakes the device processor to ring sound and vibrate when an alarm triggers while the phone is asleep. |
| **Foreground Service** | `FOREGROUND_SERVICE` | Keeps the alarm service active and audible until the user marks the dose as taken, snoozed, or skipped. |
| **Run at Startup** | `RECEIVE_BOOT_COMPLETED` | Automatically reschedules upcoming medication reminders when the phone restarts or reboots. |
| **Vibration** | `VIBRATE` | Provides tactile haptic feedback during alarms so users in noisy environments do not miss doses. |
| **Battery Exemption** | `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` | Optional prompt to prevent device OEM aggressive battery killers from muting or killing background alarms. |
| **Camera (Optional)** | `CAMERA` | Used solely on-demand to scan a family caregiver's pairing QR code. No photos or video recordings are saved or transmitted. |

---

## 4. Optional Family Caregiver Sync Feature
DoseSaathi provides an optional family link feature that lets family members monitor adherence remotely:
- **15-Minute Ephemeral Pairing:** Connected via a temporary 6-digit numeric pairing code or QR code that expires in 15 minutes. No permanent accounts exist.
- **Minimal Sync Payload:** Only adherence status timestamps (taken, missed, skipped) and medicine display names are synced.
- **Edge Architecture:** Handled via serverless Cloudflare Workers and an encrypted Cloudflare D1 database over HTTPS/TLS 1.3.
- **Full Revocation:** Either device can unpair at any time in the app settings, which immediately purges the active pairing session.

---

## 5. Third-Party Services & Advertisements
- **Zero Advertisements:** No ads or promotional banners.
- **Zero Third-Party Trackers:** No Google Analytics, Firebase Analytics, Meta Pixel, or marketing SDKs.
- **No Data Sharing:** Your data is never sold or shared with insurers, medical companies, or data brokers.

---

## 6. Data Retention & Deletion
- All data resides on your physical device.
- You can clear all data anytime via Android *Settings > Apps > DoseSaathi > Storage > Clear Storage*, or by uninstalling the app.
- Uninstalling the app permanently purges all local SQLite database records.

---

## 7. Security Safeguards
- Android application sandboxing isolates local database storage from other installed apps.
- All remote traffic for optional family sync uses TLS 1.3 encryption.
- Full code auditability and transparency as open-source software on GitHub.

---

## 8. Children's Privacy
DoseSaathi is not intended for unsupervised use by children under 13. Any medication management for children should be managed directly by parents or legal caregivers.

---

## 9. Contact Information
For any questions regarding this Privacy Policy or DoseSaathi:
- **Developer:** Shibu Dhara
- **Email:** [shibudhara420@gmail.com](mailto:shibudhara420@gmail.com)
- **GitHub Repository:** [https://github.com/shibu2000/DoseSaathi](https://github.com/shibu2000/DoseSaathi)
- **Issue Tracker:** [https://github.com/shibu2000/DoseSaathi/issues](https://github.com/shibu2000/DoseSaathi/issues)
