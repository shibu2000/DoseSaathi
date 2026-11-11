import React from 'react';
import { Stack } from 'expo-router';
import { Colors } from '@/theme/tokens';

export default function OnboardingLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.canvas },
        animation: 'slide_from_right',
      }}
    />
  );
}
