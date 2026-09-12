import React from "react";
import { View, StyleSheet } from "react-native";

/**
 * EmptyTimesheetIllustration
 * Matches the clipboard + clock + rays empty state design.
 */
export default function EmptyTimesheetIllustration() {
  return (
    <View style={styles.container}>
      {/* Soft mint/teal circular backdrop */}
      <View style={styles.backdropCircle} />

      {/* Ground oval shadow */}
      <View style={styles.groundShadow} />

      {/* Sparkle / accent rays on top right */}
      <View style={styles.raysContainer}>
        <View style={styles.rayTop} />
        <View style={styles.rayMiddle} />
        <View style={styles.rayBottom} />
      </View>

      {/* Clipboard */}
      <View style={styles.clipboard}>
        {/* Top clip */}
        <View style={styles.clipTab}>
          <View style={styles.clipHole} />
        </View>

        {/* Document lines */}
        <View style={styles.docLine1} />
        <View style={styles.docLine2} />
        <View style={styles.docLine3} />
        <View style={styles.docLine4} />

        {/* Overlapping Clock at bottom right */}
        <View style={styles.clockCircle}>
          <View style={styles.clockCenterDot} />
          <View style={styles.clockMinuteHand} />
          <View style={styles.clockHourHand} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 170,
    height: 170,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  backdropCircle: {
    position: "absolute",
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: "#E8F5EE",
  },
  groundShadow: {
    position: "absolute",
    bottom: 8,
    width: 130,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: "#E2E8F0",
  },
  raysContainer: {
    position: "absolute",
    top: 14,
    right: 18,
    width: 24,
    height: 30,
    justifyContent: "center",
  },
  rayTop: {
    width: 2.5,
    height: 7,
    borderRadius: 1.5,
    backgroundColor: "#334155",
    transform: [{ rotate: "35deg" }],
    position: "absolute",
    top: 2,
    right: 12,
  },
  rayMiddle: {
    width: 8,
    height: 2.5,
    borderRadius: 1.5,
    backgroundColor: "#334155",
    position: "absolute",
    top: 13,
    right: 4,
  },
  rayBottom: {
    width: 7,
    height: 2.5,
    borderRadius: 1.5,
    backgroundColor: "#334155",
    transform: [{ rotate: "-35deg" }],
    position: "absolute",
    top: 22,
    right: 8,
  },
  clipboard: {
    width: 84,
    height: 106,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 2.5,
    borderColor: "#475569",
    position: "relative",
    zIndex: 2,
  },
  clipTab: {
    position: "absolute",
    top: -8,
    alignSelf: "center",
    width: 32,
    height: 14,
    backgroundColor: "#475569",
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    justifyContent: "center",
    alignItems: "center",
  },
  clipHole: {
    width: 8,
    height: 3.5,
    borderRadius: 2,
    backgroundColor: "#E8F5EE",
  },
  docLine1: {
    width: 52,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: "#CBD5E1",
    alignSelf: "center",
    marginTop: 18,
  },
  docLine2: {
    width: 52,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: "#CBD5E1",
    alignSelf: "center",
    marginTop: 7,
  },
  docLine3: {
    width: 38,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: "#CBD5E1",
    marginLeft: 16,
    marginTop: 7,
  },
  docLine4: {
    width: 24,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: "#CBD5E1",
    marginLeft: 16,
    marginTop: 7,
  },
  clockCircle: {
    position: "absolute",
    bottom: -10,
    right: -12,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    borderWidth: 2.5,
    borderColor: "#334155",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  clockCenterDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#334155",
    zIndex: 5,
  },
  clockMinuteHand: {
    position: "absolute",
    top: 10,
    width: 2.5,
    height: 12,
    borderRadius: 1.5,
    backgroundColor: "#334155",
  },
  clockHourHand: {
    position: "absolute",
    top: 20,
    left: 20,
    width: 9,
    height: 2.5,
    borderRadius: 1.5,
    backgroundColor: "#334155",
    transform: [{ rotate: "35deg" }],
  },
});
