import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Vraagt toestemming en registreert dit toestel bij Expo's push-service. Geeft altijd
// `null` terug in plaats van te crashen: op web, in een simulator, bij een geweigerde
// toestemming, of zolang er nog geen EAS-project gekoppeld is (projectId ontbreekt in
// app.json totdat `eas init` gedraaid is).
export async function registerForPushToken() {
  if (Platform.OS === "web") return null; // moet vóór Device.isDevice: die geeft op web altijd true terug
  if (!Device.isDevice) return null;
  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    const perm = await Notifications.getPermissionsAsync();
    let status = perm.status;
    if (status !== "granted") status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== "granted") return null;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return null; // eas init nog niet gedraaid
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return data;
  } catch {
    return null;
  }
}

// Fire-and-forget, zelfde conventie als src/sync.js — geen eigen server nodig, Expo's
// publieke push-endpoint accepteert dit rechtstreeks vanaf de client.
export async function sendPushNotification(token, title, body, data) {
  if (!token) return;
  try {
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ to: token, title, body, data, sound: "default" }),
    });
  } catch {}
}
