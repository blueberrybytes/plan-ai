import { ServiceAccount } from "firebase-admin";
import EnvUtils from "./utils/EnvUtils";

export const getFirebaseAccountKey = (): ServiceAccount => {
  return JSON.parse(Buffer.from(EnvUtils.get("FIREBASE_SERVICE_KEY"), "base64").toString());
};
