---
name: Warm Editorial Healthcare
colors:
  surface: '#FFFEFA'
  surface-dim: '#d0ddd8'
  surface-bright: '#f0fcf7'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eaf6f1'
  surface-container: '#e4f1ec'
  surface-container-high: '#dfebe6'
  surface-container-highest: '#d9e5e0'
  on-surface: '#131e1b'
  on-surface-variant: '#404946'
  inverse-surface: '#283330'
  inverse-on-surface: '#e7f4ee'
  outline: '#D4D9D2'
  outline-variant: '#bfc9c5'
  surface-tint: '#32685c'
  primary: '#034339'
  on-primary: '#ffffff'
  primary-container: '#245b50'
  on-primary-container: '#99d1c3'
  inverse-primary: '#9ad2c3'
  secondary: '#815600'
  on-secondary: '#ffffff'
  secondary-container: '#ffbd56'
  on-secondary-container: '#734c00'
  tertiary: '#00452c'
  on-tertiary: '#ffffff'
  tertiary-container: '#205d42'
  on-tertiary-container: '#96d4b1'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#b6eedf'
  primary-fixed-dim: '#9ad2c3'
  on-primary-fixed: '#00201a'
  on-primary-fixed-variant: '#164f45'
  secondary-fixed: '#ffddb1'
  secondary-fixed-dim: '#fcba53'
  on-secondary-fixed: '#291800'
  on-secondary-fixed-variant: '#624000'
  tertiary-fixed: '#b1f0cd'
  tertiary-fixed-dim: '#96d4b2'
  on-tertiary-fixed: '#002113'
  on-tertiary-fixed-variant: '#105137'
  background: '#f0fcf7'
  on-background: '#131e1b'
  surface-variant: '#d9e5e0'
  canvas: '#F7F5EF'
  surface-muted: '#ECEFE9'
  ink: '#202B28'
  ink-muted: '#58645F'
  brand-pressed: '#19483F'
  brand-soft: '#DCE9E2'
  warning: '#8A5A16'
  danger: '#A33E38'
typography:
  display:
    fontFamily: Atkinson Hyperlegible Next
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: Atkinson Hyperlegible Next
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 34px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Atkinson Hyperlegible Next
    fontSize: 22px
    fontWeight: '700'
    lineHeight: 28px
  headline-sm:
    fontFamily: Atkinson Hyperlegible Next
    fontSize: 18px
    fontWeight: '700'
    lineHeight: 24px
  body-xl:
    fontFamily: Atkinson Hyperlegible Next
    fontSize: 20px
    fontWeight: '400'
    lineHeight: 28px
  body-lg:
    fontFamily: Atkinson Hyperlegible Next
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 26px
  body-md:
    fontFamily: Atkinson Hyperlegible Next
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Atkinson Hyperlegible Next
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-lg:
    fontFamily: Atkinson Hyperlegible Next
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  label-md:
    fontFamily: Atkinson Hyperlegible Next
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 22px
  label-sm:
    fontFamily: Atkinson Hyperlegible Next
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 18px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-sm: 0.75rem
  gutter-lg: 1.5rem
  margin: 1.25rem
  margin-mobile: 1.25rem
  margin-tablet: 2rem
  margin-desktop: 3rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style

This design system is tailored for an offline-first medication manager catering to adults, older individuals, and remote family caregivers. It embraces a **Humane Editorial & Tactile Paper** aesthetic, rejecting cold clinical tropes, hyper-saturated tech gradients, and sterile medical SaaS blues. The interface creates an atmosphere of dignified quietude, reassurance, and tactile dependability.

The emotional mandate balances clarity with autonomy. It treats patients as capable adults rather than monitored subjects—eradicating patronizing surveillance metrics, infantilizing streak confetti, or anxiety-inducing alert badges. Every surface mirrors the optical calm of warm, matte archival paper, anchored by an authoritative deep evergreen-teal and illuminated by a restrained marigold accent.

Interactive elements are deliberately physical and grounding: large, generous touch structures, prominent optical contrast, sturdy borders, and legible, human-first typography. The voice is plainspoken, warm, and supportive, cultivating trust even when completely severed from network connectivity.

## Colors

The color palette operates strictly in a high-clarity `light` mode designed for daylight readability, low-glare visual comfort, and strict accessibility. 

