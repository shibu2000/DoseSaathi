# Software Requirements Specification (SRS)

**Project Name:** MedChain (Working Title) — Offline-First Personal & Remote Family Medication Manager  
**Architecture Paradigm:** Offline-First Local Execution with Push-Triggered State Sync  
**Target Platforms:** Android & iOS (React Native + Native AlarmManager / Notifee)

---

## 1. Executive Summary & Problem Statement

Medication non-adherence affects both busy working individuals taking daily supplements or prescriptions and elderly patients managed by family members. Existing medication reminder applications fail across five core areas:

* **Notification Blindness:** Standard push notifications chime once and sit quietly in the notification shade, where users easily swipe them away during meetings or daily chores and forget to take the dose.
* **Intra-Day Sequential (Chained) Dose Failure:** Certain medications require strict time gaps relative to another medicine on the same day (for example, taking Medicine B exactly 30 minutes after Medicine A). Static clock alarms (08:00 AM and 08:30 AM) break whenever the user wakes up late or takes the first dose at 08:45 AM.
* **Multi-Day Course Transition Failure (Regimen Phases):** Doctors frequently prescribe short-course medications (such as an antibiotic or steroid, Medicine A, for 3, 4, or 7 days) followed by recovery or maintenance medications (Medicines B, C, and D) that must start *only after* Medicine A finishes and stops. Existing apps force users to manually delete Medicine A and program Medicines B, C, and D mid-treatment, leading to dangerous overlapping doses or forgotten second-phase treatments.
* **Passive Caregiver Tools:** Mainstream apps only notify family members *after* a relative misses a dose ("Medfriend" alerts) rather than allowing a son, daughter, or caregiver to remotely configure entire multi-stage prescription schedules directly onto the patient's phone.
* **Aggressive Subscription Paywalls:** Leading apps charge high recurring subscriptions (₹299 to ₹499 per month or ₹2,499 to ₹3,999 per year), pricing out everyday users and families managing long-term chronic prescriptions.

---

## 2. Product Vision & Dual-Mode Scope

The application operates as a unified, offline-first medication engine designed for both standalone personal use and remote caregiver management.

* **Personal Standalone Mode:** Individual users configure and track their own medications, vitamins, intra-day chained pills, and multi-day sequential courses completely offline with zero account registration and zero server dependency.
* **Remote Caregiver Mode:** Family members or caregivers link to a relative's device via a 6-digit pairing code to remotely create, modify, and monitor single or multi-stage medication regimens that execute offline on the patient's hardware clock.
* **Hybrid Multi-Profile Switcher:** A single user can use the app for their own daily supplements while switching tabs to manage remote schedules for parents or dependents.

---

## 3. Functional Requirements & Feature Specification

### 3.1 Intra-Day Chained Dependency Engine (Same-Day Offset)

1. **Standard Base Schedules:** Support fixed daily times, specific days of the week, cyclical courses (such as 21 days on, 7 days off), and fixed hour intervals.
2. **Event-Driven Dependent Reminders:** Allow any medication (Medicine B) to be configured as dependent on a parent medication (Medicine A) with a customizable delay offset (for example, 10, 15, 30, or 60 minutes after Medicine A is marked taken).
3. **Dynamic Drift Recalculation:** If Medicine A is scheduled for 08:00 AM but the user taps **Mark Taken** at 09:15 AM, the engine dynamically schedules the exact hardware alarm for Medicine B at 09:45 AM.
4. **Snooze Hold Protection:** If Medicine A is snoozed by 10 minutes, Dependent Medicine B remains dormant and does not start its countdown timer until Medicine A is confirmed taken.
5. **Cascade Skip Handling:** If Medicine A is marked **Skipped**, the app prompts the user to either skip Dependent Medicine B or trigger Medicine B at a fallback time.

### 3.2 Sequential Course & Multi-Phase Regimen Engine (Multi-Day Course Transition)

1. **Medication Lifecycle States:** Every medication record operates within a strict state machine:
   * `ACTIVE`: Currently within its active treatment window; hardware alarms are registered with the OS.
   * `QUEUED_PHASE`: Programmed in advance by the user or remote caregiver, waiting silently in local SQLite for a prerequisite medication course (Medicine A) to complete before registering any OS alarms.
   * `COMPLETED`: Course duration or total dose count has been reached; all future hardware alarms are permanently retired.
2. **Dual Course-Completion Triggers:** When configuring a time-bound medication (Medicine A for 3, 4, or 7 days), the user or caregiver selects between two clinical completion modes:
   * **Dose-Count Completion Mode:** Medicine A completes only after $N$ confirmed doses are marked taken (for example, 3 days $\times$ 2 doses/day = 6 total doses). If the patient misses a dose on Day 2, Medicine A continues until all 6 pills are finished before retiring.
   * **Calendar-Day Completion Mode:** Medicine A strictly retires at the end of $X$ calendar days from its start date (for example, 3, 4, or 7 days), regardless of missed doses.
