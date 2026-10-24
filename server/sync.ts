import { spawn } from "node:child_process";
import { readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { SyncStatus } from "../shared/types.ts";
import { APP_DIR, clearPendingDeletions, syncSnapshot, type SyncEntry } from "./db.ts";

const CONFIG_PATH = join(APP_DIR, "supabase.json");
const SESSION_PATH = join(APP_DIR, "supabase.session");

interface Session {
  url: string;
  anon_key: string;
  access_token?: string;
  refresh_token: string;
  user_id: string;
}

// Windows DPAPI (current user), the same protection the original app used for the refresh token.
function dpapi(op: "Protect" | "Unprotect", data: Buffer): Promise<Buffer> {
  const script =
    "Add-Type -AssemblyName System.Security;" +
    "$in=[Convert]::FromBase64String([Console]::In.ReadToEnd().Trim());" +
    `$out=[System.Security.Cryptography.ProtectedData]::${op}($in,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser);` +
    "[Console]::Out.Write([Convert]::ToBase64String($out))";
  return new Promise((resolve, reject) => {
    const ps = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { windowsHide: true });
    let out = "";
    let err = "";
    ps.stdout.on("data", (d) => (out += d));
    ps.stderr.on("data", (d) => (err += d));
    ps.on("error", reject);
    ps.on("close", (code) =>
      code === 0 ? resolve(Buffer.from(out.trim(), "base64")) : reject(new Error(err.trim() || `DPAPI ${op} failed`)),
    );
    ps.stdin.end(data.toString("base64"));
  });
}

async function saveSession(s: Session): Promise<void> {
  if (!s.refresh_token) throw new Error("Supabase did not provide a refresh token; persistent sign-in is unavailable.");
  const { url, anon_key, refresh_token, user_id } = s;
  const protectedData = await dpapi("Protect", Buffer.from(JSON.stringify({ url, anon_key, refresh_token, user_id })));
  await writeFile(SESSION_PATH + ".tmp", protectedData);
  await rename(SESSION_PATH + ".tmp", SESSION_PATH);
}

async function loadSession(): Promise<Session | null> {
  let raw: Buffer;
  try {
    raw = await readFile(SESSION_PATH);
  } catch {
    return null;
  }
  const s = JSON.parse((await dpapi("Unprotect", raw)).toString("utf8"));
  if (!s?.url || !s.anon_key || !s.refresh_token || !s.user_id) throw new Error("The saved sign-in session is incomplete.");
  return s;
}

async function readConfig(): Promise<{ url?: string; anon_key?: string }> {
  try {
    return JSON.parse(await readFile(CONFIG_PATH, "utf8"));
  } catch {
    return {};
  }
}

async function authToken(url: string, anonKey: string, grant: "password" | "refresh_token", body: object) {
  const res = await fetch(`${url}/auth/v1/token?grant_type=${grant}`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(
      grant === "refresh_token"
        ? `Supabase session expired; sign in again (${res.status}): ${detail}`
        : `Sign-in failed (${res.status}): ${detail}`,
    );
  }
  return res.json() as Promise<{ access_token: string; refresh_token?: string; user?: { id?: string } }>;
}

async function refresh(s: Session): Promise<void> {
  const auth = await authToken(s.url, s.anon_key, "refresh_token", { refresh_token: s.refresh_token });
  s.access_token = auth.access_token;
  s.refresh_token = auth.refresh_token ?? s.refresh_token;
  s.user_id = auth.user?.id ?? s.user_id;
  await saveSession(s);
}

