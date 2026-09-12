import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Modal,
  ActivityIndicator,
  Image,
  Animated,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import {
  signIn,
  signUp,
  verifyActivation,
  resendActivation,
  forgotPassword,
  verifyResetCode,
  resetPassword,
} from "../../services/auth";
import {
  checkBiometricSupport,
  isBiometricsEnabled,
  getBiometricCredentials,
  saveBiometricCredentials,
  authenticateWithBiometrics,
  BiometricStatus,
} from "../../services/biometrics";
import OnboardingCarousel from "../../components/OnboardingCarousel";
import PremiumFaceIdIcon from "../../components/PremiumFaceIdIcon";

type AuthFlow =
  | "login"
  | "otp_verify"
  | "activated"
  | "forgot_step1"
  | "forgot_step2"
  | "forgot_step3"
  | "forgot_success";

export default function LoginScreen() {
  const router = useRouter();
  const [isSignUp, setIsSignUp] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [authFlow, setAuthFlow] = useState<AuthFlow>("login");

  // Form Fields
  const [emailOrId, setEmailOrId] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [customId, setCustomId] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);

  // OTP Verification State
  const [otpDigits, setOtpDigits] = useState(["", "", "", "", "", ""]);
  const [pendingEmail, setPendingEmail] = useState("");
  const [activatedEmployeeCode, setActivatedEmployeeCode] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState(false);
  const [activatedBanner, setActivatedBanner] = useState<string | null>(null);
  const [resendCountdown, setResendCountdown] = useState(0);
  const otpInputRefs = useRef<(TextInput | null)[]>([]);

  // Forgot Password State
  const [forgotIdentifier, setForgotIdentifier] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [resetOtpDigits, setResetOtpDigits] = useState(["", "", "", "", "", ""]);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const resetOtpRefs = useRef<(TextInput | null)[]>([]);

  // Confetti / Celebration animation
  const celebrationAnim = useRef(new Animated.Value(0)).current;

  // Biometrics State
  const [biometricStatus, setBiometricStatus] = useState<BiometricStatus | null>(null);
  const [hasBiometricCreds, setHasBiometricCreds] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);

  // Initialize biometric capabilities & stored credentials
  useEffect(() => {
    async function initBiometrics() {
      try {
        const status = await checkBiometricSupport();
        setBiometricStatus(status);
        const enabled = await isBiometricsEnabled();
        const creds = await getBiometricCredentials();
        setHasBiometricCreds(!!creds && enabled);
      } catch (e) {
        console.warn("Biometric initialization check failed:", e);
      }
    }
    initBiometrics();
  }, [authFlow]);

  // Countdown timer for resend OTP
  useEffect(() => {
    if (resendCountdown > 0) {
      const timer = setTimeout(() => setResendCountdown(resendCountdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCountdown]);

  // Spring animation on activation screen
  useEffect(() => {
    if (authFlow === "activated") {
      celebrationAnim.setValue(0);
      Animated.spring(celebrationAnim, {
        toValue: 1,
        friction: 5,
        tension: 40,
        useNativeDriver: true,
      }).start();
    }
  }, [authFlow]);

  const handleOtpChange = (text: string, index: number, isReset = false) => {
    const digits = isReset ? [...resetOtpDigits] : [...otpDigits];
    const refs = isReset ? resetOtpRefs : otpInputRefs;

    // Handle multi-character input: either a 6-digit paste, or an overwrite in an existing box
    if (text.length > 1) {
      const clean = text.replace(/[^0-9]/g, "");
      if (clean.length >= 6) {
        // Full 6-digit code paste
        const newDigits = clean.slice(0, 6).split("");
        if (isReset) {
          setResetOtpDigits(newDigits);
        } else {
          setOtpDigits(newDigits);
        }
        refs.current[5]?.focus();
        return;
      }
      // Single box overwrite (e.g. typing into a box that already has a character)
      const lastChar = clean.slice(-1);
      digits[index] = lastChar;
      if (isReset) {
        setResetOtpDigits(digits);
      } else {
        setOtpDigits(digits);
      }
      if (lastChar && index < 5) {
        refs.current[index + 1]?.focus();
      }
      return;
    }

    const cleanChar = text.replace(/[^0-9]/g, "");
    digits[index] = cleanChar;
    if (isReset) {
      setResetOtpDigits(digits);
    } else {
      setOtpDigits(digits);
    }

    if (cleanChar && index < 5) {
      refs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyPress = (e: any, index: number, isReset = false) => {
    const digits = isReset ? resetOtpDigits : otpDigits;
    const refs = isReset ? resetOtpRefs : otpInputRefs;
    if (e.nativeEvent.key === "Backspace" && !digits[index] && index > 0) {
      refs.current[index - 1]?.focus();
    }
  };

  const handleSubmit = async () => {
    if (isSignUp) {
      if (!emailOrId || !password || !firstName || !lastName) {
        Alert.alert("Missing Fields", "Please fill in all required fields to create your account.");
        return;
      }
    } else {
      if (!emailOrId || !password) {
        Alert.alert("Missing Fields", "Please enter your Employee ID or Email and password.");
        return;
      }
    }

    setLoading(true);
    try {
      if (isSignUp) {
        const res = await signUp(
          emailOrId,
          password,
          firstName,
          lastName,
          customId.trim() ? customId.trim() : undefined
        );
        if (res.pending_activation) {
          setPendingEmail(res.email || emailOrId.trim().toLowerCase());
          setOtpDigits(["", "", "", "", "", ""]);
          setResendCountdown(60);
          setAuthFlow("otp_verify");
          Alert.alert(
            "Verification Code Sent",
            "A 6-digit activation code has been sent to your email. Please check your inbox and enter the code."
          );
        } else {
          Alert.alert("Account Created! 🎉", "Please sign in with your credentials.");
          setIsSignUp(false);
        }
      } else {
        await signIn(emailOrId, password);
        if (biometricStatus?.hasHardware && biometricStatus?.isEnrolled && rememberMe) {
          try {
            await saveBiometricCredentials(emailOrId, password);
          } catch (bioErr) {
            console.warn("Could not save biometric credentials:", bioErr);
          }
        }
        router.replace("/");
      }
    } catch (error: any) {
      const msg =
        error?.response?.data?.detail ||
        error?.message ||
        "Authentication failed. Please verify your credentials.";
      Alert.alert("Notice", msg);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    const code = otpDigits.join("");
    if (code.length !== 6) {
      Alert.alert("Incomplete Code", "Please enter the complete 6-digit activation code.");
      return;
    }

    setLoading(true);
    try {
      const res = await verifyActivation(pendingEmail, code);
      if (res.activated) {
        setActivatedEmployeeCode(res.employee_code);
        setAuthFlow("activated");
      }
    } catch (error: any) {
      const msg =
        error?.response?.data?.detail ||
        error?.message ||
        "Invalid or expired verification code.";
      Alert.alert("Verification Notice", msg);
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (resendCountdown > 0) return;
    setLoading(true);
    try {
      await resendActivation(pendingEmail);
      setResendCountdown(60);
      setOtpDigits(["", "", "", "", "", ""]);
      Alert.alert(
        "Code Sent",
        "A new 6-digit activation code has been sent to your email."
      );
    } catch (error: any) {
      const msg = error?.response?.data?.detail || error?.message || "Failed to resend code.";
      Alert.alert("Notice", msg);
    } finally {
      setLoading(false);
    }
  };

  // Forgot password handlers
  const handleForgotSubmit = async () => {
    if (!forgotIdentifier.trim()) {
      Alert.alert("Required", "Please enter your Email or Employee ID.");
      return;
    }
    setLoading(true);
    try {
      const res = await forgotPassword(forgotIdentifier);
      setResetEmail(res.email || forgotIdentifier.trim().toLowerCase());
      setResetOtpDigits(["", "", "", "", "", ""]);
      setResendCountdown(60);
      setAuthFlow("forgot_step2");
      Alert.alert(
        "Code Sent",
        "A 6-digit code has been sent to your email. Please check your email and enter the code."
      );
    } catch (error: any) {
      const msg = error?.response?.data?.detail || error?.message || "Failed to send reset code.";
      Alert.alert("Notice", msg);
    } finally {
      setLoading(false);
    }
  };

  const handleResendResetCode = async () => {
    if (resendCountdown > 0) return;
    setLoading(true);
    try {
      await forgotPassword(resetEmail);
      setResendCountdown(60);
      setResetOtpDigits(["", "", "", "", "", ""]);
      Alert.alert("Code Sent", "A 6-digit code has been sent to your email.");
    } catch (error: any) {
      const msg = error?.response?.data?.detail || error?.message || "Failed to resend code.";
      Alert.alert("Notice", msg);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyResetOtp = async () => {
    const code = resetOtpDigits.join("");
    if (code.length !== 6) {
      Alert.alert("Incomplete Code", "Please enter the full 6-digit reset code.");
      return;
    }
    setLoading(true);
    try {
      await verifyResetCode(resetEmail, code);
      setAuthFlow("forgot_step3");
    } catch (error: any) {
      const msg = error?.response?.data?.detail || error?.message || "Invalid reset code.";
      Alert.alert("Notice", msg);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      Alert.alert("Password Too Short", "Password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert("Mismatch", "Passwords do not match. Please check and try again.");
      return;
    }
    setLoading(true);
    try {
      const code = resetOtpDigits.join("");
      await resetPassword(resetEmail, code, newPassword);
      setAuthFlow("forgot_success");
    } catch (error: any) {
      const msg = error?.response?.data?.detail || error?.message || "Failed to update password.";
      Alert.alert("Notice", msg);
    } finally {
      setLoading(false);
    }
  };

  const resetToLogin = () => {
    setAuthFlow("login");
    setIsSignUp(false);
    setOtpDigits(["", "", "", "", "", ""]);
    setResetOtpDigits(["", "", "", "", "", ""]);
    setForgotIdentifier("");
    setNewPassword("");
    setConfirmPassword("");
    setActivatedEmployeeCode(null);
  };

  const handleProceedToLogin = () => {
    if (activatedEmployeeCode) {
      setEmailOrId(activatedEmployeeCode);
      setActivatedBanner(`Employee ID ${activatedEmployeeCode} filled in. Enter your password to sign in.`);
    }
    setAuthFlow("login");
    setIsSignUp(false);
    setOtpDigits(["", "", "", "", "", ""]);
  };

  const handleCopyId = () => {
    if (!activatedEmployeeCode) return;
    setCopiedId(true);
    Alert.alert("Employee ID Copied", `${activatedEmployeeCode} has been copied and will be pre-filled when you sign in.`);
    setTimeout(() => setCopiedId(false), 2500);
  };

  const handleUseFaceId = async () => {
    if (!biometricStatus?.hasHardware) {
      Alert.alert(
        "Biometrics Unavailable",
        "This device does not support biometric authentication (Face ID or Fingerprint)."
      );
      return;
    }

    if (!biometricStatus.isEnrolled) {
      Alert.alert(
        "Not Enrolled",
        `Please set up ${biometricStatus.label} in your device settings first.`
      );
      return;
    }

    const creds = await getBiometricCredentials();
    const enabled = await isBiometricsEnabled();

    if (!creds || !enabled) {
      // If user has already entered their credentials in the form, link and sign in immediately
      if (emailOrId.trim() && password) {
        setBiometricLoading(true);
        const authResult = await authenticateWithBiometrics(
          `Link ${biometricStatus.label} with FacePass`
        );
        if (authResult.success) {
          try {
            await saveBiometricCredentials(emailOrId.trim(), password);
            await signIn(emailOrId.trim(), password);
            router.replace("/");
            return;
          } catch (err: any) {
            Alert.alert(
              "Sign In Failed",
              err?.response?.data?.detail || err?.message || "Invalid credentials."
            );
          } finally {
            setBiometricLoading(false);
          }
        } else {
          setBiometricLoading(false);
        }
        return;
      }

      Alert.alert(
        `${biometricStatus.label} Setup`,
        `Please enter your Employee ID or Email and password once to sign in. FacePass will automatically link your ${biometricStatus.label} for fast 1-tap sign-ins!`
      );
      return;
    }

    // Biometrics already linked - trigger prompt and auto sign in
    setBiometricLoading(true);
    try {
      const authResult = await authenticateWithBiometrics(
        `Sign in to FacePass with ${biometricStatus.label}`
      );

      if (!authResult.success) {
        if (authResult.error && !authResult.error.toLowerCase().includes("cancel")) {
          Alert.alert("Authentication Failed", authResult.error);
        }
        return;
      }

      // Biometric scan verified! Authenticate with stored credentials
      await signIn(creds.emailOrId, creds.password);
      router.replace("/");
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail ||
        err?.message ||
        "Biometric sign-in failed. Please sign in with your password.";
      Alert.alert("Notice", msg);
    } finally {
      setBiometricLoading(false);
    }
  };

  // ─── OTP Digit Row Component ───
  const renderOtpInputs = (digits: string[], isReset = false) => (
    <View style={styles.otpRow}>
      {digits.map((d, i) => (
        <TextInput
          key={i}
          ref={(ref) => {
            const refs = isReset ? resetOtpRefs : otpInputRefs;
            refs.current[i] = ref;
          }}
          style={[styles.otpBox, d ? styles.otpBoxFilled : null]}
          value={d}
          onChangeText={(t) => handleOtpChange(t, i, isReset)}
          onKeyPress={(e) => handleOtpKeyPress(e, i, isReset)}
          keyboardType="number-pad"
          maxLength={6}
          textAlign="center"
          selectTextOnFocus
        />
      ))}
    </View>
  );

  // ══════════════════════════════════════════════════
  // VIEW: 6-DIGIT OTP ACTIVATION SCREEN
  // ══════════════════════════════════════════════════
  if (authFlow === "otp_verify") {
    return (
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={styles.flowScrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <TouchableOpacity style={styles.backButton} onPress={resetToLogin}>
              <Ionicons name="arrow-back" size={22} color="#0F172A" />
            </TouchableOpacity>

            <View style={styles.flowIconBox}>
              <Ionicons name="mail-open-outline" size={36} color="#2563EB" />
            </View>

            <Text style={styles.flowTitle}>Verify your email</Text>
            <Text style={styles.flowSubtitle}>
              We sent a 6-digit activation code to{"\n"}
              <Text style={styles.flowEmailHighlight}>{pendingEmail}</Text>
            </Text>

            {renderOtpInputs(otpDigits)}

            <TouchableOpacity
              style={[styles.flowPrimaryButton, loading && styles.primaryButtonDisabled]}
              onPress={handleVerifyOtp}
              disabled={loading}
              activeOpacity={0.88}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.flowPrimaryButtonText}>Verify & Activate</Text>
              )}
            </TouchableOpacity>

            <View style={styles.resendRow}>
              <Text style={styles.resendLabel}>Didn't receive the code? </Text>
              <TouchableOpacity onPress={handleResendCode} disabled={resendCountdown > 0}>
                <Text
                  style={[
                    styles.resendLink,
                    resendCountdown > 0 && styles.resendLinkDisabled,
                  ]}
                >
                  {resendCountdown > 0 ? `Resend in ${resendCountdown}s` : "Resend Code"}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ══════════════════════════════════════════════════
  // VIEW: ACCOUNT ACTIVATED CELEBRATION SCREEN
  // ══════════════════════════════════════════════════
  if (authFlow === "activated") {
    const scaleAnim = celebrationAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0.7, 1],
    });
    return (
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <ScrollView contentContainerStyle={styles.activatedScrollContent}>
          <Animated.View style={[styles.activatedCard, { transform: [{ scale: scaleAnim }] }]}>
            {/* Celebration Icon */}
            <View style={styles.confettiIconContainer}>
              <Text style={styles.confettiEmoji}>🎉</Text>
            </View>

            <Text style={styles.activatedTitle}>Account Activated!</Text>
            <Text style={styles.activatedSubtitle}>
              Your FacePass account is now active and ready. Your official Employee ID is displayed below and has been sent to your email.
            </Text>

            {/* Official Enterprise Employee ID Badge */}
            <View style={styles.employeeIdCard}>
              <View style={styles.idCardTopRow}>
                <View style={styles.idCardBrandRow}>
                  <Ionicons name="shield-checkmark" size={16} color="#2563EB" />
                  <Text style={styles.idCardBrandTitle}>OFFICIAL EMPLOYEE ID</Text>
                </View>
                <View style={styles.verifiedBadgePill}>
                  <View style={styles.verifiedDot} />
                  <Text style={styles.verifiedBadgeText}>Active</Text>
                </View>
              </View>

              <View style={styles.idCardCodeRow}>
                <Text style={styles.badgeCode}>
                  {activatedEmployeeCode || "Verified"}
                </Text>
                <TouchableOpacity
                  style={styles.copyIdBtn}
                  onPress={handleCopyId}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={copiedId ? "checkmark-circle" : "copy-outline"}
                    size={16}
                    color="#2563EB"
                  />
                  <Text style={styles.copyIdBtnText}>
                    {copiedId ? "Copied" : "Copy"}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.idCardDivider} />

              <View style={styles.idCardBottomRow}>
                <Ionicons name="mail-outline" size={15} color="#64748B" />
                <Text style={styles.idCardUserText} numberOfLines={1}>
                  {pendingEmail || emailOrId || "Registered User"}
                </Text>
              </View>
            </View>

            {/* Helpful tip */}
            <View style={styles.activatedTipCard}>
              <Text style={styles.tipIcon}>💡</Text>
              <Text style={styles.activatedTipCardText}>
                You can now log in anytime using this Employee ID or your email address with your password.
              </Text>
            </View>

            {/* Full-width, high-grade Primary CTA Button */}
            <TouchableOpacity
              style={styles.activatedPrimaryButton}
              onPress={handleProceedToLogin}
              activeOpacity={0.88}
            >
              <Text style={styles.activatedPrimaryButtonText}>Login to Get Started</Text>
              <Ionicons name="arrow-forward" size={18} color="#FFFFFF" style={{ marginLeft: 8 }} />
            </TouchableOpacity>
          </Animated.View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ══════════════════════════════════════════════════
  // VIEW: FORGOT PASSWORD STEP 1: Enter email / ID
  // ══════════════════════════════════════════════════
  if (authFlow === "forgot_step1") {
    return (
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={styles.flowScrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <TouchableOpacity style={styles.backButton} onPress={resetToLogin}>
              <Ionicons name="arrow-back" size={22} color="#0F172A" />
            </TouchableOpacity>

            <View style={styles.flowIconBox}>
              <Ionicons name="key-outline" size={36} color="#2563EB" />
            </View>

            <Text style={styles.flowTitle}>Forgot Password?</Text>
            <Text style={styles.flowSubtitle}>
              Enter your email address or Employee ID to receive a 6-digit reset code.
            </Text>

            <View style={styles.flowInputBox}>
              <Ionicons name="mail-outline" size={20} color="#94A3B8" style={{ marginRight: 12 }} />
              <TextInput
                style={[styles.textInput, { flex: 1 }]}
                value={forgotIdentifier}
                onChangeText={setForgotIdentifier}
                placeholder="Email or Employee ID (e.g. FP-49201)"
                placeholderTextColor="#94A3B8"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <TouchableOpacity
              style={[styles.flowPrimaryButton, loading && styles.primaryButtonDisabled]}
              onPress={handleForgotSubmit}
              disabled={loading}
              activeOpacity={0.88}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.flowPrimaryButtonText}>Send Reset Code</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.flowSecondaryLink} onPress={resetToLogin}>
              <Text style={styles.flowSecondaryLinkText}>← Back to Sign In</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ══════════════════════════════════════════════════
  // VIEW: FORGOT PASSWORD STEP 2: Enter Reset OTP
  // ══════════════════════════════════════════════════
  if (authFlow === "forgot_step2") {
    return (
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={styles.flowScrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <TouchableOpacity style={styles.backButton} onPress={() => setAuthFlow("forgot_step1")}>
              <Ionicons name="arrow-back" size={22} color="#0F172A" />
            </TouchableOpacity>

            <View style={styles.flowIconBox}>
              <Ionicons name="shield-checkmark-outline" size={36} color="#2563EB" />
            </View>

            <Text style={styles.flowTitle}>Enter Reset Code</Text>
            <Text style={styles.flowSubtitle}>
              We sent a 6-digit verification code to{"\n"}
              <Text style={styles.flowEmailHighlight}>{resetEmail}</Text>
            </Text>

            {renderOtpInputs(resetOtpDigits, true)}

            <TouchableOpacity
              style={[styles.flowPrimaryButton, loading && styles.primaryButtonDisabled]}
              onPress={handleVerifyResetOtp}
              disabled={loading}
              activeOpacity={0.88}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.flowPrimaryButtonText}>Verify Code</Text>
              )}
            </TouchableOpacity>

            <View style={styles.resendRow}>
              <Text style={styles.resendLabel}>Didn't receive the code? </Text>
              <TouchableOpacity
                onPress={handleResendResetCode}
                disabled={resendCountdown > 0}
              >
                <Text
                  style={[
                    styles.resendLink,
                    resendCountdown > 0 && styles.resendLinkDisabled,
                  ]}
                >
                  {resendCountdown > 0 ? `Resend in ${resendCountdown}s` : "Resend Code"}
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.flowSecondaryLink}
              onPress={() => setAuthFlow("forgot_step1")}
            >
              <Text style={styles.flowSecondaryLinkText}>← Change Email or ID</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ══════════════════════════════════════════════════
  // VIEW: FORGOT PASSWORD STEP 3: Enter New Password
  // ══════════════════════════════════════════════════
  if (authFlow === "forgot_step3") {
    return (
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={styles.flowScrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <TouchableOpacity style={styles.backButton} onPress={() => setAuthFlow("forgot_step2")}>
              <Ionicons name="arrow-back" size={22} color="#0F172A" />
            </TouchableOpacity>

            <View style={styles.flowIconBox}>
              <Ionicons name="lock-open-outline" size={36} color="#2563EB" />
            </View>

            <Text style={styles.flowTitle}>Set New Password</Text>
            <Text style={styles.flowSubtitle}>
              Please enter your new password to secure your FacePass account.
            </Text>

            <View style={styles.flowInputBox}>
              <Ionicons name="lock-closed-outline" size={20} color="#94A3B8" style={{ marginRight: 12 }} />
              <TextInput
                style={[styles.textInput, { flex: 1 }]}
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="New password (min 6 characters)"
                placeholderTextColor="#94A3B8"
                secureTextEntry={!showNewPassword}
              />
              <TouchableOpacity onPress={() => setShowNewPassword(!showNewPassword)}>
                <Ionicons
                  name={showNewPassword ? "eye-off-outline" : "eye-outline"}
                  size={20}
                  color="#94A3B8"
                />
              </TouchableOpacity>
            </View>

            <View style={styles.flowInputBox}>
              <Ionicons name="lock-closed-outline" size={20} color="#94A3B8" style={{ marginRight: 12 }} />
              <TextInput
                style={[styles.textInput, { flex: 1 }]}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Confirm new password"
                placeholderTextColor="#94A3B8"
                secureTextEntry={!showConfirmPassword}
              />
              <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
                <Ionicons
                  name={showConfirmPassword ? "eye-off-outline" : "eye-outline"}
                  size={20}
                  color="#94A3B8"
                />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.flowPrimaryButton, loading && styles.primaryButtonDisabled]}
              onPress={handleResetPassword}
              disabled={loading}
              activeOpacity={0.88}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.flowPrimaryButtonText}>Update Password</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ══════════════════════════════════════════════════
  // VIEW: FORGOT PASSWORD SUCCESS
  // ══════════════════════════════════════════════════
  if (authFlow === "forgot_success") {
    return (
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <ScrollView contentContainerStyle={styles.activatedScrollContent}>
          <View style={styles.activatedCard}>
            {/* Premium Dual-Ring Emerald Success Icon */}
            <View style={styles.passwordSuccessIconRing}>
              <View style={styles.passwordSuccessIconInner}>
                <Ionicons name="checkmark" size={32} color="#FFFFFF" />
              </View>
            </View>

            <Text style={styles.activatedTitle}>Password Updated!</Text>
            <Text style={styles.activatedSubtitle}>
              Your FacePass password has been updated successfully. You can now sign in with your new
              password.
            </Text>

            <TouchableOpacity
              style={styles.activatedPrimaryButton}
              onPress={resetToLogin}
              activeOpacity={0.88}
            >
              <Text style={styles.activatedPrimaryButtonText}>Sign In Now</Text>
              <Ionicons name="arrow-forward" size={18} color="#FFFFFF" style={{ marginLeft: 8 }} />
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ══════════════════════════════════════════════════
  // MAIN VIEW: SIGN IN / SIGN UP SCREEN
  // ══════════════════════════════════════════════════
  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      {/* Background Soft Pastel Accents */}
      <View style={styles.topRightAccent} pointerEvents="none" />
      <View style={styles.bottomLeftAccent} pointerEvents="none" />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Top Bar: Brand on Left, Tour App on Right (NO SPARKLE) */}
          <View style={styles.topBar}>
            <View style={styles.headerBrand}>
              <View style={styles.logoBadge}>
                <PremiumFaceIdIcon
                  size={24}
                  color="#2563EB"
                />
              </View>
              <View>
                <Text style={styles.brandTitle}>FacePass</Text>
                <Text style={styles.brandSubtitle}>
                  Contactless Facial Attendance
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.tourPill}
              onPress={() => setShowOnboarding(true)}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="compass-outline" size={15} color="#2563EB" />
              <Text style={styles.tourPillText}>Tour App</Text>
            </TouchableOpacity>
          </View>

          {/* Hero Section: Welcome Back / Create your account Title on Left, 3D Avatar on Right */}
          <View style={styles.heroSection}>
            <View style={styles.heroTextCol}>
              {isSignUp ? (
                <Text style={styles.heroTitle}>
                  {"Create your\n"}
                  <Text style={styles.heroTitleAccent}>account</Text>
                </Text>
              ) : (
                <Text style={styles.heroTitle}>{"Welcome\nBack"}</Text>
              )}
              <Text style={styles.heroSubtitle}>
                {isSignUp
                  ? "Get started in seconds and\nbe part of a smarter workplace."
                  : "Sign in with your employee ID\nor email to continue."}
              </Text>
            </View>

            <View style={styles.heroAvatarContainer}>
              <Image
                source={require("../../assets/images/hero_avatar_enlarged.png")}
                style={styles.heroAvatarImage}
                resizeMode="contain"
              />
            </View>
          </View>

          {/* White Floating Form Card */}
          <View style={styles.formCard}>
            {/* Activation Success Banner */}
            {activatedBanner && !isSignUp && (
              <View style={styles.activatedSuccessBanner}>
                <Ionicons name="shield-checkmark" size={22} color="#16A34A" />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.activatedSuccessBannerTitle}>Account Activated!</Text>
                  <Text style={styles.activatedSuccessBannerText}>{activatedBanner}</Text>
                </View>
                <TouchableOpacity onPress={() => setActivatedBanner(null)}>
                  <Ionicons name="close" size={18} color="#64748B" />
                </TouchableOpacity>
              </View>
            )}

            {/* Sign Up: Card Header */}
            {isSignUp && (
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderIcon}>
                  <Ionicons name="person-outline" size={24} color="#64748B" />
                </View>
                <View>
                  <Text style={styles.cardHeaderTitle}>Create Account</Text>
                  <Text style={styles.cardHeaderSubtitle}>
                    Enter your details to generate your employee ID
                  </Text>
                </View>
              </View>
            )}

            {/* Signup: First Name and Last Name in a Row */}
            {isSignUp && (
              <View style={styles.nameRow}>
                <View style={[styles.signupFieldGroup, styles.halfBox]}>
                  <View style={styles.fieldLabelRow}>
                    <Ionicons name="person-outline" size={14} color="#1E293B" />
                    <Text style={styles.fieldLabel}>First Name</Text>
                  </View>
                  <View style={styles.signupInputBox}>
                    <TextInput
                      style={styles.textInput}
                      value={firstName}
                      onChangeText={setFirstName}
                      placeholder="e.g. Nelson"
                      placeholderTextColor="#94A3B8"
                      autoCapitalize="words"
                    />
                  </View>
                </View>

                <View style={[styles.signupFieldGroup, styles.halfBox]}>
                  <View style={styles.fieldLabelRow}>
                    <Ionicons name="person-outline" size={14} color="#1E293B" />
                    <Text style={styles.fieldLabel}>Last Name</Text>
                  </View>
                  <View style={styles.signupInputBox}>
                    <TextInput
                      style={styles.textInput}
                      value={lastName}
                      onChangeText={setLastName}
                      placeholder="e.g. Izah"
                      placeholderTextColor="#94A3B8"
                      autoCapitalize="words"
                    />
                  </View>
                </View>
              </View>
            )}

            {/* Email (sign-up) / Employee ID or Email (sign-in) */}
            {isSignUp ? (
              <View style={styles.signupFieldGroup}>
                <View style={styles.fieldLabelRow}>
                  <Ionicons name="mail-outline" size={14} color="#1E293B" />
                  <Text style={styles.fieldLabel}>Email Address</Text>
                </View>
                <View style={styles.signupInputBox}>
                  <TextInput
                    style={styles.textInput}
                    value={emailOrId}
                    onChangeText={setEmailOrId}
                    placeholder="nelson@example.com"
                    placeholderTextColor="#94A3B8"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
              </View>
            ) : (
              <View style={styles.inputBox}>
                <Ionicons
                  name="mail-outline"
                  size={20}
                  color="#94A3B8"
                  style={styles.inputLeadingIcon}
                />
                <View style={styles.inputContentCol}>
                  <Text style={styles.inputFloatingLabel}>
                    Employee ID or Email
                  </Text>
                  <TextInput
                    style={styles.textInput}
                    value={emailOrId}
                    onChangeText={setEmailOrId}
                    placeholder="e.g. FP-60948 or user@email.com"
                    placeholderTextColor="#94A3B8"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
              </View>
            )}

            {/* Signup: Optional Employee ID */}
            {isSignUp && (
              <View style={styles.signupFieldGroup}>
                <View style={styles.fieldLabelRow}>
                  <Ionicons name="card-outline" size={14} color="#1E293B" />
                  <Text style={styles.fieldLabel}>
                    Employee ID{" "}
                    <Text style={styles.fieldLabelOptional}>(Optional)</Text>
                  </Text>
                </View>
                <View style={styles.signupInputBox}>
                  <TextInput
                    style={styles.textInput}
                    value={customId}
                    onChangeText={setCustomId}
                    placeholder="e.g. FP-92810 (or leave empty)"
                    placeholderTextColor="#94A3B8"
                    autoCapitalize="characters"
                    autoCorrect={false}
                  />
                </View>
              </View>
            )}

            {/* Password with Eye Toggle */}
            {isSignUp ? (
              <View style={styles.signupFieldGroup}>
                <View style={styles.fieldLabelRow}>
                  <Ionicons name="lock-closed-outline" size={14} color="#1E293B" />
                  <Text style={styles.fieldLabel}>Password</Text>
                </View>
                <View style={[styles.signupInputBox, { flexDirection: "row", alignItems: "center" }]}>
                  <TextInput
                    style={[styles.textInput, { flex: 1 }]}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Enter your password"
                    placeholderTextColor="#94A3B8"
                    secureTextEntry={!showPassword}
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword(!showPassword)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    style={styles.eyeButton}
                  >
                    <Ionicons
                      name={showPassword ? "eye-off-outline" : "eye-outline"}
                      size={20}
                      color="#94A3B8"
                    />
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.inputBox}>
                <Ionicons
                  name="lock-closed-outline"
                  size={20}
                  color="#94A3B8"
                  style={styles.inputLeadingIcon}
                />
                <View style={styles.inputContentCol}>
                  <Text style={styles.inputFloatingLabel}>Password</Text>
                  <TextInput
                    style={styles.textInput}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Enter your password"
                    placeholderTextColor="#94A3B8"
                    secureTextEntry={!showPassword}
                  />
                </View>
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={styles.eyeButton}
                >
                  <Ionicons
                    name={showPassword ? "eye-off-outline" : "eye-outline"}
                    size={20}
                    color="#94A3B8"
                  />
                </TouchableOpacity>
              </View>
            )}

            {/* Options Row: Remember me checkbox + Forgot password link (sign-in only) */}
            {!isSignUp && (
              <View style={styles.optionsRow}>
                <TouchableOpacity
                  style={styles.rememberMeGroup}
                  onPress={() => setRememberMe(!rememberMe)}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      styles.checkbox,
                      rememberMe && styles.checkboxChecked,
                    ]}
                  >
                    {rememberMe && (
                      <Ionicons name="checkmark" size={13} color="#FFFFFF" />
                    )}
                  </View>
                  <Text style={styles.rememberMeLabel}>Remember me</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setAuthFlow("forgot_step1")}
                  activeOpacity={0.7}
                >
                  <Text style={styles.forgotPasswordLink}>Forgot password?</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Primary Action Button: Sign In → */}
            <TouchableOpacity
              style={[
                styles.primaryButton,
                loading && styles.primaryButtonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={loading}
              activeOpacity={0.88}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <View style={styles.primaryButtonRow}>
                  <Text style={styles.primaryButtonText}>
                    {isSignUp ? "Generate ID & Sign Up" : "Sign In"}
                  </Text>
                  <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
                </View>
              )}
            </TouchableOpacity>

            {/* OR Divider & Use Face ID Button (Sign In mode) */}
            {!isSignUp && (
              <>
                <View style={styles.dividerRow}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerLabel}>OR</Text>
                  <View style={styles.dividerLine} />
                </View>

                <TouchableOpacity
                  style={[
                    styles.faceIdButton,
                    hasBiometricCreds && styles.faceIdButtonLinked,
                    biometricLoading && styles.primaryButtonDisabled,
                  ]}
                  onPress={handleUseFaceId}
                  disabled={biometricLoading}
                  activeOpacity={0.75}
                >
                  {biometricLoading ? (
                    <ActivityIndicator size="small" color="#2563EB" />
                  ) : (
                    <>
                      {biometricStatus?.biometricType === "fingerprint" ? (
                        <MaterialCommunityIcons
                          name="fingerprint"
                          size={22}
                          color="#2563EB"
                        />
                      ) : (
                        <Image
                          source={require("../../assets/images/exact_face_id_icon.png")}
                          style={styles.faceIdIcon}
                          resizeMode="contain"
                        />
                      )}
                      <Text style={styles.faceIdButtonText}>
                        {hasBiometricCreds
                          ? `Sign in with ${biometricStatus?.label || "Biometrics"}`
                          : `Use ${biometricStatus?.label || "Face ID / Biometrics"}`}
                      </Text>
                      {hasBiometricCreds && (
                        <View style={styles.biometricLinkedDot} />
                      )}
                    </>
                  )}
                </TouchableOpacity>
              </>
            )}

            {/* Toggle Between Sign In & Sign Up */}
            <TouchableOpacity
              style={styles.toggleRow}
              onPress={() => setIsSignUp(!isSignUp)}
              activeOpacity={0.7}
              hitSlop={{ top: 15, bottom: 15, left: 30, right: 30 }}
            >
              <Text style={styles.toggleTextRegular}>
                {isSignUp
                  ? "Already registered? "
                  : "Don't have an account? "}
              </Text>
              <Text style={styles.toggleTextHighlight}>
                {isSignUp ? "Sign In" : "Sign Up"}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Bottom Footer Row */}
          <View style={styles.footerRow}>
            <View style={styles.footerLeft}>
              <View style={styles.shieldIconCircle}>
                <Ionicons name="shield-checkmark" size={14} color="#64748B" />
              </View>
              <Text style={styles.footerLeftText}>Secure • Fast • Reliable</Text>
            </View>

            {!isSignUp && (
              <Text style={styles.footerRightText}>
                {"Smarter Attendance\nfor a Better Workplace"}
              </Text>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Swipeable Onboarding Carousel Modal */}
      <Modal
        visible={showOnboarding}
        animationType="slide"
        onRequestClose={() => setShowOnboarding(false)}
      >
        <OnboardingCarousel
          onComplete={() => setShowOnboarding(false)}
          onLoginPress={() => {
            setShowOnboarding(false);
            setIsSignUp(false);
          }}
        />
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  topRightAccent: {
    position: "absolute",
    top: -40,
    right: -40,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: "#E0F2FE",
    opacity: 0.65,
  },
  bottomLeftAccent: {
    position: "absolute",
    bottom: -60,
    left: -50,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "#DCFCE7",
    opacity: 0.55,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
  },

  // Top Bar
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
    paddingTop: Platform.OS === "android" ? 4 : 0,
  },
  headerBrand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  logoBadge: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "#EFF6FF",
    borderWidth: 1.5,
    borderColor: "#DBEAFE",
    alignItems: "center",
    justifyContent: "center",
  },
  brandTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#0F172A",
    letterSpacing: -0.5,
  },
  brandSubtitle: {
    fontSize: 11,
    fontWeight: "500",
    color: "#64748B",
    marginTop: -1,
  },
  tourPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    gap: 5,
  },
  tourPillText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#2563EB",
  },

  // Hero Section
  heroSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 22,
    paddingHorizontal: 4,
  },
  heroTextCol: {
    flex: 1,
    paddingRight: 10,
  },
  heroTitle: {
    fontSize: 30,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: -0.8,
    lineHeight: 36,
  },
  heroTitleAccent: {
    color: "#2563EB",
  },
  heroSubtitle: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 8,
    lineHeight: 19,
    fontWeight: "400",
  },
  heroAvatarContainer: {
    width: 180,
    height: 155,
    alignItems: "center",
    justifyContent: "center",
  },
  heroAvatarImage: {
    width: 180,
    height: 155,
  },

  // Floating Form Card
  formCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 26,
    padding: 20,
    borderWidth: 1,
    borderColor: "#F1F5F9",
    shadowColor: "#0F172A",
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 18,
    elevation: 4,
    marginBottom: 24,
  },
  nameRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 4,
  },
  halfBox: {
    flex: 1,
  },

  // Sign-Up Card Header
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 22,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  cardHeaderIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  cardHeaderTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0F172A",
  },
  cardHeaderSubtitle: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },

  // Sign-Up Field Group
  signupFieldGroup: {
    marginBottom: 14,
  },
  fieldLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1E293B",
  },
  fieldLabelOptional: {
    fontSize: 12,
    fontWeight: "400",
    color: "#94A3B8",
  },
  signupInputBox: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1.2,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  inputBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1.2,
    borderColor: "#E2E8F0",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 14,
  },
  inputLeadingIcon: {
    marginRight: 12,
  },
  inputContentCol: {
    flex: 1,
  },
  inputFloatingLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#1E293B",
    marginBottom: 2,
  },
  textInput: {
    fontSize: 14,
    color: "#0F172A",
    padding: 0,
    fontWeight: "500",
  },
  eyeButton: {
    padding: 4,
  },

  // Options Row
  optionsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 2,
    marginBottom: 20,
  },
  rememberMeGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    backgroundColor: "#2563EB",
    borderColor: "#2563EB",
  },
  rememberMeLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: "#334155",
  },
  forgotPasswordLink: {
    fontSize: 13,
    fontWeight: "600",
    color: "#2563EB",
  },

  // Primary Button
  primaryButton: {
    backgroundColor: "#2563EB",
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#2563EB",
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 3,
  },
  primaryButtonDisabled: {
    opacity: 0.65,
  },
  primaryButtonRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },

  // Divider
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginVertical: 18,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#E2E8F0",
  },
  dividerLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#94A3B8",
    letterSpacing: 0.5,
  },

  // Use Face ID Button
  faceIdButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1.2,
    borderColor: "#E2E8F0",
    borderRadius: 16,
    paddingVertical: 14,
    gap: 10,
  },
  faceIdButtonLinked: {
    borderColor: "#93C5FD",
    backgroundColor: "#EFF6FF",
  },
  biometricLinkedDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#16A34A",
    marginLeft: 4,
  },
  faceIdIcon: {
    width: 24,
    height: 24,
  },
  faceIdButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1E293B",
  },

  // Bottom Toggle Row
  toggleRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 18,
  },
  toggleTextRegular: {
    fontSize: 13,
    color: "#64748B",
  },
  toggleTextHighlight: {
    fontSize: 13,
    fontWeight: "700",
    color: "#2563EB",
  },

  // Footer Row
  footerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 4,
    paddingTop: 8,
  },
  footerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  shieldIconCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  footerLeftText: {
    fontSize: 11,
    fontWeight: "500",
    color: "#64748B",
  },
  footerRightText: {
    fontSize: 10,
    fontWeight: "500",
    color: "#94A3B8",
    textAlign: "right",
    lineHeight: 14,
  },

  // ─── OTP & Flow Screens ───
  flowScrollContent: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 40,
    flexGrow: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 28,
  },
  flowIconBox: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: "#EFF6FF",
    borderWidth: 1.5,
    borderColor: "#DBEAFE",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  flowTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  flowSubtitle: {
    fontSize: 15,
    color: "#64748B",
    lineHeight: 22,
    marginBottom: 32,
  },
  flowEmailHighlight: {
    fontWeight: "700",
    color: "#2563EB",
  },
  otpRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
    marginBottom: 32,
  },
  otpBox: {
    width: 48,
    height: 56,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    fontSize: 22,
    fontWeight: "800",
    color: "#0F172A",
    textAlign: "center",
  },
  otpBoxFilled: {
    borderColor: "#2563EB",
    backgroundColor: "#EFF6FF",
  },
  flowPrimaryButton: {
    width: "100%",
    backgroundColor: "#2563EB",
    borderRadius: 16,
    height: 56,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#2563EB",
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 3,
  },
  flowPrimaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  resendRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 20,
  },
  resendLabel: {
    fontSize: 13,
    color: "#64748B",
  },
  resendLink: {
    fontSize: 13,
    fontWeight: "700",
    color: "#2563EB",
  },
  resendLinkDisabled: {
    color: "#94A3B8",
  },
  flowInputBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderWidth: 1.2,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 20,
  },
  flowSecondaryLink: {
    alignItems: "center",
    marginTop: 20,
  },
  flowSecondaryLinkText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#64748B",
  },

  // ─── Activated / Celebration Screen ───
  activatedScrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 32,
  },
  activatedCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 28,
    padding: 26,
    alignItems: "center",
    shadowColor: "#0F172A",
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 28,
    elevation: 8,
  },
  confettiIconContainer: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: "#FEF3C7",
    borderWidth: 3,
    borderColor: "#FDE68A",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    shadowColor: "#F59E0B",
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    elevation: 4,
  },
  passwordSuccessIconRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "#ECFDF5",
    borderWidth: 2.5,
    borderColor: "#A7F3D0",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    shadowColor: "#10B981",
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
  },
  passwordSuccessIconInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#10B981",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#10B981",
    shadowOpacity: 0.35,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 4,
  },
  confettiEmoji: {
    fontSize: 42,
  },
  activatedTitle: {
    fontSize: 28,
    fontWeight: "900",
    color: "#0F172A",
    letterSpacing: -0.6,
    marginBottom: 8,
    textAlign: "center",
  },
  activatedSubtitle: {
    fontSize: 14,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 21,
    marginBottom: 22,
    paddingHorizontal: 6,
  },
  employeeIdCard: {
    width: "100%",
    backgroundColor: "#F0F7FF",
    borderWidth: 1.5,
    borderColor: "#BFDBFE",
    borderRadius: 20,
    padding: 20,
    marginBottom: 18,
    shadowColor: "#2563EB",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 2,
  },
  idCardTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  idCardBrandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  idCardBrandTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: "#2563EB",
    letterSpacing: 0.8,
  },
  verifiedBadgePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#DCFCE7",
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#BBF7D0",
  },
  verifiedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#16A34A",
  },
  verifiedBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#15803D",
  },
  idCardCodeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  badgeCode: {
    fontSize: 34,
    fontWeight: "900",
    color: "#1E3A8A",
    letterSpacing: 2.5,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  copyIdBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#DBEAFE",
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  copyIdBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#2563EB",
  },
  idCardDivider: {
    height: 1,
    backgroundColor: "#DBEAFE",
    marginVertical: 12,
  },
  idCardBottomRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  idCardUserText: {
    fontSize: 13,
    color: "#475569",
    fontWeight: "500",
    flex: 1,
  },
  activatedTipCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
    borderRadius: 14,
    padding: 14,
    width: "100%",
    marginBottom: 22,
    gap: 10,
  },
  tipIcon: {
    fontSize: 18,
    marginTop: -1,
  },
  activatedTipCardText: {
    fontSize: 13,
    color: "#92400E",
    lineHeight: 18,
    flex: 1,
  },
  activatedPrimaryButton: {
    width: "100%",
    height: 56,
    backgroundColor: "#2563EB",
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#2563EB",
    shadowOpacity: 0.35,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 14,
    elevation: 6,
  },
  activatedPrimaryButtonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  activatedSuccessBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0FDF4",
    borderWidth: 1.2,
    borderColor: "#BBF7D0",
    borderRadius: 14,
    padding: 14,
    marginBottom: 18,
  },
  activatedSuccessBannerTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#166534",
    marginBottom: 2,
  },
  activatedSuccessBannerText: {
    fontSize: 12,
    color: "#15803D",
    lineHeight: 16,
  },
});
