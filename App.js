import React, { useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useFonts, PlayfairDisplay_700Bold, PlayfairDisplay_600SemiBold } from '@expo-google-fonts/playfair-display';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { AuthProvider } from './src/context/AuthContext';
import { ParishProvider, useTheme } from './src/context/ParishContext';
import { BirthdayProvider, useBirthday } from './src/context/BirthdayContext';
import { LiturgyProvider } from './src/context/LiturgyContext';
import { PushNotificationProvider } from './src/context/PushNotificationContext';
import BirthdayModal from './src/components/BirthdayModal';
import AppNavigator from './src/navigation/AppNavigator';
import { colors } from './src/theme/theme';

// Rendered inside BirthdayProvider so it can access the context.
function BirthdayModalHost() {
  const { selfBirthday, modalVisible, dismiss } = useBirthday();
  return (
    <BirthdayModal
      visible={modalVisible}
      birthdays={selfBirthday}
      onClose={dismiss}
    />
  );
}

// Sits inside ParishProvider so it can read the live primary color for the
// SafeAreaView background — this makes the status-bar area and Android
// navigation-bar area always match the chosen brand color.
function ThemedRoot() {
  const theme = useTheme();
  // A ref passed to the NavigationContainer so PushNotificationProvider
  // can navigate to the right screen when the user taps a push notification.
  const navigationRef = useRef(null);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.primary }} edges={['top', 'bottom']}>
      <AuthProvider>
        <PushNotificationProvider navigationRef={navigationRef}>
          <BirthdayProvider>
            <LiturgyProvider>
              <StatusBar style="light" backgroundColor={theme.primary} />
              <AppNavigator navigationRef={navigationRef} />
              <BirthdayModalHost />
            </LiturgyProvider>
          </BirthdayProvider>
        </PushNotificationProvider>
      </AuthProvider>
    </SafeAreaView>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    PlayfairDisplay_700Bold,
    PlayfairDisplay_600SemiBold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });

  if (!fontsLoaded) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.burgundy }}>
          <ActivityIndicator color={colors.gold} />
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <ParishProvider>
        <ThemedRoot />
      </ParishProvider>
    </SafeAreaProvider>
  );
}
