import "@supabase/functions-js/edge-runtime.d.ts"

const JSON_HEADERS = { "Content-Type": "application/json" }

const jsonResponse = (status: number, payload: Record<string, unknown>) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: JSON_HEADERS,
  })

function resolvePosterWorkerUrl(): string {
  const raw = Deno.env.get("POSTER_WORKER_URL")?.trim()
  const base = raw && raw.length > 0 ? raw : "http://localhost:3000"
  return `${base.replace(/\/$/, "")}/generate-poster`
}

Deno.serve(async (req) => {
  let storyId = ""
  try {
    if (req.method !== "POST") {
      return jsonResponse(405, {
        success: false,
        error: "Method not allowed. Use POST.",
      })
    }

    let body: { story_id?: unknown; media_url?: unknown }
    try {
      body = await req.json()
    } catch {
      return jsonResponse(400, {
        success: false,
        error: "Invalid JSON body.",
      })
    }

    storyId =
      typeof body.story_id === "string" ? body.story_id.trim() : ""
    const mediaUrl =
      typeof body.media_url === "string" ? body.media_url.trim() : ""

    if (!storyId || !mediaUrl) {
      return jsonResponse(400, {
        success: false,
        error: "Missing required fields: story_id and media_url.",
      })
    }

    console.log("generate-story-poster:start", {
      story_id: storyId,
      media_url: mediaUrl,
    })

    let posterUrlToSave: string | null = null

    try {
      const workerUrl = resolvePosterWorkerUrl()
      const workerRes = await fetch(workerUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ story_id: storyId, media_url: mediaUrl }),
        signal: AbortSignal.timeout(300_000),
      })

      const text = await workerRes.text()
      let parsed: unknown
      try {
        parsed = JSON.parse(text)
      } catch {
        parsed = undefined
      }

      if (parsed && typeof parsed === "object" && parsed !== null) {
        const o = parsed as Record<string, unknown>
        if (
          o.success === true &&
          typeof o.poster_url === "string" &&
          o.poster_url.trim() !== ""
        ) {
          posterUrlToSave = o.poster_url.trim()
        }
      }
    } catch {
      // Worker failure, timeout, or invalid JSON: silent, no DB update
    }

    if (!posterUrlToSave) {
      return jsonResponse(200, {
        success: true,
        story_id: storyId,
      })
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

    if (!supabaseUrl || !serviceRoleKey) {
      console.error(
        "generate-story-poster: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing; skipping DB update",
      )
      return jsonResponse(200, {
        success: true,
        story_id: storyId,
      })
    }

    console.log("generate-story-poster:before-db-update", {
      story_id: storyId,
      poster_url: posterUrlToSave,
    })

    const updateUrl =
      `${supabaseUrl}/rest/v1/stories` +
      `?id=eq.${encodeURIComponent(storyId)}&select=id,poster_url`

    const updateRes = await fetch(updateUrl, {
      method: "PATCH",
      headers: {
        ...JSON_HEADERS,
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Prefer: "return=representation",
      },
      body: JSON.stringify({ poster_url: posterUrlToSave }),
    })

    const updateResult: unknown = await updateRes.json().catch(() => null)

    if (!updateRes.ok) {
      return jsonResponse(200, {
        success: true,
        story_id: storyId,
      })
    }

    if (!Array.isArray(updateResult) || updateResult.length === 0) {
      return jsonResponse(200, {
        success: true,
        story_id: storyId,
      })
    }

    console.log("generate-story-poster:after-db-update-success", {
      story_id: storyId,
      poster_url: posterUrlToSave,
    })

    return jsonResponse(200, {
      success: true,
      story_id: storyId,
      posterUrl: posterUrlToSave,
    })
  } catch (error) {
    console.error("generate-story-poster:error", error)
    return jsonResponse(200, {
      success: true,
      ...(storyId ? { story_id: storyId } : {}),
    })
  }
})
