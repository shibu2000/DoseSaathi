import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { MaterialIcons } from '@expo/vector-icons';
import type { PermissionKey } from '@medchain/contracts';
import { AppScreen } from '@/components/AppScreen';
import { PrimaryButton, SecondaryButton, DestructiveButton } from '@/components/Buttons';
import { FormField } from '@/components/FormField';
import { Colors, Spacing, Typography, Radii, FontFamily } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeContext';
import { useApp } from '@/state/AppContext';
import type { PairingSessionView } from '@/sync/api-client';
import { Notice } from '@/pairing/Notice';
import { PermissionToggles } from '@/pairing/PermissionToggles';
import { describeError, FriendlyError } from '@/pairing/errors';
import { computeCountdown, formatPairingCode, nextPollDelay } from '@/pairing/format';
import { describePermissions, normalizePermissions, PATIENT_PERMISSION_TEXT, PairingPermission } from '@/pairing/permissions';

interface ActiveSession {
  sessionId: string;
  pairingCode: string;
  qrPayload: string;
  expiresAt: string;
}

type IncomingRequest = NonNullable<PairingSessionView['incomingRequest']>;

const POLL_BASE_MS = 3000;

function statusText(status: string): string {
  if (status === 'ACTIVE') return 'Active';
  if (status === 'REVOKED_BY_PATIENT') return 'Access removed by you';
  if (status === 'DISCONNECTED_BY_CAREGIVER') return 'Disconnected by them';
  return status;
}

