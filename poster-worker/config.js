const { createClient } = require("@supabase/supabase-js");

/**
 * Reads Supabase Storage env vars. Returns { ok: false, missing: string[] } if any are absent.
 */
function loadSupabaseEnv() {
  const url = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const posterBucket = process.env.SUPABASE_POSTER_BUCKET?.trim();

  const missing = [];
  if (!url) missing.push("SUPABASE_URL");
  if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!posterBucket) missing.push("SUPABASE_POSTER_BUCKET");

  if (missing.length > 0) {
    return { ok: false, missing };
  }

  return {
    ok: true,
    url,
    serviceRoleKey,
    posterBucket,
  };
}

function createSupabaseServiceClient(env) {
  return createClient(env.url, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

module.exports = {
  loadSupabaseEnv,
  createSupabaseServiceClient,
};
