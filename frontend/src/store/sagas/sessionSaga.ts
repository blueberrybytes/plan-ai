/* eslint-disable @typescript-eslint/no-explicit-any */
import { call, put, takeLatest, all } from "redux-saga/effects";
import {
  loginEmail,
  loginGoogle,
  loginMicrosoft,
  loginSuccess,
  sessionError,
  logout,
  forgotPassword,
  signupEmail,
  setIsLoading,
  setUserDb,
} from "../slices/session/sessionSlice";
import { resetStore } from "../actions";
import {
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
  UserCredential,
  signOut,
  sendPasswordResetEmail,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  User,
} from "firebase/auth";
import { UserApp } from "../slices/session/sessionTypes";
import { AppExceptionType, ErrorCause } from "../../types/ErrorTypes";
import { analytics, auth } from "../../firebase/firebase";
import { navigate } from "../../navigation/navigation";
import { logEvent, setUserId, setUserProperties } from "firebase/analytics";
import axios from "axios";
import { User as UserType } from "../../types/UserTypes";

// API imports
import { ApiResponseUserResponse, sessionApi } from "../apis/sessionApi";
import { accountApi } from "../apis/accountApi";

/**
 * Ensure all API caches are fresh after login
 * This helps prevent stale data issues, especially with integrations
 */
function* refreshApiCachesAfterLogin(): Generator<any, void, any> {
  console.log("Refreshing API caches after login...");

  // First reset all API states to clear any stale data
  yield call(resetAllApiStates);
  console.log("API caches refreshed successfully");
}

// Worker saga for Microsoft login
function* loginMicrosoftFunc(): Generator<any, void, any> {
  try {
    console.log("Starting Microsoft login process");
    const provider = new OAuthProvider("microsoft.com");
    // Optionally add scopes if needed in future: provider.addScope("User.Read");
    const result: UserCredential = yield call(signInWithPopup, auth, provider);
    const user = result.user;
    console.log("Microsoft login successful, user:", user.uid, user.email);

    // Get the ID token
    const token = yield call([user, user.getIdToken]);
    console.log("Retrieved ID token, first 20 chars:", token.substring(0, 20) + "...");

    const providerIds = user.providerData.map((provider) => provider.providerId);
    console.log("Microsoft login provider IDs:", providerIds);
    const emailVerified =
      !!user.emailVerified || providerIds.some((providerId) => providerId !== "password");

    const userApp: UserApp = {
      email: user.email,
      uid: user.uid,
      creationTime: user.metadata.creationTime,
      lastSignInTime: user.metadata.lastSignInTime,
      token,
      emailVerified,
    };

    // Backend login/register
    console.log("Calling backend API to register/login user (Microsoft)");
    const apiUrl = `${process.env.REACT_APP_API_BACKEND_URL || "http://localhost:8080"}/api/session/login`;
    console.log("API URL:", apiUrl);

    try {
      console.log("About to make axios POST request to:", apiUrl);
      console.log("Request payload:", {
        token: token.substring(0, 20) + "...",
        uuid: user.uid,
      });

      const response: ApiResponseUserResponse = yield call(axios.post, apiUrl, {
        token,
        uuid: user.uid,
      });
      console.log("Backend login successful (Microsoft), response:", response);

      // Update Redux state
      yield loginStats(user);
      yield put(loginSuccess(userApp));

      // Ensure all API caches are fresh after login
      yield call(refreshApiCachesAfterLogin);

      yield put(setIsLoading(false));

      // Store user data from backend
      if (response.data) {
        const userData = mapApiUserToUserType(response.data);
        yield put(setUserDb(userData));
        console.log("User data saved to Redux store (Microsoft)");
      }
    } catch (apiError: any) {
      console.error("========== BACKEND LOGIN API CALL FAILED (MICROSOFT) ===========");
      console.error("Error message:", apiError.message);
      console.error("API response:", apiError.response?.data);
      console.error("Request config:", apiError.config);
      console.error("Status:", apiError.response?.status);
      console.error("==================================================");

      const appError: AppExceptionType = {
        message: `Backend login failed: ${apiError.message}. Please try again or contact support.`,
        cause: ErrorCause.UNKNOWN,
      };
      yield put(sessionError(appError));

      yield loginStats(user);
      yield put(loginSuccess(userApp));
      yield call(refreshApiCachesAfterLogin);
    }
  } catch (error: any) {
    const appError: AppExceptionType = {
      message: error.message,
      cause: ErrorCause.UNKNOWN,
    };
    yield put(sessionError(appError));
  } finally {
    yield put(setIsLoading(false));
  }
}

