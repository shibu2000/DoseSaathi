import React, { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme/ThemeContext';

export default function AddTabPlaceholder() {
  const router = useRouter();
  const { colors } = useTheme();

  useEffect(() => {
    router.replace('/medicine/new/details');
  }, [router]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}
