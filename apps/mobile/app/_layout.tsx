import '@/utils/uuid';
import React, { useEffect, useRef } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider, useApp } from '@/state/AppContext';
import { StatusBar } from 'expo-status-bar';
import { Colors } from '@/theme/tokens';
import {
  useFonts,
  AtkinsonHyperlegibleNext_400Regular,
  AtkinsonHyperlegibleNext_500Medium,
  AtkinsonHyperlegibleNext_600SemiBold,
  AtkinsonHyperlegibleNext_700Bold,
} from '@expo-google-fonts/atkinson-hyperlegible-next';
import { setupNotificationInfrastructure } from '@/services/permission-service';
// Defines the push-doorbell task at module scope so the OS can start it in the background
import { registerBackgroundSync } from '@/sync/background-sync';

type NotificationResponse = {
  actionIdentifier: string;
  notification: { request: { identifier: string; content: { data?: any } } };
};

/**
 * Routes notification taps and action buttons into the same domain services the in-app UI uses.
 * Responses that arrive before the database is ready (cold start from a notification action) are held
 * and handled once it is, so a "Taken" tap on a killed app is not lost.
 */
function NotificationLifecycleManager({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isReady, db, recordDoseTaken, recordDoseSnooze } = useApp();
  const pending = useRef<NotificationResponse[]>([]);
  const handledKeys = useRef<Set<string>>(new Set());
  const readyRef = useRef(false);

  const handle = useRef(async (response: NotificationResponse) => {});
  handle.current = async (response: NotificationResponse) => {
    const key = `${response.notification.request.identifier}:${response.actionIdentifier}`;
    if (handledKeys.current.has(key)) return;
    handledKeys.current.add(key);

    const data = response.notification.request.content.data ?? {};
    const { occurrenceId, medicationId, type } = data;

    if (type === 'LOW_STOCK' && medicationId) {
      router.push(`/medicine/${medicationId}`);
      return;
    }
    if (!occurrenceId || !medicationId || data.isTest) return;

    try {
      if (response.actionIdentifier === 'ACTION_TAKEN') {
        await recordDoseTaken(medicationId, occurrenceId);
      } else if (response.actionIdentifier === 'ACTION_SNOOZE') {
        await recordDoseSnooze(medicationId, occurrenceId);
      } else {
        // Banner tap or "Skip" (needs the follow-up choice UI): open the alarm screen
        router.push(`/alarm/${occurrenceId}`);
      }
    } catch (err) {
      // If the action could not be saved, show the alarm screen so the user can retry explicitly
      router.push(`/alarm/${occurrenceId}`);
    }
  };

  useEffect(() => {
    readyRef.current = isReady && !!db;
    if (readyRef.current) {
      const queued = pending.current.splice(0);
      queued.forEach((r) => handle.current(r));
    }
  }, [isReady, db]);

  useEffect(() => {
    setupNotificationInfrastructure();
    registerBackgroundSync();
    let responseSub: any = null;
    let receivedSub: any = null;
    let cancelled = false;

    import('expo-notifications')
      .then(async (Notifications) => {
        if (cancelled) return;
        const dispatch = (r: NotificationResponse) => {
          if (readyRef.current) handle.current(r);
          else pending.current.push(r);
        };

        responseSub = Notifications.addNotificationResponseReceivedListener((r) => dispatch(r as any));

        // App was launched by a notification tap/action while it was not running
        try {
          const last = await Notifications.getLastNotificationResponseAsync();
          if (last) dispatch(last as any);
        } catch {}

        // An alarm firing while the app is in the foreground opens the alarm screen directly
        receivedSub = Notifications.addNotificationReceivedListener((notification) => {
          const data = notification?.request?.content?.data as any;
          if (data?.occurrenceId && data?.medicationId && !data?.isTest) {
            router.push(`/alarm/${data.occurrenceId}`);
          }
        });
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      responseSub?.remove?.();
      receivedSub?.remove?.();
    };
  }, [router]);

  return <>{children}</>;
}

/**
 * Shown by expo-router if a screen throws while rendering, instead of a blank app. Reminders are
 * native alarms, so they keep ringing even while this is on screen.
 */
export function ErrorBoundary({ retry }: { error: Error; retry: () => void }) {
  return (
    <View style={{ flex: 1, backgroundColor: Colors.canvas, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Text style={{ fontSize: 22, lineHeight: 28, fontWeight: '700', color: Colors.ink, textAlign: 'center' }}>
        Something went wrong
      </Text>
      <Text style={{ fontSize: 16, lineHeight: 24, color: Colors.inkMuted, textAlign: 'center', marginTop: 12 }}>
        Your medicines and reminders are safe on this phone. Reminders will still ring.
      </Text>
      <Pressable
        onPress={retry}
        accessibilityRole="button"
        accessibilityLabel="Try again"
        style={{ marginTop: 24, minHeight: 56, alignSelf: 'stretch', borderRadius: 18, backgroundColor: Colors.brand, alignItems: 'center', justifyContent: 'center' }}
      >
        <Text style={{ fontSize: 18, lineHeight: 24, fontWeight: '600', color: Colors.white }}>Try again</Text>
      </Pressable>
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    AtkinsonHyperlegibleNext_400Regular,
    AtkinsonHyperlegibleNext_500Medium,
    AtkinsonHyperlegibleNext_600SemiBold,
    AtkinsonHyperlegibleNext_700Bold,
  });

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.canvas }} />
    );
  }

  return (
    <SafeAreaProvider>
      <AppProvider>
        <NotificationLifecycleManager>
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: Colors.canvas },
              animation: 'fade',
            }}
          >
            <Stack.Screen name="index" />
            <Stack.Screen name="welcome" />
            <Stack.Screen name="(onboarding)" />
            <Stack.Screen name="setup/reminders" />
            <Stack.Screen name="(patient)/(tabs)" />
            <Stack.Screen name="(caregiver)/(tabs)" />
            <Stack.Screen name="alarm/[occurrenceId]" options={{ presentation: 'fullScreenModal' }} />
            <Stack.Screen name="settings/index" />
          </Stack>
        </NotificationLifecycleManager>
      </AppProvider>
    </SafeAreaProvider>
  );
}