function* loginStats(user: User): Generator<any, void, any> {
  // Set user ID and properties in Firebase Analytics
  yield call(setUserId, analytics, user.uid);
  yield call(setUserProperties, analytics, {
    email: user.email,
    creation_time: user.metadata.creationTime,
    last_sign_in: user.metadata.lastSignInTime,
  });

  // Log the login event
  yield call(logEvent, analytics, "login", { method: "email" });
}

// Worker saga for email login
function* loginEmailFunc(action: ReturnType<typeof loginEmail>): Generator<any, void, any> {
  try {
    const { email, password } = action.payload;
    const userCredential: UserCredential = yield call(
      signInWithEmailAndPassword,
      auth,
      email,
      password,
    );
    const user: User = userCredential.user;

    // If email is not verified, stop here and inform the user
    if (!user.emailVerified) {
      // Re-send verification email with a short local cooldown to avoid rate limits
      const cooldownMs = 2 * 60 * 1000; // 2 minutes
      const lastSentAt = Number(localStorage.getItem("emailVerificationLastSentAt")) || 0;
      const now = Date.now();
      let message =
        "Your email address is not verified yet. Please verify your email and then sign in.";

      if (now - lastSentAt > cooldownMs) {
        try {
          yield call(sendEmailVerification, user);
          localStorage.setItem("emailVerificationLastSentAt", String(now));
          message =
            "Your email address is not verified yet. We've sent you a new verification email. Please verify your email and then sign in.";
        } catch (verifyErr: any) {
          // Gracefully handle rate limiting or other verification send errors
          if (verifyErr?.code === "auth/too-many-requests") {
            message =
              "Too many verification requests. Please wait a few minutes before trying again, then verify your email and sign in.";
          } else {
            // Keep generic message but log for debugging
            console.error("sendEmailVerification failed:", verifyErr);
          }
        }
      } else {
        message =
          "A verification email was recently sent. Please check your inbox and verify your email before signing in.";
      }

      // Show a blocking alert to ensure the user sees the message immediately
      alert(message);

      // Ensure no authenticated state remains
      yield call(signOut, auth);
      const appError: AppExceptionType = {
        message: message,
        cause: ErrorCause.EMAIL_VERIFICATION_NEEDED,
      };
      yield put(sessionError(appError));
      return;
    }

    // Get the ID token (only after verification)
    const token = yield call([user, user.getIdToken]);

    // Create user app object
    const userApp: UserApp = {
      email: user.email,
      uid: user.uid,
      creationTime: user.metadata.creationTime,
      lastSignInTime: user.metadata.lastSignInTime,
      token,
      emailVerified: true,
    };

    // Call our backend API to login/register using axios
    const apiUrl = `${
      process.env.REACT_APP_API_BACKEND_URL || "http://localhost:8080"
    }/api/session/login`;
    const response = yield call(axios.post, apiUrl, { token, uuid: user.uid });

    // Update Redux state
    yield loginStats(user);
    yield put(loginSuccess(userApp));

    // Ensure all API caches are fresh after login
    yield call(refreshApiCachesAfterLogin);

    // Store user data from backend
    if (response.data) {
      const userData = mapApiUserToUserType(response.data);
      yield put(setUserDb(userData));
    }
  } catch (error: any) {
    // Map Firebase auth errors to clearer messages
    let message: string = error?.message || "An unexpected error occurred";
    let cause: ErrorCause = ErrorCause.UNKNOWN;

    switch (error?.code) {
      case "auth/too-many-requests":
        message =
          "Too many login attempts or verification requests. Please wait a few minutes before trying again. If your email is not verified, verify it first from your inbox.";
        cause = ErrorCause.EMAIL_VERIFICATION_NEEDED;
        break;
      case "auth/invalid-credential":
      case "auth/wrong-password":
        message = "Invalid email or password. Please try again.";
        cause = ErrorCause.INVALID_CREDENTIALS;
        break;
      case "auth/user-not-found":
        message = "No account found with this email address.";
        cause = ErrorCause.NO_USER_FOUND;
        break;
      case "auth/invalid-email":
        message = "The email address is not valid.";
        cause = ErrorCause.EMAIL_ADDRESS_NOT_VALID;
        break;
      default:
        // Keep default message
        break;
    }

    const appError: AppExceptionType = { message, cause };
    yield put(sessionError(appError));
  } finally {
    yield put(setIsLoading(false));
  }
}