export default function PatientLinkFamilyScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { api, patientRelationships, refreshPatientRelationships, startFamilySharing, syncNow, isOnline, stopSharingAndEraseServerData } = useApp();
  const [erasing, setErasing] = useState(false);
  const [eraseError, setEraseError] = useState<FriendlyError | null>(null);

  const [hasIdentity, setHasIdentity] = useState<boolean | null>(null);
  const [name, setName] = useState('');
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<FriendlyError | null>(null);

  const [session, setSession] = useState<ActiveSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionError, setSessionError] = useState<FriendlyError | null>(null);
  const [serverStatus, setServerStatus] = useState<PairingSessionView['status']>('PENDING');
  const [tab, setTab] = useState<'code' | 'qr'>('code');
  const [now, setNow] = useState(Date.now());
  const [copied, setCopied] = useState(false);
  const [focused, setFocused] = useState(false);

  const [incoming, setIncoming] = useState<IncomingRequest | null>(null);
  const [perms, setPerms] = useState<PairingPermission[]>([]);
  const [label, setLabel] = useState('');
  const [deciding, setDeciding] = useState(false);
  const [decideError, setDecideError] = useState<FriendlyError | null>(null);
  const [approvedNotice, setApprovedNotice] = useState<string | null>(null);
  const [pollNote, setPollNote] = useState<FriendlyError | null>(null);

  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<FriendlyError | null>(null);

  const mounted = useRef(true);
  const lastRequestId = useRef<string | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, [])
  );

  // Device identity
  const checkIdentity = useCallback(async () => {
    try {
      const has = await api.hasDeviceIdentity();
      if (mounted.current) setHasIdentity(has);
    } catch {
      if (mounted.current) setHasIdentity(false);
    }
  }, [api]);
  useEffect(() => {
    checkIdentity();
  }, [checkIdentity]);

  const handleStart = async () => {
    if (!name.trim()) {
      setStartError({ kind: 'other', message: 'Enter the name your family will see.' });
      return;
    }
    setStarting(true);
    setStartError(null);
    try {
      await startFamilySharing(name.trim());
      await checkIdentity();
    } catch (e) {
      if (mounted.current) setStartError(describeError(e));
    } finally {
      if (mounted.current) setStarting(false);
    }
  };

  // Session creation
  const applySession = (s: ActiveSession) => {
    setSession(s);
    setServerStatus('PENDING');
    setIncoming(null);
    setPollNote(null);
    setCopied(false);
    setNow(Date.now());
  };

  const createSession = useCallback(async () => {
    setSessionLoading(true);
    setSessionError(null);
    try {
      const s = await api.createPairingSession();
      if (mounted.current) applySession(s);
    } catch (e) {
      if (mounted.current) setSessionError(describeError(e));
    } finally {
      if (mounted.current) setSessionLoading(false);
    }
  }, [api]);

  const regenerate = async () => {
    setSessionLoading(true);
    setSessionError(null);
    try {
      const s = session ? await api.regeneratePairingSession(session.sessionId) : await api.createPairingSession();
      if (mounted.current) applySession(s);
    } catch (e) {
      const fe = describeError(e);
      // The old session may be gone server-side: fall back to a fresh one.
      if (fe.kind === 'code_invalid' || fe.kind === 'expired' || (e as any)?.status === 404 || (e as any)?.status === 410) {
        try {
          const s = await api.createPairingSession();
          if (mounted.current) applySession(s);
          return;
        } catch (e2) {
          if (mounted.current) setSessionError(describeError(e2));
          return;
        }
      }
      if (mounted.current) setSessionError(fe);
    } finally {
      if (mounted.current) setSessionLoading(false);
    }
  };

  useEffect(() => {
    if (hasIdentity && api.isConfigured && !session && !sessionLoading && !sessionError && focused) {
      createSession();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasIdentity, focused]);

  // Countdown tick (only while visible)
  useEffect(() => {
    if (!focused || !session) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [focused, session]);

  // Poll the session for an incoming request (stops on blur/unmount, backs off on errors)
  const sessionId = session?.sessionId;
  useEffect(() => {
    if (!focused || !sessionId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let errors = 0;
    const tick = async () => {
      let retryAfter: number | undefined;
      try {
        const view = await api.getPairingSession(sessionId);
        if (cancelled) return;
        errors = 0;
        setPollNote(null);
        setServerStatus(view.status);
        const next = view.incomingRequest;
        if (next && next.status === 'PENDING') {
          if (lastRequestId.current !== next.requestId) {
            lastRequestId.current = next.requestId;
            setPerms(normalizePermissions(next.requestedPermissions));
            setLabel('');
            setDecideError(null);
            setApprovedNotice(null);
          }
          setIncoming(next);
        } else {
          setIncoming(null);
        }
      } catch (e) {
        if (cancelled) return;
        errors += 1;
        const fe = describeError(e);
        retryAfter = fe.retryAfterSeconds;
        setPollNote(fe);
      }
      if (!cancelled) timer = setTimeout(tick, nextPollDelay(POLL_BASE_MS, errors, 30000, retryAfter));
    };
    timer = setTimeout(tick, 1000);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [api, sessionId, focused]);

  const countdown = computeCountdown(session?.expiresAt, now);
  const hasPending = incoming?.status === 'PENDING';
  const sessionDead = !!session && !hasPending && (countdown.expired || serverStatus === 'EXPIRED' || serverStatus === 'REVOKED');

  const copyCode = async () => {
    if (!session) return;
    try {
      await Clipboard.setStringAsync(session.pairingCode);
      setCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => mounted.current && setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };

  const approve = async () => {
    if (!incoming) return;
    if (perms.length === 0) {
      setDecideError({ kind: 'other', message: 'Allow at least one thing, or choose Decline.' });
      return;
    }
    if (!label.trim()) {
      setDecideError({ kind: 'other', message: 'Add a label for this person, for example Daughter.' });
      return;
    }
    setDeciding(true);
    setDecideError(null);
    try {
      await api.approvePairingRequest(incoming.requestId, {
        approvedPermissions: perms as PermissionKey[],
        relationshipLabel: label.trim(),
      });
      if (!mounted.current) return;
      setApprovedNotice(`${incoming.caregiverDisplayName} can now see what you allowed.`);
      setIncoming(null);
      setSession(null);
      await refreshPatientRelationships();
      await syncNow();
    } catch (e) {
      if (mounted.current) setDecideError(describeError(e));
    } finally {
      if (mounted.current) setDeciding(false);
    }
  };

  const decline = async () => {
    if (!incoming) return;
    setDeciding(true);
    setDecideError(null);
    try {
      await api.declinePairingRequest(incoming.requestId);
      if (!mounted.current) return;
      setIncoming(null);
      setApprovedNotice(null);
      setSession(null); // the code was consumed by the request; make a fresh one
      setSessionError(null);
      await createSession();
    } catch (e) {
      if (mounted.current) setDecideError(describeError(e));
    } finally {
      if (mounted.current) setDeciding(false);
    }
  };

  const confirmErase = () => {
    Alert.alert(
      'Stop sharing and delete server data?',
      'Everyone loses access, and everything stored on the DoseSaathi server for this phone is deleted. Your medicines and reminders on this phone stay exactly as they are. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setErasing(true);
            setEraseError(null);
            try {
              await stopSharingAndEraseServerData();
              setSession(null);
              setHasIdentity(false);
            } catch (e) {
              // Nothing is reported as deleted unless the server confirmed it
              setEraseError(describeError(e));
            } finally {
              setErasing(false);
            }
          },
        },
      ]
    );
  };

  const confirmRevoke = (id: string, who: string) => {
    Alert.alert(
      `Remove ${who}'s access?`,
      'They will stop seeing your medicine information. Your own medicines are not changed.',
      [
        { text: 'Keep access', style: 'cancel' },
        { text: 'Remove access', style: 'destructive', onPress: () => doRevoke(id) },
      ]
    );
  };

  const doRevoke = async (id: string) => {
    setRevokingId(id);
    setRevokeError(null);
    try {
      await api.revokeRelationship(id);
      await refreshPatientRelationships();
    } catch (e) {
      if (mounted.current) setRevokeError(describeError(e));
    } finally {
      if (mounted.current) setRevokingId(null);
    }
  };

  const later = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(patient)/(tabs)/today');
  };

  // ---------------------------------------------------------------------------

  const header = (
    <View style={styles.headerBlock}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>Link a family member</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Let someone you trust see your medicine schedule from their phone. You choose what they can see, and you can remove access at any time.
      </Text>
    </View>
  );

  const privacy = (
    <Text style={[styles.footnote, { color: colors.textSecondary }]}>
      Information between your phone and the DoseSaathi server is sent over HTTPS. Sharing is optional: your reminders and medicines work the same without it.
    </Text>
  );

  if (!api.isConfigured) {
    return (
      <AppScreen>
        {header}
        <Notice tone="info">
          Family sharing needs a DoseSaathi server, and this build of the app has none configured. Your own medicines, reminders and dose history keep working on this phone.
        </Notice>
        <SecondaryButton title="I'll do this later" onPress={later} />
      </AppScreen>
    );
  }

  if (hasIdentity === null) {
    return (
      <AppScreen>
        {header}
        <ActivityIndicator color={colors.primary} size="large" accessibilityLabel="Loading" />
      </AppScreen>
    );
  }

  if (!hasIdentity) {
    return (
      <AppScreen>
        {header}
        {!isOnline && <Notice tone="warning">You appear to be offline. Starting family sharing needs a connection.</Notice>}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Start sharing</Text>
          <Text style={[styles.body, { color: colors.textSecondary, marginBottom: Spacing.md }]}>
            This creates a sharing identity for this phone on the server. No account or password is needed. Your medicines stay on your phone until you approve someone.
          </Text>
          <FormField
            label="Name your family will see"
            value={name}
            onChangeText={setName}
            placeholder="For example, Mum"
            maxLength={80}
            autoCapitalize="words"
            error={startError?.kind === 'other' && !startError.message.startsWith("Can't") ? startError.message : undefined}
          />
          {startError && startError.kind !== 'other' && <Notice tone="error">{startError.message}</Notice>}
          <PrimaryButton title="Start sharing" onPress={handleStart} loading={starting} disabled={!name.trim()} />
        </View>
        <SecondaryButton title="I'll do this later" onPress={later} />
        {privacy}
      </AppScreen>
    );
  }

  const code = session ? formatPairingCode(session.pairingCode) : '';
  const activePeople = patientRelationships.filter((r) => r.status === 'ACTIVE');
  const pastPeople = patientRelationships.filter((r) => r.status !== 'ACTIVE');

  return (
    <AppScreen>
      {header}
      {!isOnline && <Notice tone="warning">You appear to be offline. New requests will not show up until you are back online.</Notice>}

      {approvedNotice && <Notice tone="success">{approvedNotice}</Notice>}

      {hasPending && incoming ? (
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]} accessibilityLabel="Family request">
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Someone wants to connect</Text>
          <Text style={[styles.personName, { color: colors.textPrimary }]}>{incoming.caregiverDisplayName}</Text>
          <Text style={[styles.bodyMuted, { color: colors.textSecondary }]}>{incoming.caregiverEmail}</Text>
          <Text style={[styles.body, { color: colors.textSecondary, marginTop: Spacing.md }]}>
            Check that you know this person. Choose what they may do:
          </Text>
          <PermissionToggles value={perms} onChange={setPerms} labels={PATIENT_PERMISSION_TEXT} disabled={deciding} />
          <FormField
            label="How do you know them?"
            value={label}
            onChangeText={setLabel}
            placeholder="For example, Daughter"
            maxLength={40}
            autoCapitalize="words"
          />
          {decideError && <Notice tone="error">{decideError.message}</Notice>}
          <PrimaryButton title="Approve" onPress={approve} loading={deciding} icon="check" />
          <DestructiveButton title="Decline" onPress={decline} disabled={deciding} />
        </View>
      ) : (
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {sessionLoading && !session ? (
            <View style={styles.centered}>
              <ActivityIndicator color={colors.primary} size="large" accessibilityLabel="Creating your code" />
              <Text style={[styles.bodyMuted, { color: colors.textSecondary }]}>Creating your code...</Text>
            </View>
          ) : sessionError && !session ? (
            <>
              <Notice tone="error">{sessionError.message}</Notice>
              {sessionError.kind !== 'unconfigured' && <PrimaryButton title="Try again" onPress={createSession} />}
            </>
          ) : session ? (
            <>
              <View style={[styles.tabs, { backgroundColor: colors.surfaceSecondary }]} accessibilityRole="tablist">
                {(['code', 'qr'] as const).map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[
                      styles.tab,
                      tab === t && [styles.tabActive, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }],
                    ]}
                    onPress={() => setTab(t)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: tab === t }}
                  >
                    <Text
                      style={[
                        styles.tabText,
                        { color: tab === t ? colors.primary : colors.textSecondary },
                        tab === t && styles.tabTextActive,
                      ]}
                      numberOfLines={2}
                    >
                      {t === 'code' ? 'Numeric code' : 'QR code'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {sessionDead ? (
                <View style={styles.centered}>
                  <MaterialIcons name="timer-off" size={36} color={colors.warning} />
                  <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>This code has expired</Text>
                  <Text style={[styles.bodyMuted, { color: colors.textSecondary }]}>Create a new code to keep going.</Text>
                </View>
              ) : tab === 'code' ? (
                <View style={styles.centered}>
                  <Text style={[styles.bodyMuted, { color: colors.textSecondary }]}>Ask your family member to enter this code in DoseSaathi</Text>
                  <Text
                    style={[styles.code, { color: colors.primary }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.6}
                    accessibilityLabel={`Pairing code ${session.pairingCode.split('').join(' ')}`}
                  >
                    {code}
                  </Text>
                  <SecondaryButton
                    title={copied ? 'Copied' : 'Copy code'}
                    onPress={copyCode}
                    icon={<MaterialIcons name={copied ? 'check' : 'content-copy'} size={20} color={colors.primary} />}
                  />
                </View>
              ) : (
                <View style={styles.centered}>
                  <Text style={[styles.bodyMuted, { color: colors.textSecondary }]}>Ask your family member to scan this in DoseSaathi</Text>
                  <View style={[styles.qrBox, { borderColor: colors.border, backgroundColor: '#FFFFFF' }]} accessible accessibilityLabel="QR code for pairing">
                    <QRCode value={session.qrPayload} size={200} color="#1F302C" backgroundColor="#FFFFFF" />
                  </View>
                </View>
              )}

              {!sessionDead && (
                <View style={styles.countdownRow}>
                  <MaterialIcons name="schedule" size={18} color={colors.textSecondary} />
                  <Text style={[styles.bodyMuted, { color: colors.textSecondary }]} accessibilityLiveRegion="polite">
                    Expires in {countdown.label}
                  </Text>
                </View>
              )}
              {sessionError && <Notice tone="error">{sessionError.message}</Notice>}
              {pollNote && !sessionDead && (
                <Notice tone="warning">
                  {pollNote.kind === 'network'
                    ? "Can't check for requests right now. Still trying."
                    : pollNote.message}
                </Notice>
              )}
              {!sessionDead && !pollNote && (
                <View style={styles.countdownRow}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={[styles.bodyMuted, { color: colors.textSecondary }]}>Waiting for the phone to connect</Text>
                </View>
              )}
              <SecondaryButton
                title={sessionDead ? 'Create new code' : 'Regenerate code'}
                onPress={regenerate}
                loading={sessionLoading}
                icon={<MaterialIcons name="refresh" size={20} color={colors.primary} />}
              />
              {!sessionDead && <Text style={[styles.footnote, { color: colors.textSecondary }]}>Regenerating makes the old code stop working.</Text>}
            </>
          ) : (
            <PrimaryButton title="Create a code" onPress={createSession} loading={sessionLoading} />
          )}
        </View>
      )}

      <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>People with access</Text>
      {revokeError && <Notice tone="error">{revokeError.message}</Notice>}
      {activePeople.length === 0 ? (
        <Text style={[styles.bodyMuted, { color: colors.textSecondary }]}>No one can see your medicines yet.</Text>
      ) : (
        activePeople.map((r) => (
          <View key={r.relationshipId} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.personName, { color: colors.textPrimary }]}>{r.caregiverDisplayName}</Text>
            <Text style={[styles.bodyMuted, { color: colors.textSecondary }]}>
              {r.relationshipLabel} · {r.caregiverEmail}
            </Text>
            <View style={styles.statusRow}>
              <MaterialIcons name="check-circle" size={18} color={colors.success} />
              <Text style={[styles.statusText, { color: colors.success }]}>{statusText(r.status)}</Text>
            </View>
            {describePermissions(r.permissions, 'patient').map((t) => (
              <Text key={t} style={[styles.permLine, { color: colors.textPrimary }]}>
                {'•'} {t}
              </Text>
            ))}
            <DestructiveButton
              title="Remove access"
              loading={revokingId === r.relationshipId}
              disabled={revokingId !== null}
              onPress={() => confirmRevoke(r.relationshipId, r.caregiverDisplayName)}
            />
          </View>
        ))
      )}
      {pastPeople.map((r) => (
        <View key={r.relationshipId} style={[styles.cardMuted, { backgroundColor: colors.surfaceSecondary }]}>
          <Text style={[styles.personName, { color: colors.textPrimary }]}>{r.caregiverDisplayName}</Text>
          <View style={styles.statusRow}>
            <MaterialIcons name="block" size={18} color={colors.textSecondary} />
            <Text style={[styles.bodyMuted, { color: colors.textSecondary }]}>{statusText(r.status)}</Text>
          </View>
        </View>
      ))}

      <SecondaryButton title="I'll do this later" onPress={later} />
      {privacy}

      <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Stop sharing</Text>
      <Text style={[styles.bodyMuted, { color: colors.textSecondary }]}>
        Removes everyone's access and deletes what the DoseSaathi server stores for this phone. Your medicines on
        this phone are not deleted.
      </Text>
      {eraseError && <Notice tone="error">{eraseError.message}</Notice>}
      <DestructiveButton title="Stop sharing and delete server data" onPress={confirmErase} loading={erasing} />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  headerBlock: { marginBottom: Spacing.lg },
  title: { ...Typography.headlineLarge },
  subtitle: { ...Typography.bodyMedium, marginTop: Spacing.xs },
  card: {
    borderWidth: 1,
    borderRadius: Radii.card,
    padding: Spacing.xl,
    marginVertical: Spacing.sm,
  },
  cardMuted: {
    borderRadius: Radii.card,
    padding: Spacing.lg,
    marginVertical: Spacing.sm,
  },
  cardTitle: { ...Typography.headlineSmall, marginBottom: Spacing.xs, textAlign: 'center' },
  sectionTitle: { ...Typography.headlineMedium, marginTop: Spacing.xl, marginBottom: Spacing.sm },
  body: { ...Typography.bodyMedium },
  bodyMuted: { ...Typography.bodyMedium, textAlign: 'center' },
  footnote: { ...Typography.bodySmall, marginTop: Spacing.md },
  personName: { ...Typography.headlineSmall },
  centered: { alignItems: 'center', paddingVertical: Spacing.md, gap: Spacing.sm },
  code: { maxWidth: '100%', fontFamily: FontFamily.bold, fontSize: 44, lineHeight: 52, letterSpacing: 4, marginVertical: Spacing.sm },
  qrBox: { padding: Spacing.lg, borderRadius: Radii.md, borderWidth: 1 },
  tabs: {
    flexDirection: 'row',
    borderRadius: Radii.md,
    padding: 4,
    marginBottom: Spacing.md,
  },
  tab: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: Radii.sm },
  tabActive: {},
  tabText: { ...Typography.labelMedium, textAlign: 'center' },
  tabTextActive: {},
  countdownRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, marginVertical: Spacing.xs },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginVertical: Spacing.sm },
  statusText: { ...Typography.labelMedium },
  permLine: { ...Typography.bodyMedium, marginLeft: Spacing.sm },
});
