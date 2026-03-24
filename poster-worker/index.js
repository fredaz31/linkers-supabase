console.log("🚨🚨🚨 RAILWAY ENTRY FILE EXECUTED 🚨🚨🚨");
require("dotenv").config();

const path = require("path");
const fs = require("fs");
const express = require("express");
const axios = require("axios");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const { loadSupabaseEnv, createSupabaseServiceClient } = require("./config");

const RAILWAY_POSTER_AUDIT_MARKER = "RAILWAY_POSTER_AUDIT_MARKER_V1_2026_03_24";

const PORT = 3000;
const WORK_DIR = __dirname;
const INPUT_FILE = path.join(WORK_DIR, "input.mp4");
const POSTER_FILE = path.join(WORK_DIR, "poster.jpg");

if (!ffmpegPath) {
  console.error("ffmpeg-static did not resolve a binary path.");
  process.exit(1);
}
ffmpeg.setFfmpegPath(ffmpegPath);

console.log(
  `[${RAILWAY_POSTER_AUDIT_MARKER}] RAILWAY_WORKER_STARTUP`,
  JSON.stringify({
    marker: RAILWAY_POSTER_AUDIT_MARKER,
    pid: typeof process.pid === "number" ? process.pid : null,
    cwd: process.cwd(),
    entryFileAbsolute: path.resolve(__filename),
    SUPABASE_URL: Boolean(process.env.SUPABASE_URL?.trim()),
    SUPABASE_POSTER_BUCKET: Boolean(process.env.SUPABASE_POSTER_BUCKET?.trim()),
    SUPABASE_SERVICE_ROLE_KEY: Boolean(
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
    ),
  }),
);

const app = express();
app.use(express.json({ limit: "2mb" }));

/** @param {import('express').Request} [req] */
function sendJson(res, status, payload, req) {
  console.log(
    `[${RAILWAY_POSTER_AUDIT_MARKER}] BEFORE_JSON_RESPONSE`,
    JSON.stringify({
      marker: RAILWAY_POSTER_AUDIT_MARKER,
      pid: typeof process.pid === "number" ? process.pid : null,
      cwd: process.cwd(),
      entryFileAbsolute: path.resolve(__filename),
      SUPABASE_URL: Boolean(process.env.SUPABASE_URL?.trim()),
      SUPABASE_POSTER_BUCKET: Boolean(process.env.SUPABASE_POSTER_BUCKET?.trim()),
      SUPABASE_SERVICE_ROLE_KEY: Boolean(
        process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
      ),
      requestMethod: req?.method ?? null,
      requestUrl: req?.originalUrl ?? req?.url ?? null,
      responseHttpStatus: status,
    }),
  );
  console.log("[AUDIT] final JSON response:", JSON.stringify({ status, body: payload }));
  return res.status(status).json(payload);
}

