import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { updateProfile, uploadAvatar } from "../services/api";

interface ProfileEditModalProps {
  initialProfile: {
    first_name: string;
    last_name: string;
    email: string;
    phone?: string;
    employee_code?: string;
    avatar_url?: string | null;
  };
  onClose: () => void;
  onProfileUpdated: (updated: any) => void;
  onReEnrollPress?: () => void;
}

export default function ProfileEditModal({
  initialProfile,
  onClose,
  onProfileUpdated,
  onReEnrollPress,
}: ProfileEditModalProps) {
  const [firstName, setFirstName] = useState(initialProfile.first_name || "");
  const [lastName, setLastName] = useState(initialProfile.last_name || "");
  const [phone, setPhone] = useState(initialProfile.phone || "");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialProfile.avatar_url || null);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Compute initials (e.g. "NI" for Nelson Izah)
  const initials = `${firstName[0] || ""}${lastName[0] || ""}`.toUpperCase() || "FP";

  const handlePickAvatar = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission Required",
          "Photo library access is needed to select a profile picture."
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const localUri = result.assets[0].uri;
        setUploadingAvatar(true);

        const uploadRes = await uploadAvatar(localUri);
        if (uploadRes?.avatar_url) {
          setAvatarUrl(uploadRes.avatar_url);
          Alert.alert("Photo Updated", "Your new profile picture has been saved.");
        }
      }
    } catch (err: any) {
      console.warn("Avatar upload error:", err);
      Alert.alert("Upload Failed", err.message || "Could not upload photo");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSave = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      Alert.alert("Validation", "First and last name are required.");
      return;
    }

    setSaving(true);
    try {
      const updated = await updateProfile({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone: phone.trim(),
        avatar_url: avatarUrl || undefined,
      });

      onProfileUpdated(updated);
      Alert.alert("Success! ✓", "Profile details updated successfully.");
      onClose();
    } catch (err: any) {
      Alert.alert("Update Error", err.message || "Could not update profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.keyboardContainer}
    >
      <View style={styles.headerBar}>
        <Text style={styles.modalTitle}>Profile & Details</Text>
        <TouchableOpacity
          onPress={onClose}
          style={styles.closeButton}
          hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
        >
          <Ionicons name="close" size={24} color="#64748B" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Avatar with Initials Fallback */}
        <View style={styles.avatarSection}>
          <TouchableOpacity
            onPress={handlePickAvatar}
            activeOpacity={0.8}
            style={styles.avatarWrapper}
            disabled={uploadingAvatar}
          >
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImg} />
            ) : (
              <View style={styles.initialsContainer}>
                <Text style={styles.initialsText}>{initials}</Text>
              </View>
            )}

            <View style={styles.cameraIconBadge}>
              {uploadingAvatar ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Ionicons name="camera" size={16} color="#FFFFFF" />
              )}
            </View>
          </TouchableOpacity>

          <Text style={styles.changePhotoText}>Tap photo to upload image</Text>
        </View>

        {/* Employee ID Badge Card */}
        {initialProfile.employee_code && (
          <View style={styles.idCard}>
            <View style={styles.idCardLeft}>
              <Text style={styles.idCardLabel}>OFFICIAL EMPLOYEE ID</Text>
              <Text style={styles.idCardCode}>{initialProfile.employee_code}</Text>
            </View>
            <View style={styles.idCardBadge}>
              <Ionicons name="shield-checkmark" size={16} color="#2563EB" />
              <Text style={styles.idCardBadgeText}>Verified</Text>
            </View>
          </View>
        )}

        {/* Form Inputs */}
        <View style={styles.formSection}>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>First Name</Text>
            <TextInput
              style={styles.textInput}
              value={firstName}
              onChangeText={setFirstName}
              placeholder="e.g. Nelson"
              placeholderTextColor="#94A3B8"
              autoCapitalize="words"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Last Name</Text>
            <TextInput
              style={styles.textInput}
              value={lastName}
              onChangeText={setLastName}
              placeholder="e.g. Izah"
              placeholderTextColor="#94A3B8"
              autoCapitalize="words"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Phone Number</Text>
            <TextInput
              style={styles.textInput}
              value={phone}
              onChangeText={setPhone}
              placeholder="+234 800 000 0000"
              placeholderTextColor="#94A3B8"
              keyboardType="phone-pad"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Email Address</Text>
            <TextInput
              style={[styles.textInput, styles.textInputDisabled]}
              value={initialProfile.email}
              editable={false}
            />
          </View>
        </View>

        {/* Action Buttons */}
        <TouchableOpacity
          style={styles.saveButton}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.88}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.saveButtonText}>Save Changes</Text>
          )}
        </TouchableOpacity>

        {onReEnrollPress && (
          <TouchableOpacity
            style={styles.reEnrollButton}
            onPress={() => {
              onClose();
              onReEnrollPress();
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="scan-outline" size={18} color="#2563EB" />
            <Text style={styles.reEnrollText}>Update Face Biometric Enrollment</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardContainer: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  headerBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0F172A",
  },
  closeButton: {
    padding: 4,
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 40,
  },
  avatarSection: {
    alignItems: "center",
    marginBottom: 24,
  },
  avatarWrapper: {
    position: "relative",
  },
  avatarImg: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "#E2E8F0",
  },
  initialsContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "#1E3A8A",
    alignItems: "center",
    justifyContent: "center",
  },
  initialsText: {
    color: "#FFFFFF",
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: 1,
  },
  cameraIconBadge: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#2563EB",
    borderWidth: 2,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  changePhotoText: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 10,
    fontWeight: "500",
  },
  idCard: {
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    borderRadius: 14,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  idCardLeft: {},
  idCardLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#1D4ED8",
    letterSpacing: 0.5,
  },
  idCardCode: {
    fontSize: 20,
    fontWeight: "800",
    color: "#1E3A8A",
    marginTop: 2,
    letterSpacing: 1,
  },
  idCardBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#DBEAFE",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    gap: 4,
  },
  idCardBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1E40AF",
  },
  formSection: {
    gap: 16,
    marginBottom: 28,
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#334155",
  },
  textInput: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 15,
    color: "#0F172A",
    backgroundColor: "#F8FAFC",
  },
  textInputDisabled: {
    backgroundColor: "#F1F5F9",
    color: "#94A3B8",
  },
  saveButton: {
    backgroundColor: "#2563EB",
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  reEnrollButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    marginTop: 10,
    gap: 8,
  },
  reEnrollText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#2563EB",
  },
});
