require("dotenv").config();

const path = require("path");
const fs = require("fs");
const express = require("express");
const axios = require("axios");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const { loadSupabaseEnv, createSupabaseServiceClient } = require("./config");

const PORT = 3000;
const WORK_DIR = __dirname;
const INPUT_FILE = path.join(WORK_DIR, "input.mp4");
const POSTER_FILE = path.join(WORK_DIR, "poster.jpg");

if (!ffmpegPath) {
  console.error("ffmpeg-static did not resolve a binary path.");
  process.exit(1);
}
ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();
app.use(express.json({ limit: "2mb" }));

function extractPosterFrame() {
  return new Promise((resolve, reject) => {
    ffmpeg(INPUT_FILE)
      .inputOptions(["-ss", "1"])
      .outputOptions(["-vframes", "1", "-q:v", "2"])
      .output(POSTER_FILE)
      .on("end", () => resolve())
      .on("error", (err) => reject(err))
      .run();
  });
}

app.post("/generate-poster", async (req, res) => {
  try {
    const mediaUrl =
      typeof req.body?.media_url === "string"
        ? req.body.media_url.trim()
        : "";

    const storyId =
      typeof req.body?.story_id === "string"
        ? req.body.story_id.trim()
        : "";

    if (!mediaUrl) {
      return res.status(400).json({
        success: false,
        error: "Missing or invalid media_url.",
      });
    }

    if (!storyId) {
      return res.status(400).json({
        success: false,
        error: "Missing or invalid story_id.",
      });
    }

    const supabaseEnv = loadSupabaseEnv();
    if (!supabaseEnv.ok) {
      return res.status(500).json({
        success: false,
        error: `Missing required environment variables: ${supabaseEnv.missing.join(", ")}`,
      });
    }

    const response = await axios.get(mediaUrl, {
      responseType: "arraybuffer",
      timeout: 120000,
      maxContentLength: 500 * 1024 * 1024,
      validateStatus: () => true,
    });

    if (response.status < 200 || response.status >= 300) {
      return res.status(500).json({
        success: false,
        error: `Failed to download video (HTTP ${response.status}).`,
      });
    }

    await fs.promises.writeFile(INPUT_FILE, Buffer.from(response.data));

    await extractPosterFrame();

    const posterStoragePath = `posters/${storyId}/poster.jpg`;
    const posterBuffer = await fs.promises.readFile(POSTER_FILE);

    const supabase = createSupabaseServiceClient(supabaseEnv);
    const { error: uploadError } = await supabase.storage
      .from(supabaseEnv.posterBucket)
      .upload(posterStoragePath, posterBuffer, {
        contentType: "image/jpeg",
        upsert: true,
      });

    if (uploadError) {
      return res.status(500).json({
        success: false,
        error: `Storage upload failed: ${uploadError.message}`,
      });
    }

    const { data: publicUrlData } = supabase.storage
      .from(supabaseEnv.posterBucket)
      .getPublicUrl(posterStoragePath);

    const posterUrl = publicUrlData?.publicUrl;
    if (!posterUrl) {
      return res.status(500).json({
        success: false,
        error: "Could not build public URL for uploaded poster.",
      });
    }

    return res.status(200).json({
      success: true,
      poster_path: "./poster.jpg",
      poster_storage_path: posterStoragePath,
      poster_url: posterUrl,
    });
  } catch (err) {
    console.error("generate-poster error:", err);
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
});

app.listen(PORT, () => {
  console.log("Poster worker running on http://localhost:3000");
});
