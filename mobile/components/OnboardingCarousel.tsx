import React, { useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  useWindowDimensions,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

interface OnboardingSlide {
  id: string;
  pillIcon: keyof typeof Ionicons.glyphMap;
  pillText: string;
  title: string;
  subtitle: string;
}

const SLIDES: OnboardingSlide[] = [
  {
    id: "1",
    pillIcon: "shield-checkmark",
    pillText: "Secure & Reliable",
    title: "Instant Facial\nAttendance",
    subtitle:
      "Clock in and out in less than a second with enterprise-grade facial recognition and passive anti-spoofing.",
  },
  {
    id: "2",
    pillIcon: "location",
    pillText: "Location Verified",
    title: "Smart Worksite\nGeofencing",
    subtitle:
      "Automatically verifies you are inside your assigned job site perimeter with dynamic GPS perimeter security.",
  },
  {
    id: "3",
    pillIcon: "cloud-offline",
    pillText: "Offline Ready",
    title: "Seamless Offline\nPunching",
    subtitle:
      "On remote construction or field sites with zero network? Check-ins save securely on device and sync automatically.",
  },
];

interface OnboardingCarouselProps {
  onComplete: () => void;
  onLoginPress: () => void;
}

export default function OnboardingCarousel({
  onComplete,
  onLoginPress,
}: OnboardingCarouselProps) {
  const { width: windowWidth } = useWindowDimensions();
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  const handleNext = () => {
    if (currentIndex < SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({
        index: currentIndex + 1,
        animated: true,
      });
    } else {
      onComplete();
    }
  };

  const renderSlide = ({ item }: { item: OnboardingSlide }) => (
    <View style={[styles.slideContainer, { width: windowWidth }]}>
      {/* 3D Avatar Hero Illustration (no circle) */}
      <View style={styles.heroImageContainer}>
        <Image
          source={require("../assets/images/hero_avatar_enlarged.png")}
          style={styles.heroImage}
          resizeMode="contain"
        />
      </View>

      {/* Pill Badge */}
      <View style={styles.pillBadge}>
        <Ionicons name={item.pillIcon} size={15} color="#2563EB" />
        <Text style={styles.pillText}>{item.pillText}</Text>
      </View>

      {/* Title */}
      <Text style={styles.slideTitle}>{item.title}</Text>

      {/* Subtitle */}
      <Text style={styles.slideSubtitle}>{item.subtitle}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      {/* Background soft pastel accent */}
      <View style={styles.rightAccent} pointerEvents="none" />

      {/* Top Header Bar */}
      <View style={styles.headerBar}>
        <View style={styles.headerBrand}>
          <Image
            source={require("../assets/images/exact_face_id_icon.png")}
            style={styles.brandIcon}
            resizeMode="contain"
          />
          <Text style={styles.brandTitle}>FacePass</Text>
        </View>

        <TouchableOpacity
          onPress={onComplete}
          style={styles.skipButton}
          activeOpacity={0.7}
        >
          <Text style={styles.skipButtonText}>Skip</Text>
        </TouchableOpacity>
      </View>

      {/* Paging Carousel */}
      <FlatList
        ref={flatListRef}
        data={SLIDES}
        renderItem={renderSlide}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        onMomentumScrollEnd={(e) => {
          const newIndex = Math.round(
            e.nativeEvent.contentOffset.x / windowWidth
          );
          setCurrentIndex(newIndex);
        }}
      />

      {/* Pagination Indicators */}
      <View style={styles.paginationRow}>
        {SLIDES.map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              currentIndex === i ? styles.dotActive : styles.dotInactive,
            ]}
          />
        ))}
      </View>

      {/* Bottom Action Footer */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={handleNext}
          activeOpacity={0.88}
        >
          <View style={styles.primaryButtonRow}>
            <Text style={styles.primaryButtonText}>
              {currentIndex === SLIDES.length - 1 ? "Get Started" : "Continue"}
            </Text>
            <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={onLoginPress}
          activeOpacity={0.7}
        >
          <Text style={styles.secondaryButtonText}>
            Already have an account?{" "}
            <Text style={styles.loginHighlight}>Log In</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  rightAccent: {
    position: "absolute",
    right: -60,
    top: 140,
    width: 140,
    height: 300,
    borderRadius: 70,
    backgroundColor: "#EFF6FF",
    opacity: 0.8,
  },
  headerBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 4,
  },
  headerBrand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  brandIcon: {
    width: 28,
    height: 28,
  },
  brandTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: "#0F172A",
    letterSpacing: -0.5,
  },
  skipButton: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: "#F1F5F9",
  },
  skipButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748B",
  },
  slideContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    paddingTop: 10,
  },
  heroImageContainer: {
    width: 300,
    height: 240,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  heroImage: {
    width: "100%",
    height: "100%",
  },
  pillBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#DBEAFE",
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
    marginBottom: 16,
  },
  pillText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#2563EB",
  },
  slideTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: "#0F172A",
    textAlign: "center",
    letterSpacing: -0.5,
    lineHeight: 36,
    marginBottom: 12,
  },
  slideSubtitle: {
    fontSize: 14,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 22,
    paddingHorizontal: 10,
  },
  paginationRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    marginBottom: 24,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
  dotActive: {
    width: 24,
    backgroundColor: "#2563EB",
  },
  dotInactive: {
    width: 8,
    backgroundColor: "#DBEAFE",
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 20,
    gap: 16,
  },
  primaryButton: {
    backgroundColor: "#2563EB",
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 4,
  },
  primaryButtonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  secondaryButton: {
    alignItems: "center",
    paddingVertical: 4,
  },
  secondaryButtonText: {
    color: "#64748B",
    fontSize: 14,
    fontWeight: "500",
  },
  loginHighlight: {
    color: "#2563EB",
    fontWeight: "700",
  },
});
