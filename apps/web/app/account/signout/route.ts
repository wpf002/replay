import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "../../../lib/session";

/** Clears a session the API no longer accepts, then shows the sign-in form. */
export function GET(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/account", req.url));
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
