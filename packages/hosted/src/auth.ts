import type { IncomingMessage, ServerResponse } from "node:http";
import crypto from "node:crypto";
import { db } from "./db.js";

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID ?? "";
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET ?? "";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? "";
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
  if (!existing) {
    const mcpToken = crypto.randomBytes(24).toString("hex");
    await db.upsertUser({ id: userId, email, name, avatar, provider, providerId, mcpToken });
    // Create a default agent for the user
    await db.upsertAgent(userId, { id: "default", name: "Default" });
  }
  return userId;
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
