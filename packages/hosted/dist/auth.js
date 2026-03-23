import crypto from "node:crypto";
import { db } from "./db.js";
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID ?? "";
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET ?? "";
const AUTH_URL = process.env.AUTH_URL ?? "https://agent.occ.wtf";
function redirect(res, url) {
    res.writeHead(302, { Location: url });
    res.end();
}
function json(res, data, status = 200) {
    const body = JSON.stringify(data);
    res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) });
    res.end(body);
}
function setCookie(res, name, value, maxAge = 60 * 60 * 24 * 30) {
    const cookie = `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}; Secure`;
    const existing = res.getHeader("Set-Cookie");
    if (existing) {
        res.setHeader("Set-Cookie", Array.isArray(existing) ? [...existing, cookie] : [existing, cookie]);
    }
    else {
        res.setHeader("Set-Cookie", cookie);
    }
}
export function getSessionUserId(req) {
    const cookies = req.headers.cookie ?? "";
    const match = cookies.match(/occ_session=([^;]+)/);
    return match?.[1] ?? null;
}
export async function handleAuth(req, res, pathname) {
    // GET /auth/login/github — redirect to GitHub OAuth
    if (pathname === "/auth/login/github") {
        if (!GITHUB_CLIENT_ID) {
            return json(res, { error: "GitHub OAuth not configured" }, 500);
        }
        const state = crypto.randomBytes(16).toString("hex");
        setCookie(res, "occ_oauth_state", state, 600); // 10 min
        const params = new URLSearchParams({
            client_id: GITHUB_CLIENT_ID,
            redirect_uri: `${AUTH_URL}/auth/callback/github`,
            scope: "read:user user:email",
            state,
        });
        return redirect(res, `https://github.com/login/oauth/authorize?${params}`);
    }
    // GET /auth/callback/github — handle OAuth callback
    if (pathname === "/auth/callback/github") {
        const url = new URL(req.url ?? "/", `http://localhost`);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        if (!code) {
            return redirect(res, "/?error=no_code");
        }
        // Exchange code for access token
        const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
            },
            body: JSON.stringify({
                client_id: GITHUB_CLIENT_ID,
                client_secret: GITHUB_CLIENT_SECRET,
                code,
                redirect_uri: `${AUTH_URL}/auth/callback/github`,
            }),
        });
        const tokenData = await tokenRes.json();
        if (!tokenData.access_token) {
            console.error("GitHub OAuth error:", tokenData);
            return redirect(res, "/?error=auth_failed");
        }
        // Get user info
        const userRes = await fetch("https://api.github.com/user", {
            headers: {
                Authorization: `Bearer ${tokenData.access_token}`,
                Accept: "application/json",
            },
        });
        const githubUser = await userRes.json();
        // Get email if not public
        let email = githubUser.email;
        if (!email) {
            const emailsRes = await fetch("https://api.github.com/user/emails", {
                headers: {
                    Authorization: `Bearer ${tokenData.access_token}`,
                    Accept: "application/json",
                },
            });
            const emails = await emailsRes.json();
            email = emails.find((e) => e.primary)?.email ?? emails[0]?.email ?? `${githubUser.login}@github`;
        }
        // Create or update user
        const userId = `github-${githubUser.id}`;
        const mcpToken = crypto.randomBytes(24).toString("hex");
        // Check if user exists
        const existing = await db.getUserById(userId);
        if (!existing) {
            await db.upsertUser({
                id: userId,
                email,
                name: githubUser.name ?? githubUser.login,
                avatar: githubUser.avatar_url,
                provider: "github",
                providerId: String(githubUser.id),
                mcpToken,
            });
        }
        // Set session cookie
        setCookie(res, "occ_session", userId);
        // Redirect to dashboard
        return redirect(res, "/");
    }
    // GET /auth/me — get current user
    if (pathname === "/auth/me") {
        const userId = getSessionUserId(req);
        if (!userId) {
            return json(res, { user: null });
        }
        const user = await db.getUserById(userId);
        if (!user) {
            return json(res, { user: null });
        }
        return json(res, {
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                avatar: user.avatar,
                provider: user.provider,
            },
        });
    }
    // GET /auth/logout
    if (pathname === "/auth/logout") {
        setCookie(res, "occ_session", "", 0);
        return redirect(res, "/");
    }
    json(res, { error: "Not found" }, 404);
}
//# sourceMappingURL=auth.js.map