import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

/** Normalizes user input or a Twilio `From` to E.164. Returns null when it isn't a valid number. */
export function toE164(input: string, defaultCountry: CountryCode = "US"): string | null {
  const parsed = parsePhoneNumberFromString(input.trim(), defaultCountry);
  if (!parsed?.isValid()) return null;
  return parsed.number;
}

/** "+15125550123" -> "(512) 555-0123" for US numbers, international format otherwise. */
export function formatPhone(e164: string): string {
  const parsed = parsePhoneNumberFromString(e164);
  if (!parsed) return e164;
  return parsed.country === "US" ? parsed.formatNational() : parsed.formatInternational();
}