function extractPosterFrame() {
  return new Promise((resolve, reject) => {
    const stderrLineLog = [];

    console.log(
      "[AUDIT] ffmpeg input mode: video is downloaded to a local file first; ffmpeg is NOT given the remote media_url as input — local input path:",
      INPUT_FILE,
    );
    console.log("[AUDIT] exact temporary local input path:", INPUT_FILE);
    console.log("[AUDIT] exact temporary local output path:", POSTER_FILE);

    const ffCommand = ffmpeg(INPUT_FILE)
      .inputOptions(["-ss", "1"])
      .outputOptions(["-vframes", "1", "-q:v", "2"])
      .output(POSTER_FILE);

    try {
      if (typeof ffCommand._getArguments === "function") {
        const argsArr = ffCommand._getArguments();
        console.log(
          "[AUDIT] ffmpeg command arguments array (before execution, fluent-ffmpeg _getArguments):",
          JSON.stringify(argsArr),
        );
      }
    } catch (e) {
      console.log("[AUDIT] ffmpeg _getArguments failed:", e instanceof Error ? e.message : e);
    }

    ffCommand
      .on("start", (commandLine) => {
        console.log("[AUDIT] ffmpeg command line (exact from start event):", commandLine);
      })
      .on("stderr", (line) => {
        stderrLineLog.push(line);
      })
      .on("end", (stdout, stderr) => {
        console.log("[AUDIT] ffmpeg full stdout (end callback):", stdout ?? "");
        console.log("[AUDIT] ffmpeg full stderr (end callback):", stderr ?? "");
        console.log("[AUDIT] ffmpeg stderr (line-by-line concat):", stderrLineLog.join(""));
        console.log("[AUDIT] ffmpeg process exit code:", 0);
        resolve();
      })
      .on("error", (err, stdout, stderr) => {
        console.log("[AUDIT] ffmpeg full stdout (error callback):", stdout ?? "");
        console.log("[AUDIT] ffmpeg full stderr (error callback):", stderr ?? "");
        console.log("[AUDIT] ffmpeg stderr (line-by-line concat):", stderrLineLog.join(""));
        const codeMatch = String(err?.message || "").match(/ffmpeg exited with code (\d+)/);
        console.log(
          "[AUDIT] ffmpeg process exit code:",
          codeMatch ? Number(codeMatch[1]) : err?.message || err,
        );
        reject(err);
      })
      .run();
  });
}

app.get("/health", (req, res) => {
  console.log(
    `[${RAILWAY_POSTER_AUDIT_MARKER}] GET_HEALTH_HANDLER_FIRST_LINE`,
    JSON.stringify({
      marker: RAILWAY_POSTER_AUDIT_MARKER,
      pid: typeof process.pid === "number" ? process.pid : null,
      cwd: process.cwd(),
      entryFileAbsolute: path.resolve(__filename),
      requestMethod: req.method,
      requestUrl: req.originalUrl || req.url,
    }),
  );
  console.log(
    `[${RAILWAY_POSTER_AUDIT_MARKER}] BEFORE_JSON_RESPONSE`,
    JSON.stringify({
      marker: RAILWAY_POSTER_AUDIT_MARKER,
      pid: typeof process.pid === "number" ? process.pid : null,
      cwd: process.cwd(),
      entryFileAbsolute: path.resolve(__filename),
      SUPABASE_URL: Boolean(process.env.SUPABASE_URL?.trim()),
      SUPABASE_POSTER_BUCKET: Boolean(process.env.SUPABASE_POSTER_BUCKET?.trim()),
      SUPABASE_SERVICE_ROLE_KEY: Boolean(
        process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
      ),
      requestMethod: req.method,
      requestUrl: req.originalUrl || req.url,
      responseHttpStatus: 200,
    }),
  );
  res.status(200).json({
    success: true,
    marker: RAILWAY_POSTER_AUDIT_MARKER,
  });
});

