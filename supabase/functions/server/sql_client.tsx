import { createClient } from "jsr:@supabase/supabase-js@2.49.8";

/* ═════════════════════════════════════════════════════════════════════════════
   sql_client.tsx — SQL data layer for Supabase Edge Functions (Deno)
   Uses the existing Supabase JS client with service_role key so Edge
   Functions bypass RLS (intentional — RLS is enforced by the anon client
   on the frontend, not by the trusted backend).

   NOTE: This creates a POSTgREST HTTP client, not a raw TCP Postgres
   driver.  It is idiomatic for Supabase and requires no extra imports.
   For complex JOINs / CTEs / aggregations, use .rpc() with Postgres
   functions, or chain .select() with embedded foreign-table references.
   ═════════════════════════════════════════════════════════════════════════════ */

let _db: ReturnType<typeof createClient> | null = null;

/** Lazy singleton Supabase admin client (service_role). */
export function getDbClient() {
  if (!_db) {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing");
    _db = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return _db;
}

/** Reset singleton (useful in tests or after config changes). */
export function resetDbClient() {
  _db = null;
}

/* ── Generic CRUD helpers ──────────────────────────────────────────────────── */

/** SELECT * FROM table WHERE … */
export async function sqlQuery<T = any>(
  table: string,
  select = "*",
  filters?: Record<string, any>,
): Promise<T[]> {
  const supabase = getDbClient();
  let q = supabase.from(table).select(select);
  if (filters) {
    for (const [k, v] of Object.entries(filters)) {
      q = q.eq(k, v);
    }
  }
  const { data, error } = await q;
  if (error) throw new Error(`sqlQuery error: ${error.message}`);
  return (data ?? []) as T[];
}

/** SELECT * FROM table WHERE id = $1 */
export async function sqlQueryOne<T = any>(
  table: string,
  id: string,
  select = "*",
): Promise<T | null> {
  const rows = await sqlQuery<T>(table, select, { id });
  return rows[0] ?? null;
}

/** INSERT INTO table … RETURNING * */
export async function sqlInsert<T = any>(
  table: string,
  payload: Record<string, any>,
): Promise<T> {
  const supabase = getDbClient();
  const { data, error } = await supabase.from(table).insert(payload).select().single();
  if (error) throw new Error(`sqlInsert error: ${error.message}`);
  if (!data) throw new Error("sqlInsert: no data returned");
  return data as T;
}

/** UPDATE table SET … WHERE id = $id RETURNING * */
export async function sqlUpdate<T = any>(
  table: string,
  id: string,
  payload: Record<string, any>,
): Promise<T> {
  const supabase = getDbClient();
  const { data, error } = await supabase.from(table).update(payload).eq("id", id).select().single();
  if (error) throw new Error(`sqlUpdate error: ${error.message}`);
  if (!data) throw new Error("sqlUpdate: no data returned");
  return data as T;
}

/** DELETE FROM table WHERE id = $id */
export async function sqlDelete(table: string, id: string): Promise<void> {
  const supabase = getDbClient();
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) throw new Error(`sqlDelete error: ${error.message}`);
}

/* ── Workspace-scoped helpers (shorthand) ──────────────────────────────────── */

/** SELECT * FROM table WHERE workspace_id = $wsId AND … */
export async function sqlQueryByWorkspace<T = any>(
  table: string,
  workspaceId: string,
  select = "*",
  extraFilters?: Record<string, any>,
): Promise<T[]> {
  const supabase = getDbClient();
  let q = supabase.from(table).select(select).eq("workspace_id", workspaceId);
  if (extraFilters) {
    for (const [k, v] of Object.entries(extraFilters)) {
      q = q.eq(k, v);
    }
  }
  const { data, error } = await q;
  if (error) throw new Error(`sqlQueryByWorkspace error: ${error.message}`);
  return (data ?? []) as T[];
}

/** Insert into table with workspace_id pre-filled. */
export async function sqlInsertInWorkspace<T = any>(
  table: string,
  workspaceId: string,
  payload: Record<string, any>,
): Promise<T> {
  return sqlInsert<T>(table, { ...payload, workspace_id: workspaceId });
}

/* ── Complex query helpers (embedded joins via PostgREST) ──────────────────── */

/**
 * SELECT tasks.*, projects(name) FROM tasks JOIN projects …
 * Usage: sqlQueryJoin('tasks', { project_id: 'eq.123' }, '*, projects(name)')
 */
export async function sqlQueryJoin<T = any>(
  table: string,
  select = "*",
  filters?: Record<string, any>,
): Promise<T[]> {
  const supabase = getDbClient();
  let q = supabase.from(table).select(select);
  if (filters) {
    for (const [k, v] of Object.entries(filters)) {
      q = q.eq(k, v);
    }
  }
  const { data, error } = await q;
  if (error) throw new Error(`sqlQueryJoin error: ${error.message}`);
  return (data ?? []) as T[];
}

/* ── Single-row helpers for JSONB workspace-scoped tables ──────────────────── */

/** Query exactly one row by workspace_id. Returns null if not found (no error). */
export async function sqlQueryFirst(
  table: string,
  workspaceId: string,
  select = "*",
  extraFilters?: Record<string, any>,
) {
  const supabase = getDbClient();
  let q = supabase.from(table).select(select).eq("workspace_id", workspaceId);
  if (extraFilters) {
    for (const [k, v] of Object.entries(extraFilters)) {
      q = q.eq(k, v);
    }
  }
  const { data, error } = await q.limit(1).maybeSingle();
  if (error) throw new Error(`sqlQueryFirst error: ${error.message}`);
  return data;
}

/** Upsert: insert if conflict column doesn't exist, update otherwise. */
export async function sqlUpsert(
  table: string,
  payload: Record<string, any>,
  conflictColumn: string,
) {
  const { data, error } = await getDbClient()
    .from(table)
    .upsert(payload, { onConflict: conflictColumn })
    .select()
    .single();
  if (error) throw new Error(`sqlUpsert error: ${error.message}`);
  return data;
}
