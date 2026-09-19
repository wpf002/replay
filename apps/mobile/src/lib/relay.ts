import { Contact, ContactField, requestPermissionsAsync } from "expo-contacts";
import * as Linking from "expo-linking";
import { Alert, Platform } from "react-native";
import { config } from "./config";

export function relayNumber(fromMe?: string | null): string | null {
  return fromMe ?? config.relayNumber;
}

export async function openMessages(number: string | null, body?: string): Promise<void> {
  if (!number) return Alert.alert("No Relay number yet", "The Relay number isn't configured on the server.");
  const sep = Platform.OS === "ios" ? "&" : "?";
  await Linking.openURL(`sms:${number}${body ? `${sep}body=${encodeURIComponent(body)}` : ""}`);
}

export async function callRelay(number: string | null): Promise<void> {
  if (!number) return Alert.alert("No Relay number yet", "The Relay number isn't configured on the server.");
  await Linking.openURL(`tel:${number}`);
}

export type ContactResult = "added" | "exists" | "denied";

/** Saves Relay as a contact so texts from it show up as "Relay" in Messages. */
export async function saveRelayContact(number: string | null): Promise<ContactResult> {
  if (!number) throw new Error("No Relay number configured");
  const { status } = await requestPermissionsAsync();
  if (status !== "granted") return "denied";

  const digits = number.replace(/\D/g, "").slice(-10);
  const matches = await Contact.getAllDetails([ContactField.PHONES], { name: "Relay" });
  const exists = matches.some((c) => (c.phones ?? []).some((p) => (p.number ?? "").replace(/\D/g, "").endsWith(digits)));
  if (exists) return "exists";

  await Contact.create({
    givenName: "Relay",
    company: "Relay",
    note: "Your AI assistant. Text or call this number.",
    phones: [{ label: "mobile", number }],
  });
  return "added";
}

export function openWeb(path: string): Promise<boolean> {
  return Linking.openURL(new URL(path, config.webUrl).toString());
}
