import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ScreenHeader } from '@/components/ScreenHeader';
import { PrimaryButton } from '@/components/Buttons';
import { FormField } from '@/components/FormField';
import { Colors, Spacing, Typography } from '@/theme/tokens';
import { useApp } from '@/state/AppContext';
import { Notice } from '@/pairing/Notice';
import { FormScreen } from '@/caregiver/ui';
import { describeError } from '@/pairing/errors';
import { validateEmail, validatePassword } from '@/pairing/format';

type Mode = 'signin' | 'signup';

/** Only allow in-app absolute routes as a post-login target. */
function safeNext(next: string | string[] | undefined): string {
  const v = Array.isArray(next) ? next[0] : next;
  if (v && v.startsWith('/') && !v.startsWith('//') && !v.includes(':')) return v;
  return '/(caregiver)/connect';
}

export default function CaregiverSignInScreen() {
  const router = useRouter();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const { api, signInCaregiver, signUpCaregiver } = useApp();

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [touched, setTouched] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const emailErr = touched ? validateEmail(email) : null;
  const pwErr = touched ? (mode === 'signup' ? validatePassword(password) : password ? null : 'Enter your password.') : null;
  const nameErr = touched && mode === 'signup' && !displayName.trim() ? 'Enter the name your family will see.' : null;

  const submit = async () => {
    setTouched(true);
    setFormError(null);
    setServerErrors({});
    const bad =
      validateEmail(email) ||
      (mode === 'signup' ? validatePassword(password) : password ? null : 'x') ||
      (mode === 'signup' && !displayName.trim());
    if (bad) return;
    setSubmitting(true);
    try {
      if (mode === 'signup') await signUpCaregiver(email.trim(), password, displayName.trim());
      else await signInCaregiver(email.trim(), password);
      if (mounted.current) router.replace(safeNext(next) as any);
    } catch (e) {
      if (!mounted.current) return;
      const err = e as { fieldErrors?: Array<{ field: string; message: string }> };
      if (err.fieldErrors?.length) {
        const m: Record<string, string> = {};
        for (const f of err.fieldErrors) m[f.field] = f.message;
        setServerErrors(m);
      }
      const fe = describeError(e);
      setFormError(err.fieldErrors?.length ? 'Please fix the highlighted fields.' : fe.message);
    } finally {
      if (mounted.current) setSubmitting(false);
    }
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setFormError(null);
    setServerErrors({});
    setTouched(false);
  };

  return (
    <FormScreen>
      <View>
        <ScreenHeader
          title={mode === 'signin' ? 'Caregiver sign in' : 'Create caregiver account'}
          subtitle="An account lets you connect to a family member's medicine schedule."
          showBack
        />

        {!api.isConfigured && (
          <Notice tone="warning">This build has no DoseSaathi server configured, so you cannot sign in. Personal medicine reminders still work.</Notice>
        )}

        {mode === 'signup' && (
          <FormField
            label="Your name"
            helper="Shown to the person you connect with."
            value={displayName}
            onChangeText={setDisplayName}
            autoCapitalize="words"
            autoComplete="name"
            textContentType="name"
            maxLength={80}
            error={nameErr ?? serverErrors.displayName}
          />
        )}
        <FormField
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          autoComplete="email"
          textContentType="emailAddress"
          error={emailErr ?? serverErrors.email}
        />
        <FormField
          label="Password"
          helper={mode === 'signup' ? 'At least 10 characters.' : undefined}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          textContentType={mode === 'signup' ? 'newPassword' : 'password'}
          error={pwErr ?? serverErrors.password}
          onSubmitEditing={submit}
        />

        {formError && <Notice tone="error">{formError}</Notice>}

        <PrimaryButton
          title={mode === 'signin' ? 'Sign in' : 'Create account'}
          onPress={submit}
          loading={submitting}
          disabled={!api.isConfigured}
        />

        <TouchableOpacity
          style={styles.switch}
          onPress={() => switchMode(mode === 'signin' ? 'signup' : 'signin')}
          accessibilityRole="button"
        >
          <Text style={styles.switchText}>
            {mode === 'signin' ? 'New here? Create an account' : 'Already have an account? Sign in'}
          </Text>
        </TouchableOpacity>

        <Text style={styles.note}>
          This account exists only to link you with family members. You do not need one to use DoseSaathi for your own medicines.
          Your details are sent to the DoseSaathi server over HTTPS.
        </Text>
      </View>
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  switch: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: Spacing.sm },
  switchText: { ...Typography.labelMedium, color: Colors.brand },
  note: { ...Typography.bodySmall, marginTop: Spacing.lg },
});
