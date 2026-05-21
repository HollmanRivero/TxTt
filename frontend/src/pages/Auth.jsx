import { useState } from "react";
import {
  signInWithGoogle,
  signInWithApple,
  sendEmailOTP,
  sendPhoneOTP,
  verifyOTP,
} from "../lib/supabase";
import "./Auth.css";

// ── Phone number formatter to E.164 ──────────────────────────────────────────
const toE164 = (raw) => {
  const digits = raw.replace(/\D/g, "");
  return digits.startsWith("00")
    ? "+" + digits.slice(2)
    : digits.startsWith("+")
    ? raw.trim()
    : "+" + digits;
};

const isValidEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const isValidPhone = (v) => /^\+?[\d\s\-()]{7,}$/.test(v);

// ─────────────────────────────────────────────────────────────────────────────

export default function AuthPage() {
  const [mode, setMode] = useState("choose"); // choose | otp-entry | otp-verify
  const [inputType, setInputType] = useState(null); // "email" | "phone"
  const [inputValue, setInputValue] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);

  // ── Detect whether user typed email or phone ────────────────────────────
  const detectType = (val) => {
    if (isValidEmail(val)) return "email";
    if (isValidPhone(val)) return "phone";
    return null;
  };

  const handleInputChange = (e) => {
    setInputValue(e.target.value);
    setError(null);
    setInputType(detectType(e.target.value));
  };

  // ── Send OTP ─────────────────────────────────────────────────────────────
  const handleSendOTP = async (e) => {
    e.preventDefault();
    setError(null);

    const type = detectType(inputValue);
    if (!type) {
      setError("Enter a valid email address or phone number (with country code).");
      return;
    }

    setLoading(true);
    try {
      let result;
      if (type === "email") {
        result = await sendEmailOTP(inputValue.trim());
      } else {
        result = await sendPhoneOTP(toE164(inputValue));
      }

      if (result.error) throw result.error;

      setInputType(type);
      setInfo(
        type === "email"
          ? `Check ${inputValue} — a 6-digit code is on its way.`
          : `SMS sent to ${toE164(inputValue)}.`
      );
      setMode("otp-verify");
    } catch (err) {
      setError(err.message || "Failed to send code. Try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── Verify OTP ────────────────────────────────────────────────────────────
  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    setError(null);

    if (otp.length < 6) {
      setError("Enter the 6-digit code.");
      return;
    }

    setLoading(true);
    try {
      const payload =
        inputType === "email"
          ? { email: inputValue.trim(), token: otp }
          : { phone: toE164(inputValue), token: otp };

      const result = await verifyOTP(payload);
      if (result.error) throw result.error;
      // Auth context picks up the session change — App will redirect
    } catch (err) {
      setError(err.message || "Invalid code. Check and try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── Google OAuth ──────────────────────────────────────────────────────────
  const handleGoogle = async () => {
    setError(null);
    setLoading(true);
    const { error } = await signInWithGoogle();
    if (error) { setError(error.message); setLoading(false); }
    // Browser redirects to Google — loading stays true until redirect
  };

  // ── Apple OAuth ───────────────────────────────────────────────────────────
  const handleApple = async () => {
    setError(null);
    setLoading(true);
    const { error } = await signInWithApple();
    if (error) { setError(error.message); setLoading(false); }
  };

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="auth-root">
      <div className="auth-card">

        {/* Logo */}
        <div className="auth-logo">
          <span className="logo-tx">Tx</span><span className="logo-tt">Tt</span>
        </div>
        <p className="auth-tagline">Talk. Share. Call. Offline first.</p>

        {/* ── STEP 1: Choose method ───────────────────────────── */}
        {mode === "choose" && (
          <>
            <form className="auth-form" onSubmit={handleSendOTP}>
              <label className="auth-label">
                Phone or email
                <input
                  className="auth-input"
                  type="text"
                  placeholder="+47 123 45 678 or you@email.com"
                  value={inputValue}
                  onChange={handleInputChange}
                  autoComplete="username"
                  disabled={loading}
                />
                {inputType && (
                  <span className="input-hint">
                    {inputType === "email" ? "📧 Email OTP" : "📱 SMS via Twilio"}
                  </span>
                )}
              </label>

              {error && <p className="auth-error">{error}</p>}

              <button
                className="auth-btn primary"
                type="submit"
                disabled={loading || !inputType}
              >
                {loading ? <span className="spinner" /> : "Send code →"}
              </button>
            </form>

            <div className="auth-divider"><span>or</span></div>

            {/* OAuth buttons */}
            <div className="oauth-stack">
              <button
                className="auth-btn oauth google"
                onClick={handleGoogle}
                disabled={loading}
                type="button"
              >
                <GoogleIcon />
                Continue with Google
              </button>

              <button
                className="auth-btn oauth apple"
                onClick={handleApple}
                disabled={loading}
                type="button"
              >
                <AppleIcon />
                Continue with Apple
              </button>
            </div>

            <p className="auth-legal">
              By continuing you agree to our{" "}
              <a href="/terms">Terms</a> and{" "}
              <a href="/privacy">Privacy Policy</a>.
            </p>
          </>
        )}

        {/* ── STEP 2: Verify OTP ──────────────────────────────── */}
        {mode === "otp-verify" && (
          <>
            {info && <p className="auth-info">{info}</p>}

            <form className="auth-form" onSubmit={handleVerifyOTP}>
              <label className="auth-label">
                6-digit code
                <input
                  className="auth-input otp-input"
                  type="number"
                  placeholder="123456"
                  value={otp}
                  onChange={(e) => {
                    setOtp(e.target.value.slice(0, 6));
                    setError(null);
                  }}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  disabled={loading}
                />
              </label>

              {error && <p className="auth-error">{error}</p>}

              <button
                className="auth-btn primary"
                type="submit"
                disabled={loading || otp.length < 6}
              >
                {loading ? <span className="spinner" /> : "Verify →"}
              </button>
            </form>

            <button
              className="auth-btn ghost"
              onClick={() => { setMode("choose"); setOtp(""); setError(null); setInfo(null); }}
              type="button"
            >
              ← Back
            </button>

            <p className="auth-resend">
              Didn't get a code?{" "}
              <button
                className="link-btn"
                onClick={handleSendOTP}
                disabled={loading}
                type="button"
              >
                Resend
              </button>
            </p>
          </>
        )}

      </div>
    </div>
  );
}

// ── SVG icons ─────────────────────────────────────────────────────────────────

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
      <path d="M3.964 10.707A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor">
      <path d="M14.98 9.53c-.02-2.18 1.78-3.24 1.86-3.29-1.01-1.48-2.59-1.68-3.15-1.7-1.34-.14-2.62.79-3.3.79-.68 0-1.73-.77-2.85-.75-1.46.02-2.81.85-3.56 2.16-1.52 2.63-.39 6.53 1.09 8.67.72 1.05 1.58 2.23 2.72 2.18 1.09-.04 1.51-.71 2.83-.71 1.32 0 1.7.71 2.86.69 1.18-.02 1.92-1.07 2.64-2.12.83-1.21 1.17-2.39 1.19-2.45-.03-.01-2.28-.87-2.3-3.47zM12.79 3.15c.6-.73 1-1.74.89-2.75-.86.04-1.9.57-2.51 1.29-.55.64-1.04 1.67-.91 2.65.96.07 1.94-.49 2.53-1.19z"/>
    </svg>
  );
}
