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
      console.log("[POSTER_EDGE] fail-safe: non-POST method rejected", {
        method: req.method,
      })
      return jsonResponse(405, {
        success: false,
        error: "Method not allowed. Use POST.",
      })
    }

    let body: { story_id?: unknown; media_url?: unknown }
    try {
      body = await req.json()
    } catch {
      console.log("[POSTER_EDGE] fail-safe: invalid JSON body")
      return jsonResponse(400, {
        success: false,
        error: "Invalid JSON body.",
      })
    }

    storyId =
      typeof body.story_id === "string" ? body.story_id.trim() : ""
    const mediaUrl =
      typeof body.media_url === "string" ? body.media_url.trim() : ""
    const mediaPreview = mediaUrl.slice(0, 120)

    console.log("[POSTER_EDGE] request start", {
      story_id: storyId || null,
      media_url_present: mediaUrl.length > 0,
      media_url_preview: mediaPreview,
    })

    if (!storyId || !mediaUrl) {
      console.log("[POSTER_EDGE] fail-safe: missing required fields", {
        story_id_present: storyId.length > 0,
        media_url_present: mediaUrl.length > 0,
      })
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
    let workerValidationReason = "worker call not attempted"

    try {
      const workerUrl = resolvePosterWorkerUrl()
      const workerEnvRaw = Deno.env.get("POSTER_WORKER_URL")
      console.log("[POSTER_EDGE] worker request", {
        poster_worker_url_env_present:
          typeof workerEnvRaw === "string" && workerEnvRaw.trim().length > 0,
        worker_endpoint: workerUrl,
        story_id: storyId,
      })
      const workerRes = await fetch(workerUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ story_id: storyId, media_url: mediaUrl }),
        signal: AbortSignal.timeout(300_000),
      })

      const text = await workerRes.text()
      let parsed: unknown
      let parsedJson = false
      try {
        parsed = JSON.parse(text)
        parsedJson = true
      } catch {
        parsed = undefined
        parsedJson = false
        workerValidationReason = "worker response body is not valid JSON"
        console.log("[POSTER_EDGE] worker response parse failed", {
          status: workerRes.status,
          ok: workerRes.ok,
          body_preview: text.slice(0, 500),
        })
      }
      if (parsedJson) {
        console.log("[POSTER_EDGE] worker response", {
          status: workerRes.status,
          ok: workerRes.ok,
          parseable_json: true,
          parsed_body: parsed,
        })
      }

      if (parsed && typeof parsed === "object" && parsed !== null) {
        const o = parsed as Record<string, unknown>
        const workerSuccess = o.success
        const workerPosterUrl = o.poster_url
        console.log("[POSTER_EDGE] worker validation inputs", {
          worker_success: workerSuccess,
          worker_poster_url: workerPosterUrl,
        })
        if (
          o.success === true &&
          typeof o.poster_url === "string" &&
          o.poster_url.trim() !== ""
        ) {
          posterUrlToSave = o.poster_url.trim()
          workerValidationReason = "accepted worker poster_url"
        } else if (o.success !== true) {
          workerValidationReason = "worker success is not true"
        } else if (typeof o.poster_url !== "string") {
          workerValidationReason = "worker poster_url is not a string"
        } else if (o.poster_url.trim() === "") {
          workerValidationReason = "worker poster_url is empty after trim"
        }
      } else if (parsedJson) {
        workerValidationReason = "worker JSON is not an object"
      }
    } catch {
      // Worker failure, timeout, or invalid JSON: silent, no DB update
      workerValidationReason = "worker request threw (network/timeout/etc)"
      console.log("[POSTER_EDGE] fail-safe: worker request error; skipping DB update")
    }

    console.log("[POSTER_EDGE] worker validation result", {
      story_id: storyId,
      poster_url_to_save: posterUrlToSave,
      reason: workerValidationReason,
    })

    if (!posterUrlToSave) {
      console.log("[POSTER_EDGE] db update skipped", {
        story_id: storyId,
        reason: workerValidationReason,
      })
      return jsonResponse(200, {
        success: true,
        story_id: storyId,
      })
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    console.log("[POSTER_EDGE] supabase env readiness", {
      supabase_url_present: Boolean(supabaseUrl),
      supabase_service_role_key_present: Boolean(serviceRoleKey),
    })

    if (!supabaseUrl || !serviceRoleKey) {
      console.error(
        "generate-story-poster: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing; skipping DB update",
      )
      console.log("[POSTER_EDGE] db update skipped", {
        story_id: storyId,
        reason: "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing",
      })
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
    console.log("[POSTER_EDGE] db update attempt", {
      story_id: storyId,
      poster_url: posterUrlToSave,
      endpoint_path: "/rest/v1/stories?id=eq.<story_id>&select=id,poster_url",
      update_url: updateUrl,
    })

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
    console.log("[POSTER_EDGE] db update response", {
      status: updateRes.status,
      ok: updateRes.ok,
      parsed_body: updateResult,
      row_array_non_empty:
        Array.isArray(updateResult) && updateResult.length > 0,
    })

    if (!updateRes.ok) {
      console.log("[POSTER_EDGE] db update failed", {
        story_id: storyId,
        reason: "update response not ok",
      })
      return jsonResponse(200, {
        success: true,
        story_id: storyId,
      })
    }

    if (!Array.isArray(updateResult) || updateResult.length === 0) {
      console.log("[POSTER_EDGE] db update skipped", {
        story_id: storyId,
        reason: "update returned empty/non-array row representation",
      })
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
    console.log("[POSTER_EDGE] fail-safe: outer catch returning success", {
      story_id: storyId || null,
    })
    return jsonResponse(200, {
      success: true,
      ...(storyId ? { story_id: storyId } : {}),
    })
  }
})
