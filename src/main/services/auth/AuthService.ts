/**
 * OAuth 认证服务
 * 支持 Google 和 GitHub OAuth 登录
 */

import crypto from "crypto";
import { BrowserWindow } from "electron";
import type { AuthProvider, AuthTokens, AuthUser } from "../../ipc/types";
import { storeManager } from "../../store/StoreManager";
import { logger } from "../../utils/logger";

const REDIRECT_URI = "https://app.nexo-ai.top/auth/callback";

function base64URLEncode(buffer: Buffer): string {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function sha256(buffer: string): Buffer {
  return crypto.createHash("sha256").update(buffer).digest();
}

export class AuthService {
  private authWindow: BrowserWindow | null = null;

  async login(provider: AuthProvider): Promise<AuthUser> {
    if (provider === "google") {
      return this.loginWithGoogle();
    }
    return this.loginWithGitHub();
  }

  async logout(): Promise<void> {
    storeManager.setConfig("authUser", undefined as any);
    storeManager.setConfig("authTokens", undefined as any);
    logger.info("User logged out");
  }

  getUser(): AuthUser | null {
    return storeManager.getConfig("authUser") || null;
  }

  private async loginWithGoogle(): Promise<AuthUser> {
    const clientId = storeManager.getConfig("googleClientId");
    if (!clientId) {
      throw new Error(
        "Google Client ID not configured. Please set it in Settings → API Keys.",
      );
    }

    // PKCE flow
    const codeVerifier = base64URLEncode(crypto.randomBytes(32));
    const codeChallenge = base64URLEncode(sha256(codeVerifier));
    const state = crypto.randomBytes(16).toString("hex");

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      response_type: "code",
      scope: "openid email profile",
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      access_type: "offline",
      prompt: "consent",
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    const code = await this.openAuthWindow(authUrl, state);

    // Exchange code for tokens
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        code,
        code_verifier: codeVerifier,
        grant_type: "authorization_code",
        redirect_uri: REDIRECT_URI,
      }),
    });

    if (!tokenResponse.ok) {
      const err = await tokenResponse.text();
      logger.error("Google token exchange failed", new Error(err));
      throw new Error("Failed to exchange Google authorization code");
    }

    const tokens = (await tokenResponse.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };

    // Fetch user info
    const userResponse = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      },
    );

    if (!userResponse.ok) {
      throw new Error("Failed to fetch Google user info");
    }

    const profile = (await userResponse.json()) as {
      id: string;
      name: string;
      email?: string;
      picture?: string;
    };

    const user: AuthUser = {
      id: `google_${profile.id}`,
      name: profile.name,
      email: profile.email,
      avatar: profile.picture,
      provider: "google",
    };

    const authTokens: AuthTokens = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: tokens.expires_in
        ? Date.now() + tokens.expires_in * 1000
        : undefined,
    };

    storeManager.setConfig("authUser", user);
    storeManager.setConfig("authTokens", authTokens);
    logger.info(`Google OAuth login successful: ${user.name}`);

    return user;
  }

  private async loginWithGitHub(): Promise<AuthUser> {
    const clientId = storeManager.getConfig("githubClientId");
    const clientSecret = storeManager.getConfig("githubClientSecret");
    if (!clientId || !clientSecret) {
      throw new Error(
        "GitHub OAuth credentials not configured. Please set Client ID and Client Secret in Settings → API Keys.",
      );
    }

    const state = crypto.randomBytes(16).toString("hex");

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      scope: "read:user user:email",
      state,
    });

    const authUrl = `https://github.com/login/oauth/authorize?${params.toString()}`;
    const code = await this.openAuthWindow(authUrl, state);

    // Exchange code for tokens
    const tokenResponse = await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: REDIRECT_URI,
        }),
      },
    );

    if (!tokenResponse.ok) {
      const err = await tokenResponse.text();
      logger.error("GitHub token exchange failed", new Error(err));
      throw new Error("Failed to exchange GitHub authorization code");
    }

    const tokens = (await tokenResponse.json()) as {
      access_token: string;
      error?: string;
      error_description?: string;
    };

    if (tokens.error) {
      throw new Error(
        tokens.error_description || `GitHub OAuth error: ${tokens.error}`,
      );
    }

    // Fetch user info
    const userResponse = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        Accept: "application/vnd.github.v3+json",
      },
    });

    if (!userResponse.ok) {
      throw new Error("Failed to fetch GitHub user info");
    }

    const profile = (await userResponse.json()) as {
      id: number;
      login: string;
      name?: string;
      email?: string;
      avatar_url?: string;
    };

    // If email is not public, try to get it from emails API
    let email = profile.email;
    if (!email) {
      try {
        const emailsResponse = await fetch(
          "https://api.github.com/user/emails",
          {
            headers: {
              Authorization: `Bearer ${tokens.access_token}`,
              Accept: "application/vnd.github.v3+json",
            },
          },
        );
        if (emailsResponse.ok) {
          const emails = (await emailsResponse.json()) as Array<{
            email: string;
            primary: boolean;
          }>;
          const primary = emails.find((e) => e.primary);
          email = primary?.email || emails[0]?.email;
        }
      } catch {
        // Ignore email fetch failure
      }
    }

    const user: AuthUser = {
      id: `github_${profile.id}`,
      name: profile.name || profile.login,
      email,
      avatar: profile.avatar_url,
      provider: "github",
    };

    const authTokens: AuthTokens = {
      accessToken: tokens.access_token,
    };

    storeManager.setConfig("authUser", user);
    storeManager.setConfig("authTokens", authTokens);
    logger.info(`GitHub OAuth login successful: ${user.name}`);

    return user;
  }

  private openAuthWindow(url: string, expectedState: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.closeAuthWindow();

      this.authWindow = new BrowserWindow({
        width: 600,
        height: 700,
        show: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        },
      });

      this.authWindow.setMenuBarVisibility(false);

      const handleRedirect = (redirectUrl: string): boolean => {
        if (!redirectUrl.startsWith(REDIRECT_URI)) {
          return false;
        }

        try {
          const parsed = new URL(redirectUrl);
          const code = parsed.searchParams.get("code");
          const state = parsed.searchParams.get("state");
          const error = parsed.searchParams.get("error");

          if (error) {
            reject(
              new Error(
                parsed.searchParams.get("error_description") ||
                `OAuth error: ${error}`,
              ),
            );
            this.closeAuthWindow();
            return true;
          }

          if (state !== expectedState) {
            reject(new Error("OAuth state mismatch — possible CSRF attack"));
            this.closeAuthWindow();
            return true;
          }

          if (!code) {
            reject(new Error("No authorization code received"));
            this.closeAuthWindow();
            return true;
          }

          resolve(code);
          this.closeAuthWindow();
          return true;
        } catch (err) {
          reject(err);
          this.closeAuthWindow();
          return true;
        }
      };

      // Intercept navigation to the redirect URI
      this.authWindow.webContents.on("will-redirect", (_event, url) => {
        handleRedirect(url);
      });

      this.authWindow.webContents.on("will-navigate", (_event, url) => {
        handleRedirect(url);
      });

      // Also intercept via webRequest for cases where will-redirect doesn't fire
      this.authWindow.webContents.session.webRequest.onBeforeRequest(
        { urls: [`${REDIRECT_URI}*`] },
        (details, callback) => {
          if (handleRedirect(details.url)) {
            callback({ cancel: true });
          } else {
            callback({});
          }
        },
      );

      this.authWindow.on("closed", () => {
        this.authWindow = null;
        // If the window was closed without completing auth, reject
        reject(new Error("Authentication window was closed"));
      });

      this.authWindow.loadURL(url);
    });
  }

  private closeAuthWindow(): void {
    if (this.authWindow && !this.authWindow.isDestroyed()) {
      this.authWindow.removeAllListeners("closed");
      this.authWindow.close();
      this.authWindow = null;
    }
  }
}

export const authService = new AuthService();