async function supabaseRequest(s: Session, method: string, path: string, body?: unknown, prefer?: string): Promise<void> {
  const send = () =>
    fetch(s.url + path, {
      method,
      headers: {
        apikey: s.anon_key,
        Authorization: `Bearer ${s.access_token}`,
        "Content-Type": "application/json",
        ...(prefer ? { Prefer: prefer } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(25_000),
    });
  let res = await send();
  if (res.status === 401) {
    await refresh(s);
    res = await send();
  }
  if (!res.ok) throw new Error(`Supabase request failed (${res.status}): ${await res.text()}`);
}

async function pushEntries(s: Session, entries: SyncEntry[]): Promise<void> {
  for (let i = 0; i < entries.length; i += 500) {
    const batch = entries.slice(i, i + 500).map((e) => ({ user_id: s.user_id, ...e }));
    await supabaseRequest(
      s,
      "POST",
      "/rest/v1/nutrition_entries?on_conflict=sync_id",
      batch,
      "resolution=merge-duplicates,return=minimal",
    );
  }
}

async function deleteRemote(s: Session, syncIds: string[]): Promise<void> {
  if (!syncIds.length) return;
  const qs = new URLSearchParams({ sync_id: `in.(${syncIds.join(",")})`, user_id: `eq.${s.user_id}` });
  await supabaseRequest(s, "DELETE", `/rest/v1/nutrition_entries?${qs}`);
}

// ---- State machine ------------------------------------------------------------------------

let session: Session | null = null;
let busy = false;
let pending = false;
let message = "Website sync is not connected.";
let lastError: string | null = null;
const listeners = new Set<(s: SyncStatus) => void>();
const idleWaiters: (() => void)[] = [];

export async function getSyncStatus(): Promise<SyncStatus> {
  const config = await readConfig();
  return {
    connected: !!session?.access_token,
    busy,
    message,
    error: lastError,
    savedUrl: config.url ?? "",
    savedAnonKey: config.anon_key ?? "",
  };
}

export function onSyncStatus(fn: (s: SyncStatus) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

async function emit(): Promise<void> {
  const status = await getSyncStatus();
  for (const fn of listeners) fn(status);
}

export function isSyncBusy(): boolean {
  return busy;
}

export function whenSyncIdle(): Promise<void> {
  return busy ? new Promise((r) => idleWaiters.push(r)) : Promise.resolve();
}

/** Runs one sync pass. `prepare` signs in or refreshes and returns the session to use. */
async function run(startMessage: string, prepare: () => Promise<Session>): Promise<void> {
  busy = true;
  lastError = null;
  message = startMessage;
  void emit();
  const { entries, deletions } = syncSnapshot();
  try {
    const s = await prepare();
    session = s;
    await pushEntries(s, entries);
    await deleteRemote(s, deletions);
    await saveSession(s);
    clearPendingDeletions(deletions);
    message = `Website synced: ${entries.length} food entries.`;
  } catch (e) {
    lastError = e instanceof Error ? e.message : String(e);
    message = "Website sync failed; local history is unchanged.";
  } finally {
    busy = false;
  }
  const again = pending && !!session;
  pending = false;
  if (again) {
    void requestSync();
    return;
  }
  void emit();
  idleWaiters.splice(0).forEach((r) => r());
}

/** Sync after a local change; does nothing until signed in. */
export async function requestSync(): Promise<void> {
  if (busy) {
    pending = true;
    return;
  }
  if (!session) return;
  const s = session;
  await run("Syncing history to website…", async () => s);
}

export async function connect(url: string, anonKey: string, email: string, password: string): Promise<void> {
  if (busy) throw new Error("A sync is already running.");
  url = url.trim().replace(/\/+$/, "");
  await writeFile(CONFIG_PATH, JSON.stringify({ url, anon_key: anonKey }, null, 2), "utf8");
  await run("Signing in and syncing history…", async () => {
    const auth = await authToken(url, anonKey, "password", { email, password });
    if (!auth.user?.id) throw new Error("Supabase did not return a user id.");
    return {
      url,
      anon_key: anonKey,
      access_token: auth.access_token,
      refresh_token: auth.refresh_token ?? "",
      user_id: auth.user.id,
    };
  });
}

export async function restoreSavedSession(): Promise<void> {
  let saved: Session | null;
  try {
    saved = await loadSession();
  } catch (e) {
    lastError = `The saved session could not be read securely: ${e instanceof Error ? e.message : e}`;
    message = "Saved website sign-in could not be restored; connect again.";
    void emit();
    return;
  }
  if (!saved) return;
  const s = saved;
  await run("Restoring website sign-in and syncing history…", async () => {
    await refresh(s);
    return s;
  });
}
