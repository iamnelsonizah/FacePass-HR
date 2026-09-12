import React from "react";
import { View, Image, StyleSheet, ViewStyle } from "react-native";

interface PremiumFaceIdIconProps {
  size?: number;
  color?: string;
  showLaser?: boolean;
  style?: ViewStyle;
}

/**
 * PremiumFaceIdIcon
 * Enterprise-grade Apple-style Face ID biometric icon.
 * Replaces cartoon/baby-face icons with a sleek, authentic biometric scanner.
 */
export default function PremiumFaceIdIcon({
  size = 32,
  color = "#2563EB",
  showLaser = false,
  style,
}: PremiumFaceIdIconProps) {
  return (
    <View style={[styles.container, { width: size, height: size }, style]}>
      <Image
        source={require("../assets/images/face_id_icon_white.png")}
        style={{
          width: size,
          height: size,
          tintColor: color,
        }}
        resizeMode="contain"
      />
      {showLaser && (
        <View
          style={[
            styles.laserBeam,
            {
              top: Math.round(size * 0.48),
              left: Math.round(size * 0.12),
              right: Math.round(size * 0.12),
              height: Math.max(1.5, Math.round(size * 0.04)),
              backgroundColor: "#38BDF8",
              shadowColor: "#38BDF8",
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.9,
              shadowRadius: 4,
            },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  laserBeam: {
    position: "absolute",
    borderRadius: 2,
  },
});