app.post("/generate-poster", async (req, res) => {
  console.log(
    `[${RAILWAY_POSTER_AUDIT_MARKER}] POST_GENERATE_POSTER_HANDLER_FIRST_LINE`,
    JSON.stringify({
      marker: RAILWAY_POSTER_AUDIT_MARKER,
      pid: typeof process.pid === "number" ? process.pid : null,
      cwd: process.cwd(),
      entryFileAbsolute: path.resolve(__filename),
      SUPABASE_URL: Boolean(process.env.SUPABASE_URL?.trim()),
      SUPABASE_POSTER_BUCKET: Boolean(process.env.SUPABASE_POSTER_BUCKET?.trim()),
      SUPABASE_SERVICE_ROLE_KEY: Boolean(
        process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
      ),
      requestMethod: req.method,
      requestUrl: req.originalUrl || req.url,
    }),
  );
  try {
    const rawStory = req.body?.story_id;
    const rawMedia = req.body?.media_url;

    console.log("[AUDIT] incoming story_id (raw):", rawStory);
    console.log("[AUDIT] incoming media_url (raw):", rawMedia);

    const mediaUrl =
      typeof req.body?.media_url === "string"
        ? req.body.media_url.trim()
        : "";

    const storyId =
      typeof req.body?.story_id === "string"
        ? req.body.story_id.trim()
        : "";

    let mediaUrlMalformed = false;
    if (mediaUrl) {
      try {
        new URL(mediaUrl);
      } catch {
        mediaUrlMalformed = true;
      }
    }

    console.log(
      "[AUDIT] media_url empty or malformed:",
      !mediaUrl || typeof rawMedia !== "string" || mediaUrlMalformed,
    );
    console.log(
      "[AUDIT] story_id empty or malformed:",
      !storyId || typeof rawStory !== "string",
    );

    if (!mediaUrl) {
      return sendJson(
        res,
        400,
        {
          success: false,
          error: "Missing or invalid media_url.",
        },
        req,
      );
    }

    if (!storyId) {
      return sendJson(
        res,
        400,
        {
          success: false,
          error: "Missing or invalid story_id.",
        },
        req,
      );
    }

    const supabaseEnv = loadSupabaseEnv();
    if (!supabaseEnv.ok) {
      return sendJson(
        res,
        500,
        {
          success: false,
          error: `Missing required environment variables: ${supabaseEnv.missing.join(", ")}`,
        },
        req,
      );
    }

    const response = await axios.get(mediaUrl, {
      responseType: "arraybuffer",
      timeout: 120000,
      maxContentLength: 500 * 1024 * 1024,
      validateStatus: () => true,
    });

    if (response.status < 200 || response.status >= 300) {
      return sendJson(
        res,
        500,
        {
          success: false,
          error: `Failed to download video (HTTP ${response.status}).`,
        },
        req,
      );
    }

    await fs.promises.writeFile(INPUT_FILE, Buffer.from(response.data));

    let inputStat;
    try {
      inputStat = await fs.promises.stat(INPUT_FILE);
    } catch {
      inputStat = null;
    }
    console.log("[AUDIT] input file exists before ffmpeg:", Boolean(inputStat));
    console.log(
      "[AUDIT] input file size bytes (if downloaded locally):",
      inputStat ? inputStat.size : null,
    );

    await extractPosterFrame();

    let outputStat;
    try {
      outputStat = await fs.promises.stat(POSTER_FILE);
    } catch {
      outputStat = null;
    }
    console.log("[AUDIT] output poster file exists after ffmpeg:", Boolean(outputStat));
    console.log(
      "[AUDIT] output file size bytes (if present):",
      outputStat ? outputStat.size : null,
    );

    const posterStoragePath = `posters/${storyId}/poster.jpg`;
    const posterBuffer = await fs.promises.readFile(POSTER_FILE);

    const supabase = createSupabaseServiceClient(supabaseEnv);
    const uploadResult = await supabase.storage
      .from(supabaseEnv.posterBucket)
      .upload(posterStoragePath, posterBuffer, {
        contentType: "image/jpeg",
        upsert: true,
      });

    console.log("[AUDIT] Supabase upload exact result:", JSON.stringify(uploadResult));

    const uploadError = uploadResult.error;

    if (uploadError) {
      return sendJson(
        res,
        500,
        {
          success: false,
          error: `Storage upload failed: ${uploadError.message}`,
        },
        req,
      );
    }

    const { data: publicUrlData } = supabase.storage
      .from(supabaseEnv.posterBucket)
      .getPublicUrl(posterStoragePath);

    const posterUrl = publicUrlData?.publicUrl;
    if (!posterUrl) {
      return sendJson(
        res,
        500,
        {
          success: false,
          error: "Could not build public URL for uploaded poster.",
        },
        req,
      );
    }

    return sendJson(
      res,
      200,
      {
        success: true,
        poster_path: "./poster.jpg",
        poster_storage_path: posterStoragePath,
        poster_url: posterUrl,
      },
      req,
    );
  } catch (err) {
    console.error("generate-poster error:", err);
    return sendJson(
      res,
      500,
      {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      },
      req,
    );
  }
});

app.listen(PORT, () => {
  console.log("Poster worker running on http://localhost:3000");
});
