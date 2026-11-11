import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, Linking, Pressable } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { MaterialIcons } from '@expo/vector-icons';
import type { PermissionKey } from '@medchain/contracts';
import { AppScreen } from '@/components/AppScreen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { PrimaryButton, SecondaryButton, DestructiveButton } from '@/components/Buttons';
import { Colors, Spacing, Typography, Radii } from '@/theme/tokens';
import { useApp } from '@/state/AppContext';
import { Notice } from '@/pairing/Notice';
import { FormScreen } from '@/caregiver/ui';
import { PermissionToggles } from '@/pairing/PermissionToggles';
import { describeError, FriendlyError } from '@/pairing/errors';
import { nextPollDelay, sanitizeCodeInput } from '@/pairing/format';
import { parsePairingPayload } from '@/pairing/qr';
import { ALL_PERMISSIONS, CAREGIVER_PERMISSION_TEXT, PairingPermission } from '@/pairing/permissions';

type Credential = { code: string } | { sessionId: string; secret: string };
type Step = 'entry' | 'choose' | 'waiting' | 'declined' | 'cancelled' | 'expired' | 'failed';

const POLL_BASE_MS = 3000;

export default function CaregiverConnectScreen() {
  const router = useRouter();
  const { api, caregiver, caregiverLoading, refreshRelationships, setSelectedRelationship, isOnline } = useApp();
  const [camPerm, requestCamPerm] = useCameraPermissions();

  const [method, setMethod] = useState<'code' | 'scan'>('code');
  const [digits, setDigits] = useState('');
  const [step, setStep] = useState<Step>('entry');
  const [credential, setCredential] = useState<Credential | null>(null);
  const [patientName, setPatientName] = useState('');
  const [perms, setPerms] = useState<PairingPermission[]>([...ALL_PERMISSIONS]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<FriendlyError | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [pollNote, setPollNote] = useState<FriendlyError | null>(null);
  const [focused, setFocused] = useState(false);
  const [scanLocked, setScanLocked] = useState(false);
  const [recheck, setRecheck] = useState(0);

  const mounted = useRef(true);
  const inputRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, [])
  );

  const toSignIn = useCallback(() => {
    router.push('/(caregiver)/sign-in?next=/(caregiver)/connect' as any);
  }, [router]);

  const handleError = (e: unknown) => {
    const fe = describeError(e);
    if (fe.kind === 'auth') {
      setError(fe);
      return;
    }
    setError(fe);
  };

  const reset = () => {
    setStep('entry');
    setCredential(null);
    setRequestId(null);
    setError(null);
    setPollNote(null);
    setDigits('');
    setScanLocked(false);
    setPerms([...ALL_PERMISSIONS]);
  };

  // ---- validate -------------------------------------------------------------
  const validate = async (cred: Credential) => {
    setBusy(true);
    setError(null);
    try {
      const v = await api.validatePairing(cred);
      if (!mounted.current) return;
      setCredential(cred);
      setPatientName(v.patientDisplayName);
      setStep('choose');
    } catch (e) {
      if (mounted.current) {
        handleError(e);
        setScanLocked(false);
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const onValidateCode = () => {
    if (digits.length !== 6) {
      setError({ kind: 'other', message: 'Enter all 6 digits of the code.' });
      return;
    }
    validate({ code: digits });
  };

  const onScanned = (data: string) => {
    if (scanLocked || busy) return;
    setScanLocked(true);
    const parsed = parsePairingPayload(data);
    if (!parsed) {
      setError({ kind: 'code_invalid', message: 'That QR code is not a DoseSaathi pairing code. Try again or enter the 6-digit code instead.' });
      setTimeout(() => mounted.current && setScanLocked(false), 2500);
      return;
    }
    validate(parsed);
  };

  const paste = async () => {
    try {
      const text = await Clipboard.getStringAsync();
      const d = sanitizeCodeInput(text);
      if (d) setDigits(d);
      else setError({ kind: 'other', message: 'There is no 6-digit code on your clipboard.' });
    } catch {
      setError({ kind: 'other', message: "Couldn't read the clipboard." });
    }
  };

  // ---- send request ---------------------------------------------------------
  const sendRequest = async () => {
    if (!credential) return;
    if (perms.length === 0) {
      setError({ kind: 'other', message: 'Choose at least one thing you would like to do.' });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await api.createPairingRequest(credential, perms as PermissionKey[]);
      if (!mounted.current) return;
      setRequestId(r.requestId);
      setPatientName(r.patientDisplayName || patientName);
      setStep('waiting');
    } catch (e) {
      if (!mounted.current) return;
      const fe = describeError(e);
      setError(fe);
      if (fe.kind === 'code_invalid' || fe.kind === 'expired') {
        // Code is gone: they need a fresh one
        setStep('entry');
        setCredential(null);
        setScanLocked(false);
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  // ---- poll status ----------------------------------------------------------
  useEffect(() => {
    if (step !== 'waiting' || !requestId || !focused) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let errors = 0;
    const tick = async () => {
      let retryAfter: number | undefined;
      try {
        const s = await api.getPairingRequestStatus(requestId);
        if (cancelled) return;
        errors = 0;
        setPollNote(null);
        if (s.status === 'APPROVED') {
          const rel = s.relationship;
          if (!rel || !rel.relationshipId) {
            setError({ kind: 'other', message: "The patient approved, but the connection couldn't be verified with the server yet." });
            setStep('failed');
            return;
          }
          await refreshRelationships();
          if (cancelled) return;
          setSelectedRelationship({
            relationshipId: rel.relationshipId,
            patientName: rel.patientDisplayName,
            relationshipLabel: rel.relationshipLabel,
            permissions: rel.permissions,
          });
          router.replace('/(caregiver)/(tabs)/family' as any);
          return;
        }
        if (s.status === 'DECLINED') return setStep('declined');
        if (s.status === 'CANCELLED') return setStep('cancelled');
        if (s.status === 'EXPIRED') return setStep('expired');
      } catch (e) {
        if (cancelled) return;
        const fe = describeError(e);
        if (fe.kind === 'auth') {
          setError(fe);
          setStep('failed');
          return;
        }
        if ((e as any)?.status === 404) {
          setError({ kind: 'other', message: 'This request could not be found on the server.' });
          setStep('failed');
          return;
        }
        errors += 1;
        retryAfter = fe.retryAfterSeconds;
        setPollNote(fe);
      }
      if (!cancelled) timer = setTimeout(tick, nextPollDelay(POLL_BASE_MS, errors, 30000, retryAfter));
    };
    timer = setTimeout(tick, 1500);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, requestId, focused, recheck, api]);

  const cancelRequest = async () => {
    if (!requestId) return reset();
    setBusy(true);
    setError(null);
    try {
      await api.cancelPairingRequest(requestId);
      if (mounted.current) setStep('cancelled');
    } catch (e) {
      if (mounted.current) handleError(e);
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const later = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(caregiver)/(tabs)/family' as any);
  };

  // ---- render ---------------------------------------------------------------

  const header = (
    <ScreenHeader
      title="Connect to family"
      subtitle="Enter the 6-digit code shown on your family member's phone, or scan their QR code. They must approve the link."
      showBack
    />
  );

  if (caregiverLoading) {
    return (
      <AppScreen>
        {header}
        <ActivityIndicator color={Colors.brand} size="large" accessibilityLabel="Loading" />
      </AppScreen>
    );
  }

  if (!caregiver) {
    return (
      <AppScreen>
        {header}
        <View style={styles.card}>
          <View style={styles.rowCenter}>
            <MaterialIcons name="info-outline" size={22} color={Colors.warning} />
            <Text style={styles.cardTitle}>Sign in required</Text>
          </View>
          <Text style={styles.body}>
            To connect with a family member you need a caregiver account. It is only used to link you with the people you care for.
          </Text>
          <PrimaryButton title="Sign in or create account" onPress={toSignIn} />
        </View>
        <SecondaryButton title="I'll do this later" onPress={later} />
      </AppScreen>
    );
  }

  const account = (
    <View style={styles.accountRow} accessibilityLabel={`Signed in as ${caregiver.displayName}, ${caregiver.email}`}>
      <MaterialIcons name="person" size={24} color={Colors.brand} />
      <View style={{ flex: 1 }}>
        <Text style={styles.labelStrong}>{caregiver.displayName}</Text>
        <Text style={styles.muted}>{caregiver.email}</Text>
      </View>
    </View>
  );

  const errorBlock = error && (
    <Notice tone="error">{error.message}</Notice>
  );
  const needsSignIn = error?.kind === 'auth';

  // Terminal / waiting states
  if (step === 'waiting') {
    return (
      <AppScreen>
        {header}
        <View style={styles.card} accessibilityLiveRegion="polite">
          <ActivityIndicator color={Colors.brand} size="large" />
          <Text style={[styles.cardTitle, { textAlign: 'center', marginTop: Spacing.md }]}>Waiting for approval</Text>
          <Text style={[styles.body, { textAlign: 'center' }]}>
            {patientName ? `${patientName} needs to approve your request on their phone.` : 'They need to approve your request on their phone.'} This screen updates by itself.
          </Text>
        </View>
        {pollNote && <Notice tone="warning">{pollNote.kind === 'network' ? "Can't check right now. Still trying." : pollNote.message}</Notice>}
        {errorBlock}
        <DestructiveButton title="Cancel request" onPress={cancelRequest} loading={busy} />
      </AppScreen>
    );
  }

  if (step === 'declined' || step === 'cancelled' || step === 'expired' || step === 'failed') {
    const info = {
      declined: { icon: 'cancel' as const, title: 'Request declined', text: `${patientName || 'They'} chose not to connect. You can ask them to create a new code if this was a mistake.` },
      cancelled: { icon: 'block' as const, title: 'Request cancelled', text: 'Nothing was shared. You can start again with a new code.' },
      expired: { icon: 'timer-off' as const, title: 'Request expired', text: 'The request was not answered in time. Ask for a new code and try again.' },
      failed: { icon: 'error-outline' as const, title: 'Connection not completed', text: 'We could not confirm this connection with the server.' },
    }[step];
    return (
      <AppScreen>
        {header}
        <View style={styles.card}>
          <View style={styles.rowCenter}>
            <MaterialIcons name={info.icon} size={26} color={step === 'failed' ? Colors.danger : Colors.warning} />
            <Text style={styles.cardTitle}>{info.title}</Text>
          </View>
          <Text style={styles.body}>{info.text}</Text>
        </View>
        {errorBlock}
        {needsSignIn && <PrimaryButton title="Sign in again" onPress={toSignIn} />}
        {step === 'failed' && requestId && !needsSignIn && (
          <PrimaryButton
            title="Check again"
            onPress={() => {
              setError(null);
              setStep('waiting');
              setRecheck((n) => n + 1);
            }}
          />
        )}
        <SecondaryButton title="Start over" onPress={reset} />
        <SecondaryButton title="I'll do this later" onPress={later} />
      </AppScreen>
    );
  }

  if (step === 'choose') {
    return (
      <AppScreen>
        {header}
        {account}
        <View style={styles.card}>
          <Text style={styles.muted}>Found</Text>
          <Text style={styles.personName}>{patientName}</Text>
          <Text style={[styles.body, { marginTop: Spacing.md }]}>What would you like to be able to do? {patientName} can approve all, some or none of these.</Text>
          <PermissionToggles value={perms} onChange={setPerms} labels={CAREGIVER_PERMISSION_TEXT} disabled={busy} />
        </View>
        {!isOnline && <Notice tone="warning">You appear to be offline. Sending the request needs a connection.</Notice>}
        {errorBlock}
        {needsSignIn && <PrimaryButton title="Sign in again" onPress={toSignIn} />}
        <PrimaryButton title="Send request" onPress={sendRequest} loading={busy} disabled={perms.length === 0} />
        <SecondaryButton title="Back" onPress={reset} disabled={busy} />
      </AppScreen>
    );
  }

  // step === 'entry'
  const camDenied = camPerm && !camPerm.granted && !camPerm.canAskAgain;
  return (
    <FormScreen>
      {header}
      {account}

      <View style={styles.tabs} accessibilityRole="tablist">
        {(['code', 'scan'] as const).map((m) => (
          <TouchableOpacity
            key={m}
            style={[styles.tab, method === m && styles.tabActive]}
            onPress={() => {
              setMethod(m);
              setError(null);
              setScanLocked(false);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: method === m }}
          >
            <MaterialIcons name={m === 'code' ? 'pin' : 'qr-code-scanner'} size={20} color={method === m ? Colors.primary : Colors.inkMuted} />
            <Text style={[styles.tabText, method === m && { color: Colors.primary }]}>{m === 'code' ? 'Enter code' : 'Scan QR'}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {method === 'code' ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Pairing code</Text>
          <Text style={styles.muted}>Six numbers shown on the family member's Family tab.</Text>
          <Pressable style={styles.boxes} onPress={() => inputRef.current?.focus()} accessibilityRole="button" accessibilityLabel={`Code entry, ${digits.length} of 6 digits entered. Double tap to type.`}>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <React.Fragment key={i}>
                {i === 3 && <Text style={styles.dash}>-</Text>}
                <View style={[styles.box, digits.length === i && styles.boxActive]}>
                  <Text style={styles.boxText}>{digits[i] ?? ''}</Text>
                </View>
              </React.Fragment>
            ))}
            <TextInput
              ref={inputRef}
              value={digits}
              onChangeText={(t) => setDigits(sanitizeCodeInput(t))}
              keyboardType="number-pad"
              maxLength={7}
              style={styles.hiddenInput}
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              caretHidden
              accessibilityLabel="Six digit pairing code"
              onSubmitEditing={onValidateCode}
            />
          </Pressable>
          <View style={styles.pasteRow}>
            <TouchableOpacity style={styles.linkBtn} onPress={paste} accessibilityRole="button" accessibilityLabel="Paste code">
              <MaterialIcons name="content-paste" size={20} color={Colors.brand} />
              <Text style={styles.linkText}>Paste code</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.linkBtn} onPress={() => setDigits('')} accessibilityRole="button" accessibilityLabel="Clear code">
              <MaterialIcons name="backspace" size={20} color={Colors.brand} />
              <Text style={styles.linkText}>Clear</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Scan their QR code</Text>
          {!camPerm ? (
            <ActivityIndicator color={Colors.brand} />
          ) : camPerm.granted ? (
            <View style={styles.cameraBox}>
              {focused && (
                <CameraView
                  style={StyleSheet.absoluteFill}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                  onBarcodeScanned={scanLocked ? undefined : (r) => onScanned(r.data)}
                  accessibilityLabel="Camera viewfinder for scanning a pairing QR code"
                />
              )}
            </View>
          ) : camDenied ? (
            <>
              <Notice tone="warning">Camera access is turned off for DoseSaathi. You can allow it in Settings, or enter the 6-digit code instead.</Notice>
              <SecondaryButton title="Open Settings" onPress={() => Linking.openSettings()} />
              <PrimaryButton title="Enter code instead" onPress={() => setMethod('code')} />
            </>
          ) : (
            <>
              <Text style={styles.body}>DoseSaathi uses the camera only to read the QR code on your family member's phone. Nothing is recorded or saved.</Text>
              <PrimaryButton title="Allow camera" onPress={() => requestCamPerm()} />
              <SecondaryButton title="Enter code instead" onPress={() => setMethod('code')} />
            </>
          )}
          {busy && <ActivityIndicator color={Colors.brand} style={{ marginTop: Spacing.md }} />}
        </View>
      )}

      {errorBlock}
      {needsSignIn && <PrimaryButton title="Sign in again" onPress={toSignIn} />}
      {method === 'code' && (
        <PrimaryButton title="Check code" onPress={onValidateCode} loading={busy} disabled={digits.length !== 6} />
      )}
      <SecondaryButton title="I'll do this later" onPress={later} />
      <Text style={styles.footnote}>
        The person you connect with must approve your request, and can remove your access at any time. A code or QR is checked with the server before anything happens.
      </Text>
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderColor: Colors.outline,
    borderWidth: 1,
    borderRadius: Radii.card,
    padding: Spacing.xl,
    marginVertical: Spacing.sm,
  },
  cardTitle: { ...Typography.headlineSmall, flexShrink: 1 },
  rowCenter: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  body: { ...Typography.bodyMedium },
  muted: { ...Typography.bodySmall },
  footnote: { ...Typography.bodySmall, marginTop: Spacing.md },
  labelStrong: { ...Typography.labelMedium },
  personName: { ...Typography.headlineMedium },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.brandSoft,
    borderRadius: Radii.card,
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  tabs: { flexDirection: 'row', backgroundColor: Colors.surfaceMuted, borderRadius: Radii.md, padding: 4, marginVertical: Spacing.sm },
  tab: { flex: 1, minHeight: 48, paddingVertical: Spacing.xs, paddingHorizontal: Spacing.xs, flexDirection: 'row', gap: Spacing.xs, alignItems: 'center', justifyContent: 'center', borderRadius: Radii.sm },
  tabActive: { backgroundColor: Colors.surface },
  tabText: { ...Typography.labelMedium, color: Colors.inkMuted, flexShrink: 1 },
  boxes: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.xs, marginVertical: Spacing.lg },
  box: {
    flex: 1,
    maxWidth: 48,
    minWidth: 34,
    minHeight: 60,
    borderRadius: Radii.md,
    borderWidth: 1.5,
    borderColor: Colors.outline,
    backgroundColor: Colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxActive: { borderColor: Colors.brand },
  boxText: { fontSize: 26, lineHeight: 32, fontWeight: '700', color: Colors.ink },
  dash: { ...Typography.headlineSmall, color: Colors.inkMuted },
  hiddenInput: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, opacity: 0.02, color: 'transparent' },
  pasteRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', columnGap: Spacing.lg },
  linkBtn: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  linkText: { ...Typography.labelMedium, color: Colors.brand, flexShrink: 1 },
  cameraBox: { height: 300, borderRadius: Radii.card, overflow: 'hidden', backgroundColor: Colors.ink, marginTop: Spacing.md },
});