3. **Automatic Retirement of Prerequisite Medicine:** As soon as Medicine A reaches completion, the local engine transitions Medicine A to `COMPLETED` and purges all future hardware alarms for Medicine A so the user never accidentally takes it past its prescribed duration.
4. **1-to-Many Fan-Out Activation (Medicines B, C, and D):** Multiple follow-up medications (Medicines B, C, and D) can reference Medicine A via `starts_after_course_id`. When Medicine A transitions to `COMPLETED`, the engine automatically flips Medicines B, C, and D from `QUEUED_PHASE` to `ACTIVE`, sets their `course_start_date`, and registers their hardware alarms with the OS.
5. **Combined Phase + Intra-Day Chaining:** Follow-up medications can also have intra-day dependencies among themselves. For example, once Medicine A finishes its 3-day course and retires:
   * Medicine B activates on Day 4 at 08:00 AM.
   * Medicine C activates on Day 4 and triggers 30 minutes *after* Medicine B is marked taken.
   * Medicine D activates on Day 4 at 09:00 PM.
6. **Transition Alert & Undo Grace Window:** When Medicine A completes, the app displays a clear transition summary banner (*"Course Complete: Medicine A has ended. Starting tomorrow, reminders for Medicines B, C, and D are now active"*). If the user accidentally tapped **Mark Taken** on the final dose of Medicine A and taps **Undo** within 5 minutes, the engine reverts Medicines B, C, and D back to `QUEUED_PHASE` and restores Medicine A to `ACTIVE`.

### 3.3 High-Reliability Local Alarm Execution

1. **Full-Screen Lock-Screen Wake:** Alarms trigger via Android `USE_FULL_SCREEN_INTENT`, turning on the screen over the lock interface like an incoming phone call with persistent audio until acknowledged.
2. **Zero-Unlock Quick Actions:** Users can tap **Mark Taken**, **Snooze 10m**, or **Skip** directly from the full-screen prompt or notification banner without unlocking the device.
3. **Hardware Kernel Registration:** All alarms register directly with the operating system kernel via `AlarmManager.setAlarmClock()`, bypassing Android Doze Mode and deep battery sleep.
4. **Reboot Persistence:** A native `RECEIVE_BOOT_COMPLETED` broadcast receiver wakes on device startup, reads active schedules, in-progress intra-day chains, and active course phases from local SQLite, and re-arms all hardware alarms.

### 3.4 Remote Family Sync & Refill Inventory

1. **Zero-Password 6-Digit Pairing:** A patient taps "Link Family Member" to display a large 6-digit pairing code or QR code. The caregiver enters the code on their phone to establish an encrypted device link.
2. **Pre-Programmed Full Prescription Sync:** A caregiver can input the entire multi-phase doctor's prescription on Day 1 (Medicine A for 4 days, followed by Medicines B, C, and D for 7 days). The entire ruleset syncs to the parent's phone in a single payload and transitions phases offline automatically on Day 4 without requiring internet on the transition day.
3. **Closed-Loop Adherence & Escalation:** When a patient marks a dose taken or completes a course phase, a background event notifies the caregiver. If a critical dose goes unacknowledged for 30 minutes, the patient's device triggers a missed-dose alert to the caregiver.
4. **Local Refill Counter:** Every confirmed dose decrements the local pill inventory count and fires a low-stock reminder when 5 days of supply remain.

---

## 4. Zero-Cost Production System Architecture

To ensure 100% alarm reliability without internet connectivity and \$0 (₹0) server operating costs at launch, the system decouples **State Synchronization** (Cloud) from **Alarm & Phase Execution** (Local Device Hardware).

### 4.1 Architectural Flow Diagram