- **Primary (`#245B50` - Brand Evergreen):** The primary chromatic anchor used for high-priority single actions, active navigation states, and identity landmarks. Pairs with `brand-pressed` (`#19483F`) during interaction and `brand-soft` (`#DCE9E2`) for soft pill fills and tinted state backgrounds.
- **Secondary (`#D79A35` - Marigold Accent):** Used sparingly for temporal markers, pending schedules, progress highlights, and warm, non-alarmist points of focus.
- **Tertiary (`#2F6B4F` - Success Herb):** Designated for affirmative resolutions, dose confirmations ("Taken"), and completed medical courses.
- **Neutral (`#202B28` - Deep Ink):** Provides rich editorial contrast against paper backgrounds. Paired with `ink-muted` (`#58645F`) for supporting metadata, ensuring WCAG AAA ratio on body surfaces.
- **Foundational Surfaces:** `canvas` (`#F7F5EF`) establishes the warm tactile baseline, while `surface` (`#FFFEFA`) forms crisp card platforms. `surface-muted` (`#ECEFE9`) supplies secondary grouping boundaries without harsh shadows.
- **State Semantics:** `warning` (`#8A5A16`) signals upcoming windows or low stock without panic. `danger` (`#A33E38`) is reserved strictly for irreversible deletions and safety stops. Color is never used as the sole conveyor of status; all critical states must couple color with explicit copy and iconography.

## Typography

Typography prioritizes extreme glyph legibility and differentiation via **Atkinson Hyperlegible Next**. The letterforms feature exaggerated ascenders, distinct crossbars, and uncompromised optical clarity across varying visual acuities and screen scalings.

- **Display & Headlines:** Used deliberately and sparingly. Screen greetings and milestone confirmations use `display` and `headline-lg`. Section anchors and schedule dates occupy `headline-md`.
- **Body & Clinical Clarity:** Crucial medication names and primary instructions demand `body-lg` or `body-xl` to prevent dosage confusion. Default text, form instructions, and modal descriptions sit at `body-md`. `body-sm` is strictly limited to non-essential ancillary metadata; medication quantities or schedules must never be rendered at or below 14px.
- **Labels & Interactive Affordances:** Buttons, status badges, and tab destinations rely on the medium/semibold weights of `label-lg` and `label-md`. All-caps styling is strictly prohibited to prevent visual fragmentation and cognitive strain for readers with diminished acuity.
- **System Text Scaling:** All typographic wrappers must utilize dynamic type metrics and soft boundary wraps without truncating or masking lines with ellipsis.

## Layout & Spacing

The layout is grounded in a single-column, sequential reading model built upon a 4px geometric progression. On mobile screens (up to 600px), multi-column grids are prohibited for primary medication flows to eliminate scanning confusion.

- **Margins & Gutters:** Mobile views maintain a rigid outer canvas margin of `1.25rem` (20px) to keep touchpoints comfortably inside device hardware bezels. On larger viewports (tablet and web caregiver views), content constrains to an 8-column layout with max-width `680px` for patient workflows and `840px` for caregiver multi-member matrices.
- **Rhythm & Stacking:** Components stack vertically using rhythmic increments: `space-xs` (4px) for paired caption-to-label bindings; `space-sm` (8px) for tightly coupled inputs and icon groupings; `space-md` (16px) for item separation inside cards; `space-lg` (24px) for structural section separation; and `space-xl` (32px) for primary form groupings.
- **Physical Touch Target Rules:** All touch targets must adhere to an absolute minimum of 48×48px, expanding to 56–64px height for time-critical, high-frequency actions such as "Mark Taken" and dose postponement options.

## Elevation & Depth

Visual hierarchy is established strictly through **Tonal Layers** and **Low-Contrast Outlines**, avoiding synthetic drop shadows, skeuomorphic gradients, and computational glassmorphism.

- **Physical Foundation:** The app canvas sits on `canvas` (`#F7F5EF`). Grouped regions or secondary containers (such as calendar rails or filter backgrounds) rest on `surface-muted` (`#ECEFE9`).
- **Interactive Planes:** Elevated modules, cards, and modal sheets are formed using pure `surface` (`#FFFEFA`). Separation is achieved by combining this tone shift with a crisp 1px solid stroke of `outline` (`#D4D9D2`).
- **Shadows:** Standard screens do not use elevation shadows. For floating action bars or lock-screen action prompts requiring emergency contrast, a single, ambient blur is permitted: `0px 4px 16px rgba(32, 43, 40, 0.06)`. This low-opacity, ink-tinted diffusion simulates natural ambient daylight bouncing off physical stationery without creating optical noise.

