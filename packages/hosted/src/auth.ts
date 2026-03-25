import type { IncomingMessage, ServerResponse } from "node:http";
import crypto from "node:crypto";
import { db } from "./db.js";

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID ?? "";
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET ?? "";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? "";
const APPLE_CLIENT_ID = process.env.APPLE_CLIENT_ID ?? ""; // Service ID (e.g. com.occ.agent)
const APPLE_TEAM_ID = process.env.APPLE_TEAM_ID ?? "";
const APPLE_KEY_ID = process.env.APPLE_KEY_ID ?? "";
const APPLE_PRIVATE_KEY = (process.env.APPLE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
const AUTH_URL = process.env.AUTH_URL ?? "https://agent.occ.wtf";

function redirect(res: ServerResponse, url: string) {
  res.writeHead(302, { Location: url });
  res.end();
}

function json(res: ServerResponse, data: unknown, status = 200) {
  const body = JSON.stringify(data);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) });
  res.end(body);
}

function setCookie(res: ServerResponse, name: string, value: string, maxAge = 60 * 60 * 24 * 30) {
  const cookie = `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}; Secure`;
  const existing = res.getHeader("Set-Cookie");
  if (existing) {
    res.setHeader("Set-Cookie", Array.isArray(existing) ? [...existing, cookie] : [existing as string, cookie]);
  } else {
    res.setHeader("Set-Cookie", cookie);
  }
}

export function getSessionUserId(req: IncomingMessage): string | null {
  const cookies = req.headers.cookie ?? "";
  const match = cookies.match(/occ_session=([^;]+)/);
  return match?.[1] ?? null;
}

async function createOrGetUser(provider: string, providerId: string, email: string, name: string, avatar: string) {
  const userId = `${provider}-${providerId}`;
  const existing = await db.getUserById(userId);
  if (existing) return userId;

  // Check if a user with this email already exists (different provider, same person)
  const byEmail = await db.getUserByEmail(email);
  if (byEmail) return byEmail.id; // Log them in as the existing user

  const mcpToken = crypto.randomBytes(24).toString("hex");
  await db.upsertUser({ id: userId, email, name, avatar, provider, providerId, mcpToken });
  // No default agent — user must create their first agent explicitly.
  // Creating an agent produces a birth proof (slot 0 on the agent's chain).
  return userId;
}

async function generateAppleClientSecret(): Promise<string | null> {
  if (!APPLE_PRIVATE_KEY || !APPLE_TEAM_ID || !APPLE_KEY_ID || !APPLE_CLIENT_ID) return null;
  try {
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: "ES256", kid: APPLE_KEY_ID })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({
      iss: APPLE_TEAM_ID, iat: now, exp: now + 86400 * 180,
      aud: "https://appleid.apple.com", sub: APPLE_CLIENT_ID,
    })).toString("base64url");
    const signingInput = `${header}.${payload}`;
    const key = crypto.createPrivateKey({ key: APPLE_PRIVATE_KEY, format: "pem" });
    const sig = crypto.sign("sha256", Buffer.from(signingInput), { key, dsaEncoding: "ieee-p1363" });
    return `${signingInput}.${sig.toString("base64url")}`;
  } catch (e) {
    console.error("[auth] Failed to generate Apple client secret:", e);
    return null;
  }
}

