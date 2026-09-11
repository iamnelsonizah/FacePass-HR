import React, { useEffect, useState } from "react";
import { Slot, useRouter, useSegments } from "expo-router";
import { View, ActivityIndicator, StyleSheet, LogBox } from "react-native";
import { StatusBar } from "expo-status-bar";

LogBox.ignoreLogs(["Cannot connect to Expo CLI"]);
import { SafeAreaProvider } from "react-native-safe-area-context";
import { onAuthStateChange, getSession } from "../services/auth";
import { Session } from "@supabase/supabase-js";

/**
 * Root layout for the Expo Router app.
 * Handles auth state and redirects unauthenticated users to login.
 */
export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    // Check initial session
    getSession().then((s) => {
      setSession(s);
      setLoading(false);
    });

    // Listen for auth changes
    const subscription = onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === "auth";

    if (!session && !inAuthGroup) {
      // Not signed in, redirect to login
      router.replace("/auth/login");
    } else if (session && inAuthGroup) {
      // Signed in, redirect to home
      router.replace("/");
    }
  }, [session, loading, segments]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Slot />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
  },
});