```
[ Personal User OR Caregiver App ]
       │
       │ 1. Saves Full Multi-Phase Regimen (Med A for 3d -> Meds B, C, D)
       ▼
┌───────────────────────────────────────────────────────────────────┐
│  Cloudflare Worker API + Cloudflare D1 (Free Edge SQLite)         │
│  - Active ONLY when Remote Caregiver Mode or Cloud Backup is used │
│  - Stores compressed schedule JSON and increments sync version    │
│  - Dispatches Firebase Cloud Messaging (FCM) HTTP v1 Data Push    │
└──────────────────────────────┬────────────────────────────────────┘
                               │ 2. High-Priority Data Push (Wake Doorbell)
                               ▼
┌───────────────────────────────────────────────────────────────────┐
│  Target Phone (Headless JS Background Service)                    │
│  - Wakes in background upon receiving FCM data push               │
│  - Writes Med A ('ACTIVE') and Meds B, C, D ('QUEUED_PHASE')      │
│    into local on-device SQLite                                    │
│  - Registers hardware alarms ONLY for 'ACTIVE' Med A              │
└──────────────────────────────┬────────────────────────────────────┘
                               │ 3. Offline Execution (Zero Internet Required)
                               ▼
┌───────────────────────────────────────────────────────────────────┐
│  Android OS Kernel AlarmManager + Headless Transition Engine      │
│  - Rings Full-Screen Alarm for Medicine A                         │
│  - Intra-Day Check: Schedules same-day dependent meds (+10/30m)   │
│  - Course Phase Check: If Med A reaches final dose/day:           │
│      1. Marks Med A 'COMPLETED' & cancels future Med A alarms     │
│      2. Flips Meds B, C, D from 'QUEUED_PHASE' to 'ACTIVE'        │
│      3. Registers OS hardware alarms for Meds B, C, and D         │
└───────────────────────────────────────────────────────────────────┘
```

### 4.2 Infrastructure Stack & Free-Tier Capacity

| Layer | Technology | Free Tier Limit | Primary Responsibility |
| :--- | :--- | :--- | :--- |
| Mobile Client | React Native, Notifee | Unlimited | UI, headless tasks, OS alarms |
| Local Database | On-Device SQLite | Unlimited | Primary offline store & outbox |
| Serverless API | Cloudflare Workers | 100,000 requests/day | Caregiver sync routing |
| Cloud Storage | Cloudflare D1 | 5 GB SQLite storage | Paired schedules & dose logs |
| Wake Trigger | Firebase FCM | Unlimited pushes | Silent background wake-up |

* **Zero Server Load for Personal Users:** Users in Personal Mode operate 100% on local SQLite and device hardware, consuming zero Cloudflare requests or D1 storage.
* **Offline Outbox Pattern:** If a patient takes the final dose of Medicine A while offline, the device immediately retires Medicine A and activates Medicines B, C, and D locally, while queuing a `COURSE_TRANSITION_COMPLETED` event in the local `sync_outbox` table to notify the caregiver once connectivity returns.
* **OEM Battery Optimization Exemption:** During onboarding, the app triggers `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` so aggressive battery managers on Xiaomi, Vivo, Oppo, and Realme phones never block background alarms.

---

## 5. Core Database Schema & Transition Logic (Local SQLite & Cloudflare D1)

### 5.1 SQLite Schema Definition

```sql
-- 1. Medications, Intra-Day Chains & Multi-Day Course Phase Rules
CREATE TABLE medications (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    name TEXT NOT NULL,
    dosage_text TEXT NOT NULL,

    -- Lifecycle State: 'ACTIVE' | 'QUEUED_PHASE' | 'COMPLETED' | 'PAUSED'
    lifecycle_status TEXT NOT NULL DEFAULT 'ACTIVE',

    -- Course Duration Rules (Determines when Medicine A ends)
    course_type TEXT NOT NULL DEFAULT 'ONGOING', -- 'ONGOING' | 'FIXED_DAYS' | 'FIXED_DOSES'
    max_duration_days INTEGER,                   -- e.g., 3, 4, or 7 days (NULL if ONGOING)
    max_total_doses INTEGER,                     -- e.g., 6 total doses (NULL if ONGOING)
    doses_taken_count INTEGER DEFAULT 0,         -- Increments on each 'TAKEN' action
    course_start_date TEXT,                      -- ISO timestamp set when status becomes 'ACTIVE'

    -- Sequential Course Phase Transition (For Medicines B, C, D waiting on Medicine A)
    starts_after_course_id TEXT,                 -- Foreign key pointing to prerequisite Med A ID
    phase_start_delay_hours INTEGER DEFAULT 0,   -- Optional cooldown hours before B, C, D begin

    -- Intra-Day Timing Rules (How the medicine rings on an active day)
    schedule_type TEXT NOT NULL,                 -- 'FIXED_TIME' | 'DEPENDENT_SAME_DAY' | 'INTERVAL'
    fixed_time TEXT,                             -- e.g., '08:00' (NULL if DEPENDENT_SAME_DAY)
    depends_on_med_id TEXT,                      -- Foreign key for same-day 10m/30m delay chain
    delay_minutes INTEGER,                       -- e.g., 30 (fires 30m after depends_on_med_id taken)

    -- Inventory & Metadata
    stock_remaining INTEGER DEFAULT 0,
    low_stock_threshold INTEGER DEFAULT 5,
    updated_at INTEGER NOT NULL
);

-- 2. Adherence Logs & Audit Trail
CREATE TABLE dose_logs (
    id TEXT PRIMARY KEY,
    med_id TEXT NOT NULL,
    scheduled_at INTEGER NOT NULL,
    action_taken TEXT NOT NULL,  -- 'TAKEN' | 'SKIPPED' | 'MISSED' | 'COURSE_COMPLETED'
    action_timestamp INTEGER NOT NULL,
    synced_to_cloud INTEGER DEFAULT 0
);
```