export async function handleAuth(req: IncomingMessage, res: ServerResponse, pathname: string) {

  // ── GitHub ──

  if (pathname === "/auth/login/github") {
    if (!GITHUB_CLIENT_ID) return json(res, { error: "GitHub OAuth not configured" }, 500);
    const state = crypto.randomBytes(16).toString("hex");
    setCookie(res, "occ_oauth_state", state, 600);
    const params = new URLSearchParams({
      client_id: GITHUB_CLIENT_ID,
      redirect_uri: `${AUTH_URL}/auth/callback/github`,
      scope: "read:user user:email",
      state,
    });
    return redirect(res, `https://github.com/login/oauth/authorize?${params}`);
  }

  if (pathname === "/auth/callback/github") {
    const url = new URL(req.url ?? "/", "http://localhost");
    const code = url.searchParams.get("code");
    if (!code) return redirect(res, "/?error=no_code");

    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID, client_secret: GITHUB_CLIENT_SECRET,
        code, redirect_uri: `${AUTH_URL}/auth/callback/github`,
      }),
    });
    const tokenData = await tokenRes.json() as { access_token?: string };
    if (!tokenData.access_token) return redirect(res, "/?error=auth_failed");

    const userRes = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${tokenData.access_token}`, Accept: "application/json" },
    });
    const gh = await userRes.json() as { id: number; login: string; name: string; avatar_url: string; email: string };

    let email = gh.email;
    if (!email) {
      const emailsRes = await fetch("https://api.github.com/user/emails", {
        headers: { Authorization: `Bearer ${tokenData.access_token}`, Accept: "application/json" },
      });
      const emails = await emailsRes.json() as { email: string; primary: boolean }[];
      email = emails.find(e => e.primary)?.email ?? emails[0]?.email ?? `${gh.login}@github`;
    }

    const userId = await createOrGetUser("github", String(gh.id), email, gh.name ?? gh.login, gh.avatar_url);
    setCookie(res, "occ_session", userId);
    return redirect(res, "/");
  }

  // ── Google ──

  if (pathname === "/auth/login/google") {
    if (!GOOGLE_CLIENT_ID) return json(res, { error: "Google OAuth not configured" }, 500);
    const state = crypto.randomBytes(16).toString("hex");
    setCookie(res, "occ_oauth_state", state, 600);
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: `${AUTH_URL}/auth/callback/google`,
      response_type: "code",
      scope: "openid email profile",
      state,
      access_type: "offline",
      prompt: "select_account",
    });
    return redirect(res, `https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  }

  if (pathname === "/auth/callback/google") {
    const url = new URL(req.url ?? "/", "http://localhost");
    const code = url.searchParams.get("code");
    if (!code) return redirect(res, "/?error=no_code");

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: `${AUTH_URL}/auth/callback/google`,
        grant_type: "authorization_code",
      }),
    });
    const tokenData = await tokenRes.json() as { access_token?: string };
    if (!tokenData.access_token) return redirect(res, "/?error=auth_failed");

    const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const gUser = await userRes.json() as { id: string; email: string; name: string; picture: string };

    const userId = await createOrGetUser("google", gUser.id, gUser.email, gUser.name, gUser.picture);
    setCookie(res, "occ_session", userId);
    return redirect(res, "/");
  }

  // ── Apple ──

  if (pathname === "/auth/login/apple") {
    if (!APPLE_CLIENT_ID) return json(res, { error: "Apple Sign In not configured" }, 500);
    const state = crypto.randomBytes(16).toString("hex");
    setCookie(res, "occ_oauth_state", state, 600);
    const params = new URLSearchParams({
      client_id: APPLE_CLIENT_ID,
      redirect_uri: `${AUTH_URL}/auth/callback/apple`,
      response_type: "code",
      scope: "name email",
      response_mode: "form_post",
      state,
    });
    return redirect(res, `https://appleid.apple.com/auth/authorize?${params}`);
  }

  if (pathname === "/auth/callback/apple" && req.method === "POST") {
    // Apple sends form_post
    const body = await new Promise<string>((resolve) => {
      let data = "";
      req.on("data", (chunk: Buffer) => { data += chunk.toString(); });
      req.on("end", () => resolve(data));
    });
    const params = new URLSearchParams(body);
    const code = params.get("code");
    const userJson = params.get("user"); // Only sent on first login
    if (!code) return redirect(res, "/?error=no_code");

    // Generate Apple client_secret JWT
    const clientSecret = await generateAppleClientSecret();
    if (!clientSecret) return redirect(res, "/?error=apple_config");

    const tokenRes = await fetch("https://appleid.apple.com/auth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: APPLE_CLIENT_ID,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: `${AUTH_URL}/auth/callback/apple`,
      }),
    });
    const tokenData = await tokenRes.json() as { id_token?: string };
    if (!tokenData.id_token) return redirect(res, "/?error=auth_failed");

    // Decode the JWT payload (base64url, no verification needed — Apple signed it)
    const payload = JSON.parse(Buffer.from(tokenData.id_token.split(".")[1], "base64url").toString());
    const appleId = payload.sub as string;
    const email = (payload.email as string) ?? "";

    // Parse user info (only available on first sign-in)
    let name = email.split("@")[0];
    if (userJson) {
      try {
        const u = JSON.parse(userJson) as { name?: { firstName?: string; lastName?: string } };
        if (u.name) name = [u.name.firstName, u.name.lastName].filter(Boolean).join(" ");
      } catch {}
    }

    const userId = await createOrGetUser("apple", appleId, email, name, "");
    setCookie(res, "occ_session", userId);
    return redirect(res, "/");
  }

  // ── Auth info ──

  if (pathname === "/auth/me") {
    const userId = getSessionUserId(req);
    if (!userId) return json(res, { user: null });
    const user = await db.getUserById(userId);
    if (!user) return json(res, { user: null });
    return json(res, {
      user: { id: user.id, email: user.email, name: user.name, avatar: user.avatar, provider: user.provider },
    });
  }

  if (pathname === "/auth/logout") {
    setCookie(res, "occ_session", "", 0);
    return redirect(res, "/");
  }

  json(res, { error: "Not found" }, 404);
}