// Worker saga for Google login
function* loginGoogleFunc(): Generator<any, void, any> {
  try {
    console.log("Starting Google login process");
    const provider = new GoogleAuthProvider();
    const result: UserCredential = yield call(signInWithPopup, auth, provider);
    const user = result.user;
    console.log("Google login successful, user:", user.uid, user.email);

    // Get the ID token
    const token = yield call([user, user.getIdToken]);
    console.log("Retrieved ID token, first 20 chars:", token.substring(0, 20) + "...");

    const providerIds = user.providerData.map((provider) => provider.providerId);
    console.log("Google login provider IDs:", providerIds);
    const emailVerified =
      !!user.emailVerified || providerIds.some((providerId) => providerId !== "password");

    const userApp: UserApp = {
      email: user.email,
      uid: user.uid,
      creationTime: user.metadata.creationTime,
      lastSignInTime: user.metadata.lastSignInTime,
      token,
      emailVerified,
    };

    // Log before backend call
    console.log("Calling backend API to register/login user");
    const apiUrl = `${process.env.REACT_APP_API_BACKEND_URL || "http://localhost:8080"}/api/session/login`;
    console.log("API URL:", apiUrl);

    try {
      console.log("About to make axios POST request to:", apiUrl);
      console.log("Request payload:", {
        token: token.substring(0, 20) + "...",
        uuid: user.uid,
      });

      // Call our backend API to login/register using axios
      const response: ApiResponseUserResponse = yield call(axios.post, apiUrl, {
        token,
        uuid: user.uid,
      });
      console.log("Backend login successful, response:", response);

      // Update Redux state
      yield loginStats(user);
      yield put(loginSuccess(userApp));

      // Ensure all API caches are fresh after login
      yield call(refreshApiCachesAfterLogin);

      yield put(setIsLoading(false));

      // Store user data from backend
      if (response.data) {
        const userData = mapApiUserToUserType(response.data);
        yield put(setUserDb(userData));
        console.log("User data saved to Redux store");
      }
    } catch (apiError: any) {
      console.error("========== BACKEND LOGIN API CALL FAILED ===========");
      console.error("Error message:", apiError.message);
      console.error("API response:", apiError.response?.data);
      console.error("Request config:", apiError.config);
      console.error("Status:", apiError.response?.status);
      console.error("==================================================");

      // Add the error to Redux store instead of throwing it
      // This allows the user to still be logged in with Firebase even if the backend call fails
      const appError: AppExceptionType = {
        message: `Backend login failed: ${apiError.message}. Please try again or contact support.`,
        cause: ErrorCause.UNKNOWN,
      };
      yield put(sessionError(appError));
      yield loginStats(user);
      yield put(loginSuccess(userApp));

      // Ensure all API caches are fresh after login
      yield call(refreshApiCachesAfterLogin);
    }
  } catch (error: any) {
    const appError: AppExceptionType = {
      message: error.message,
      cause: ErrorCause.UNKNOWN,
    };
    yield put(sessionError(appError));
  } finally {
    yield put(setIsLoading(false));
  }
}

