# MedChain — Initial Design System

**Status:** Initial visual and interaction direction  
**Product:** Offline-first medication manager for personal use and remote family caregiving  
**Platforms:** Android and iOS (React Native)

## 1. Design intent

MedChain should feel calm, trustworthy, humane, and unusually clear—not like a generic health dashboard, a hospital portal, or an AI-generated template.

The interface serves two equally important audiences:
- **Patient:** often needs to know only what to take next and how to confirm it.
- **Caregiver:** may remotely create, edit, and monitor a family member's full medication plan.

Keep the same visual language across both roles, but give each a different default task. A patient's home screen is action-first; a caregiver's home screen is person-and-plan-first.

### Design principles
1. **One obvious next action.** Avoid competing primary buttons.
2. **Plain language.** Prefer “Taken”, “Remind me in 10 min”, and “Skip this dose” over clinical or technical wording.
3. **Readable at a glance.** Large type, strong contrast, generous spacing, clear labels beside icons.
4. **Calm, not cold.** Warm paper-like surfaces and a distinctive deep-teal identity; avoid the familiar blue-and-white medical SaaS look.
5. **Progressive disclosure.** Show essential information first; place advanced schedule rules behind clear, optional steps.
6. **Respect and agency.** Never make an older adult feel monitored or treated like a child. Caregiver actions should be transparent to the patient.
7. **Offline is normal.** Do not make the interface feel broken when the network is unavailable.

## 2. Visual identity

### Color palette

Use a warm, low-glare neutral base with deep evergreen-teal as the brand anchor and a restrained marigold accent. Avoid gradients, neon colors, excessive shadows, and large areas of saturated color.

| Token | Hex | Use |
|---|---|---|
| `canvas` | `#F7F5EF` | Main app background |
| `surface` | `#FFFEFA` | Cards, sheets, forms |
| `surface-muted` | `#ECEFE9` | Quiet grouping and secondary surfaces |
| `ink` | `#202B28` | Primary text |
| `ink-muted` | `#58645F` | Secondary text; keep contrast accessible |
| `brand` | `#245B50` | Primary actions, selected navigation, brand mark |
| `brand-pressed` | `#19483F` | Pressed/active primary controls |
| `brand-soft` | `#DCE9E2` | Selected chips and calm brand backgrounds |
| `accent` | `#D79A35` | Small highlights, reminders, progress details |
| `success` | `#2F6B4F` | Confirmed taken/completed states |
| `warning` | `#8A5A16` | Upcoming, low-stock, attention-needed states |
| `danger` | `#A33E38` | Destructive actions and critical errors |
| `outline` | `#D4D9D2` | Borders, dividers, input outlines |

**Color rules**
- Do not communicate status by color alone. Pair every state with a word and, where useful, a simple icon.
- Use `danger` sparingly; a missed dose should be clear but not frightening.
- Keep primary buttons high-contrast and use a solid fill, not a gradient.
- Validate text and control contrast against WCAG AA before implementation.

## 3. Typography

Use **Atkinson Hyperlegible** for the main interface if licensing and platform packaging are suitable; otherwise use the platform system sans-serif. The design must remain legible with system font scaling enabled.

| Style | Size / line height | Use |
|---|---|---|
| Display | 32 / 38 | Greeting or one key daily summary; rarely |
| Screen title | 28 / 34 | Main screen heading |
| Section title | 22 / 28 | Group headings |
| Body large | 18 / 26 | Medication names, key instructions |
| Body | 16 / 24 | Default text and form labels |
| Supporting | 14 / 20 | Secondary metadata only |
| Button | 18 / 24, medium | Primary and important actions |

Avoid tiny all-caps labels, thin font weights, long italic text, and dense paragraphs. Medication name and dosage should never rely on small supporting text.

## 4. Layout and components

### Spacing and shape
- Base spacing unit: **4 px**; common gaps: 8, 12, 16, 24, 32.
- Screen side padding: **20–24 px** on phones.
- Main content width: full width on mobile; do not force desktop-style multi-column layouts onto phones.
- Cards: 18 px corner radius, subtle 1 px outline, little or no shadow.
- Inputs and buttons: minimum **56 px** high; prefer 60–64 px for high-frequency patient actions.
- Touch targets: minimum **48 × 48 px**, with clear spacing between adjacent actions.
- Keep content in a single vertical flow. Avoid dense grids, tiny charts, and nested cards.

### Buttons
- Primary: one full-width, solid brand button per key task.
- Secondary: outlined or quiet surface button.
- Destructive: text or outlined danger action, separated from the primary action.
- Always use a visible text label; icons are supplementary.
- Confirm irreversible or clinically consequential changes before applying them.

### Medication card
Each medication item should show, in this order:
1. Medication name
2. Dose/instructions in plain language
3. Scheduled time or dependency (“30 min after the first medicine”)
4. Current status as text
5. One relevant action

Avoid showing internal lifecycle labels such as `QUEUED_PHASE` in the UI. Translate them to user-facing language such as “Starts after this course”.

## 5. Navigation

Use a small, stable bottom navigation with labeled destinations. Keep the patient experience to **three primary destinations**:
- **Today** — next dose and today's schedule
- **Medicines** — current and upcoming medication plans
- **Family** — linked caregiver/patient profiles and connection status

Settings should be reached from a clear top-level profile or settings control, not become a fourth competing primary destination.

Caregiver mode may use:
- **People** — choose a person and see their status
- **Schedule** — manage that person's medication plan
- **Activity** — recent dose confirmations and alerts

