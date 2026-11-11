# Release checklist (what only you can do)

## Backend (Cloudflare)
1. `cd apps/api && bunx wrangler d1 create medchain-d1` → put the real `database_id` in `wrangler.jsonc`.
2. `bunx wrangler d1 migrations apply medchain-d1 --remote`
3. Secrets (`bunx wrangler secret put <NAME>`): `JWT_SECRET` (≥32 random bytes), `PAIRING_PEPPER`, `FCM_SERVICE_ACCOUNT_JSON` (Firebase service account, push optional).
4. Vars: `ALLOWED_ORIGINS` (empty is fine for the native app), `ENVIRONMENT=production`.
5. `bunx wrangler deploy`; check `GET /health` returns `checks.db: ok`.

### After the 11 Nov changes
- Fill `SUPPORT_EMAIL` and `OPERATOR_NAME` in `apps/api/wrangler.jsonc`, then `bunx wrangler deploy` (adds account/data deletion and the `/privacy`, `/delete-account` pages). Have the privacy text reviewed before publishing; it is a draft.
- Use `https://<worker>/privacy` as the Play Store privacy policy URL and `https://<worker>/delete-account` as the account deletion URL.

## Mobile
1. Create a Firebase project → download `google-services.json` (Android push) and upload the APNs key (iOS). Set `GOOGLE_SERVICES_JSON` or place the file at `apps/mobile/google-services.json`.
2. `EXPO_PUBLIC_API_URL=https://<worker>.workers.dev` for every EAS build profile.
3. `eas build --profile development --platform android` (dev client; Expo Go cannot run this app), then production builds.
4. Play Console: declare exact-alarm use (SCHEDULE_EXACT_ALARM) and, if you ship a full-screen intent, its justification; add privacy policy URL and data-safety form (dose events + caregiver email are sent to your server when family sharing is on).

## Device QA (not automated)
Run on ≥ 1 Android 14+ phone, ≥ 1 OEM with aggressive battery management, ≥ 1 iPhone:
- [ ] Alarm rings at the local time with app foreground / background / swiped away / after reboot.
- [ ] Notification **Taken / Remind me in 10 min** work with the app killed; dose is recorded once.
- [ ] Deny then grant exact-alarm and notification permission; Settings shows the real state.
- [ ] Change time zone and clock; alarms move to the new local time.
- [ ] Day-1 caregiver prescription (A 4 days → B, C after B +30 min, D): airplane mode through Day 4; B/C/D start with no network.
- [ ] Pair two phones: QR scan and 6-digit entry; decline; expiry; revoke from each side.
- [ ] Push wake-up applies a caregiver edit with the app closed.
- [ ] Large text + TalkBack/VoiceOver on Today, alarm, wizard.

- [ ] Alarm with the app in the BACKGROUND (not swiped away) and the phone locked: the alarm screen appears over the lock screen.
- [ ] Do not open the app for 3 days: reminders still ring each day.
- [ ] Medicine A for 2 days then B: without opening the app on day 3, B rings.
- [ ] Settings → Reminder voice: Listen plays each voice; the test alarm uses the chosen one.
- [ ] Profile → Delete my account, and Family → Stop sharing and delete server data.