### 5.2 Offline Headless State Machine Execution Flow

When the user taps **Mark Taken** on any notification or full-screen alarm, the headless background service executes two sequential checks inside a single local SQLite transaction:

1. **Step 1 — Intra-Day Dependency Check:**
   * Queries `SELECT * FROM medications WHERE depends_on_med_id = :currentMedId AND lifecycle_status = 'ACTIVE'`.
   * For any matching medication, computes `targetTime = Date.now() + (delay_minutes * 60000)` and registers an exact one-off hardware alarm via `AlarmManager`.
2. **Step 2 — Multi-Day Course Completion & Phase Transition Check:**
   * Increments `doses_taken_count` on `:currentMedId`.
   * Evaluates whether `course_type == 'FIXED_DOSES' && doses_taken_count >= max_total_doses` OR `course_type == 'FIXED_DAYS' && elapsedDays >= max_duration_days`.
   * If `true`:
     * Updates `:currentMedId` to `lifecycle_status = 'COMPLETED'` and cancels all future OS alarms for `:currentMedId`.
     * Queries `SELECT * FROM medications WHERE starts_after_course_id = :currentMedId AND lifecycle_status = 'QUEUED_PHASE'`.
     * Updates all returned medications (Medicines B, C, and D) to `lifecycle_status = 'ACTIVE'`, sets their `course_start_date = NOW()`, and registers their base hardware alarms with the OS.

---

## 6. Non-Functional Requirements

* **Offline Determinism:** 100% of scheduled, intra-day chained, and multi-day course phase transitions must execute locally on the target device without network calls.
* **Battery Efficiency:** Zero persistent WebSocket or background polling loops; the app wakes solely on OS kernel alarm interrupts or incoming FCM data messages.
* **Payload Efficiency:** Schedule synchronization payloads must remain under 4 KB of JSON to guarantee instant syncing on 2G or unstable mobile networks.
* **Required Android Permissions:** `SCHEDULE_EXACT_ALARM`, `USE_EXACT_ALARM`, `USE_FULL_SCREEN_INTENT`, `RECEIVE_BOOT_COMPLETED`, `FOREGROUND_SERVICE`, and `POST_NOTIFICATIONS`.

---

## 7. Phased Business Model & Ultra-Low-Cost Pricing Strategy

Competitors monetize basic health reminders with high monthly subscriptions, creating an opportunity for an ethical, micro-priced alternative.

| Application | Monthly Price | Annual Price | Lifetime Unlock | Remote Caregiver Scheduling |
| :--- | :--- | :--- | :--- | :--- |
| Medisafe | ₹499 (\$4.99) | ₹3,999 (\$39.99) | None | View only |
| EveryDose | ₹830 (\$9.99) | ₹4,990 (\$59.99) | None | Email summaries |
| Dosecast | ₹330 (\$3.99) | ₹2,490 (\$29.99) | None | None |
| MyTherapy | Free / Ads | ₹830 (\$9.99) | ₹4,199 (\$49.99) | View only |
| **MedChain** | **₹39 (\$0.49)** | **₹299 (\$3.99)** | **₹499 (\$6.99)** | **Full remote multi-phase scheduling** |

* **Phase 1: 100% Free Adoption Engine (Months 1–6):** Launch with all personal medication tracking, intra-day chained reminders, multi-day sequential course transitions, and 1-to-1 remote caregiver linking completely free and ad-free. Because Cloudflare Workers, D1, and FCM remain free up to tens of thousands of active users, infrastructure overhead stays at ₹0 while growing organic word-of-mouth adoption.
* **Phase 2: Micro-Priced Pro & Family Tier (Month 6+):** Keep Personal Mode (unlimited medicines, intra-day chains, and multi-phase courses) and 1-to-1 parent-child linking free forever. Introduce an optional Pro upgrade priced roughly 90% below competitors at ₹39/month (\$0.49), ₹299/year (\$3.99), or ₹499 (\$6.99) for a lifetime unlock.
* **Pro Tier Deliverables:** Managing up to 5 remote family members, automated PDF adherence charts for doctor consultations, multi-caregiver alert distribution, and encrypted cloud history backup across phone upgrades.
* **Phase 3: Pharmacy Refill Affiliates:** Integrate non-intrusive 1-tap reorder links inside low-stock refill notifications to generate affiliate commissions from online pharmacies without increasing user subscription fees.