Keep the active person clearly visible whenever a caregiver is editing a schedule. Never make it possible to mistake whose medication plan is being changed.

## 6. Screen direction

### Patient experience

**A. Welcome and setup**
- One welcoming sentence and one clear “Set up my medicines” action.
- Offer “I’m setting this up for someone” as a secondary route.
- Explain notifications and alarm permissions in plain language at the moment they are needed.
- Request permissions contextually; explain why before opening system settings.

**B. Today — home**
- Top: “Good morning” or time-appropriate greeting, plus date.
- A simple “Next dose” area with medicine name, dose, and time.
- One large “Mark taken” action when a dose is due.
- A smaller “Remind me in 10 min” and a clearly separated “Skip this dose”.
- Below: a short “Later today” list.
- Show offline state quietly, without blocking medication actions.

**C. Dose reminder / lock-screen prompt**
- Very large medication name and dose.
- Short instruction, scheduled/actual time, and three explicit actions: “Taken”, “Snooze 10 min”, “Skip”.
- No promotional content, charts, or secondary navigation.
- Use a clear confirmation state after an action.

**D. Medicines**
- Plain list grouped into “Active”, “Starts later”, and “Completed”.
- “Add medicine” is the only prominent creation action.
- Explain queued courses in human terms; show when they are expected to begin.

**E. Add or edit medicine**
- Use a short step-by-step flow rather than one long form.
- Step 1: name and dose.
- Step 2: when and how often.
- Step 3: duration or ongoing treatment.
- Step 4: optional dependency or next phase.
- Step 5: review the full schedule before saving.
- Use examples and sensible defaults, but never silently invent a dose or medical instruction.

**F. Course transition**
- Calm, unmistakable summary: which course ended and which medicines start next.
- Show the effective date/time and provide “Review schedule”.
- Keep Undo available during the specified grace window; explain what Undo will reverse.

### Caregiver experience

**G. Family / people**
- Simple list of linked people, each with name, relationship label if provided, and a plain status such as “All caught up” or “Needs attention”.
- Avoid surveillance-style dashboards and alarming red badges for routine activity.

**H. Person overview**
- Person’s name and a clear “Managing medicines for…” heading.
- Show next dose, current course, and any attention-needed item.
- Prominent “Edit medication plan” action.
- Clearly distinguish caregiver view from actions performed on the patient's device.

**I. Remote schedule editor**
- Reuse the patient’s medication form and language.
- Keep the selected person visible throughout.
- Before sending changes, show a readable summary of what changes and when they take effect.
- Show sync status plainly: “Sent”, “Waiting for connection”, or “Couldn’t send—try again”.
- Do not imply a remote change has reached the patient until the device confirms receipt.

**J. Pairing**
- Large 6-digit code and QR option.
- Short, stepwise instructions for both people.
- Explain who will be able to manage or view information before linking.
- Provide a clear way to review or remove a link.

**K. Activity and missed dose**
- Chronological, readable event list.
- Distinguish “Not confirmed yet” from “Missed” when the system cannot know whether the medicine was taken.
- Use neutral, supportive wording and a clear next step.

## 7. Accessibility and older-adult usability

- Support operating-system text scaling without clipping or hiding actions.
- Keep key actions visible without requiring precise gestures, swipes, or long presses.
- Never use color as the only status signal.
- Use explicit labels, familiar words, and consistent placement.
- Avoid icon-only controls, hidden gesture shortcuts, dense tables, and tiny hit areas.
- Allow generous time for reading and confirmation.
- Provide clear focus order and screen-reader labels.
- Test with older adults and caregivers using real devices, including large text and reduced-motion settings.
- Do not assume age, vision, dexterity, or technical confidence from a user's role.

## 8. Motion, feedback, and sound

- Use brief, purposeful transitions only; respect reduced-motion settings.
- Confirm important actions with text and a subtle visual state change.
- Avoid confetti, gamification, streak pressure, or celebratory animations around medication adherence.
- Alarm sound and vibration should be configurable and tested separately from visual styling.
- A missed-dose alert should communicate urgency without shame or panic.

## 9. Content voice

Use warm, direct, respectful language.

**Prefer**
- “Your next dose”
- “Starts after this course”
- “Waiting for the phone to connect”
- “This dose hasn’t been confirmed”
- “Review changes before sending”

**Avoid**
- “Non-compliant”
- “Failed patient”
- “Sync error” without explanation
- “Treatment pipeline”
- Unexplained medical or technical abbreviations

## 10. Design boundaries and open decisions

This file establishes the visual and interaction direction; it does not settle clinical policy or platform feasibility.

Confirm before detailed implementation:
- Exact medication fields and whether prescription/photo capture is in scope.
- Whether caregivers can edit all medication details or require patient approval for selected changes.
- The exact meaning of “missed” versus “not confirmed”.
- How timezone changes, daylight-saving changes, and device clock changes affect schedules.
- Which iOS alarm and notification behaviors are feasible; do not assume Android full-screen alarm behavior is available on iOS.
- Permission flows and reliability limits across Android manufacturers.
- Whether patient and caregiver can have different access levels.

## 11. First design pass order

Design and validate these screens first, before expanding the full app:
1. Patient Today (home)
2. Due-dose reminder
3. Add medicine — schedule and review
4. Caregiver people list
5. Caregiver person overview
6. Remote edit and sync confirmation
7. Pairing flow

The first prototype should be tested with both a patient and a caregiver. Prioritize comprehension, confidence, and error prevention over visual novelty.

---

**North star:** A person should be able to open MedChain, understand what matters next, and take the correct app action without needing someone to explain the interface.