function* signupEmailFunc(action: ReturnType<typeof signupEmail>): Generator<any, void, any> {
  try {
    const { email, password } = action.payload;
    const userCredential: UserCredential = yield call(
      createUserWithEmailAndPassword,
      auth,
      email,
      password,
    );
    const user = userCredential.user;

    // Get the ID token
    const token = yield call([user, user.getIdToken]);
    console.log("Signup successful, Firebase user created:", user.uid, user.email);
    console.log("Retrieved ID token for signup, first 20 chars:", token.substring(0, 20) + "...");

    const userApp: UserApp = {
      email: user.email,
      uid: user.uid,
      creationTime: user.metadata.creationTime,
      lastSignInTime: user.metadata.lastSignInTime,
      token,
      emailVerified: !!user.emailVerified,
    };

    // Call our backend API to create the user in the database
    const apiUrl = `${process.env.REACT_APP_API_BACKEND_URL || "http://localhost:8080"}/api/session/login`;
    console.log("Calling backend API to create user in database for signup");
    console.log("API URL:", apiUrl);
    console.log("Environment REACT_APP_API_BACKEND_URL:", process.env.REACT_APP_API_BACKEND_URL);

    try {
      console.log("About to make axios POST request for signup to:", apiUrl);
      console.log("Request payload:", {
        token: token.substring(0, 20) + "...",
        uuid: user.uid,
      });

      const response: ApiResponseUserResponse = yield call(axios.post, apiUrl, {
        token,
        uuid: user.uid,
      });
      console.log("Backend user creation successful for signup, response:", response);

      // Store user data from backend
      if (response.data) {
        const userData = mapApiUserToUserType(response.data);
        yield put(setUserDb(userData));
        console.log("Signup user data saved to Redux store");
      }

      // Log signup event
      yield loginStats(user);
    } catch (apiError: any) {
      console.error("========== BACKEND USER CREATION API CALL FAILED (SIGNUP) ===========");
      console.error("Error message:", apiError.message);
      console.error("API response:", apiError.response?.data);
      console.error("Request config:", apiError.config);
      console.error("Status:", apiError.response?.status);
      console.error("Request URL:", apiUrl);
      console.error(
        "Environment variable REACT_APP_API_BACKEND_URL:",
        process.env.REACT_APP_API_BACKEND_URL,
      );
      console.error("====================================================================");

      // Show error to user instead of silently failing
      const backendError = apiError.response?.data?.message || apiError.message;
      yield put(
        sessionError({
          message: `Account created in Firebase, but failed to sync with our database: ${backendError}. Please try logging in - your account should work.`,
          cause: ErrorCause.UNKNOWN,
        }),
      );

      // Still continue with email verification flow
      // The user will be created in DB when they log in later
    }

    if (!user.emailVerified) {
      // Send verification email with cooldown handling similar to login flow
      const cooldownMs = 2 * 60 * 1000; // 2 minutes
      const lastSentAt = Number(localStorage.getItem("emailVerificationLastSentAt")) || 0;
      const now = Date.now();
      let message =
        "A verification email has been sent. Please check your email and verify your account before logging in.";

      if (now - lastSentAt > cooldownMs) {
        try {
          yield call(sendEmailVerification, user);
          localStorage.setItem("emailVerificationLastSentAt", String(now));
        } catch (verifyErr: any) {
          if (verifyErr?.code === "auth/too-many-requests") {
            message =
              "Too many verification requests. Please wait a few minutes, then request a new verification email and try logging in again.";
          } else {
            console.error("sendEmailVerification failed (signup):", verifyErr);
          }
        }
      }

      navigate("/login");
      alert(message);
    } else {
      // If email is already verified, log them in
      yield put(loginSuccess(userApp));
      yield call(refreshApiCachesAfterLogin);
    }
  } catch (error: any) {
    console.error("Firebase signup error:", error);
    yield put(
      sessionError({
        message: error.message,
        cause: ErrorCause.UNKNOWN,
      }),
    );
  } finally {
    yield put(setIsLoading(false));
  }
}

function* forgotPasswordFunc(action: ReturnType<typeof forgotPassword>): Generator<any, void, any> {
  try {
    yield call(sendPasswordResetEmail, auth, action.payload);
    alert("Password reset email sent");
    navigate("/login");
  } catch (error: any) {
    console.error("Error sending password reset email", error.message);
    yield put(
      sessionError({
        message: error.message,
        cause: ErrorCause.UNKNOWN,
      }),
    );
  } finally {
    yield put(setIsLoading(false));
  }
}

function* logoutFunc(): Generator<any, void, any> {
  try {
    // First, sign out from Firebase
    yield call(signOut, auth);

    // Reset all API states (shared with resetSessionAllSaga)
    yield call(resetAllApiStates);

    // Reset the entire Redux store
    yield put(resetStore());

    // Navigate to login page
    navigate("/");
  } catch (error) {
    console.error("Error during logout:", error);
  }
}

/**
 * Helper function to reset all API states
 */
function* resetAllApiStates(): Generator<any, void, any> {
  // Reset all API states
  yield put(sessionApi.util.resetApiState());
  yield put(accountApi.util.resetApiState());
}

/**
 * Maps the API user response to the User type expected by the Redux store
 */
function mapApiUserToUserType(apiUser: any): UserType {
  return {
    id: apiUser.id,
    email: apiUser.email,
    name: apiUser.name || "",
    avatar: apiUser.avatarUrl,
    role: apiUser.role,
    company: "", // Default value as it's not in the API response
    createdAt: new Date().toISOString(), // Default value as it's not in the API response
    updatedAt: new Date().toISOString(), // Default value as it's not in the API response
  };
}

export function* sessionSaga(): Generator<any, void, any> {
  yield all([
    takeLatest(loginEmail.type, loginEmailFunc),
    takeLatest(loginGoogle.type, loginGoogleFunc),
    takeLatest(loginMicrosoft.type, loginMicrosoftFunc),
    takeLatest(signupEmail.type, signupEmailFunc),
    takeLatest(forgotPassword.type, forgotPasswordFunc),
    takeLatest(logout.type, logoutFunc),
  ]);
}