## Shapes

The design system adopts a **Rounded** contour philosophy (`roundedness: 2`), translating to an 18px (`1.125rem`) corner radius on core containers, cards, and bottom sheets.

- **Primary Cards & Modals:** Standard medication modules, status cards, and interactive forms use an 18px corner radius. This curved silhouette softens the clinical tone without feeling cartoonish.
- **Buttons & Action Triggers:** Interactive action blocks, inputs, and list selectors feature a consistent 12px to 14px radius (`rounded-md` to `rounded-lg`), delivering a solid, stamp-like appearance that invites confident finger placement.
- **Micro-Elements & Badges:** Category chips, status indicators, and pill tags employ fully rounded caps (`pill-shaped` / 9999px) to distinctly separate metadata tags from tappable, rectangular action cards.

## Components

### Buttons
- **Primary Action:** Solid `brand` (`#245B50`) background, `#FFFEFA` text, min-height 56px (prefer 60–64px for dose confirmation), 14px border radius. Uses `brand-pressed` (`#19483F`) when tapped. Must always feature clear text; never deploy an icon alone.
- **Secondary Action:** `surface` (`#FFFEFA`) fill with a 1.5px solid `outline` (`#D4D9D2`), text colored in `ink` (`#202B28`). Min-height 56px.
- **Quiet / Auxiliary Action:** Transparent background with `brand` text and an underline or subtle `surface-muted` fill on press. Used for "Remind me in 10 min".
- **Destructive Action:** Bordered in `danger` (`#A33E38`) or pure text link with a clear warning dialog before execution. Explicitly separated from the primary action row by at least `space-md`.

### Cards & Medication Cards
- **Architecture:** Crisp `#FFFEFA` container with 1px `#D4D9D2` stroke and 18px radius.
- **Hierarchy Order:**
  1. Medication Name (`headline-sm`, `ink`)
  2. Plain dosage and instructions (`body-md`, `ink-muted`, e.g., "1 tablet with water")
  3. Scheduled context (`label-md`, `secondary` or `brand`, e.g., "Today at 8:00 AM • Before breakfast")
  4. Humanized status indicator
  5. Single primary contextual action (e.g., "Mark Taken")
- Internal engine lifecycle terms (e.g., `QUEUED_PHASE`) must never be exposed; render friendly translations like "Starts after current course".

### Form Inputs & Selectors
- **Fields:** Minimum height of 56px, background `#FFFEFA`, 1.5px border in `outline` (`#D4D9D2`). Active/focus state transitions to a 2px border in `brand` (`#245B50`).
- **Typography:** Placeholder text rendered in `ink-muted` (`#58645F`) at 16px; entered text in `ink` (`#202B28`) at 18px for confident verification.
- **Increment Controls:** Stepper triggers for dosage adjustments must feature oversized `+` and `−` tap targets (minimum 48×48px) with audible and tactile haptic feedback.

### Chips & Status Tags
- **Informational Badges:** Pill-shaped, composed of `brand-soft` (`#DCE9E2`) with `brand` (`#245B50`) text, or `surface-muted` (`#ECEFE9`) with `ink` (`#202B28`).
- **Status Warnings:** Tinted background (`#D79A35` at 15% opacity) with `#8A5A16` text and an accompanying text glyph or icon.
- **Completed States:** Tinted green background (`#2F6B4F` at 15% opacity) with `#2F6B4F` text and an unmistakable checkmark.

### Checkboxes & Radios
- **Sizing:** Box size of 24×24px housed inside an interactive row with a minimum 56px hit target.
- **Checked Visual:** Solid fill with `brand` (`#245B50`) featuring a crisp white inner icon.
- **Unchecked Visual:** 2px solid `outline` (`#D4D9D2`) on `#FFFEFA`.

### Specialized Components
- **Offline Banner:** Discreet, non-intrusive full-width anchor in `surface-muted` with `ink-muted` text and a quiet cloud-slash glyph ("Working offline — changes will save and sync when reconnected"). Does not block the screen or prevent medication logging.
- **Caregiver Context Bar:** A persistent, pinned context ribbon at the top of the interface whenever managing a family member's plan: "Managing medicines for Eleanor Davies" with a distinct warm tint to prevent accidental cross-profile schedule mutations.