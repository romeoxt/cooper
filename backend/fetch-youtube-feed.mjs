import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function loadEnvConfig() {
  const candidatePaths = [
    path.resolve(__dirname, "../.env"),
    path.resolve(__dirname, "../.env.example"),
  ];
  const fileValues = {};

  for (const candidatePath of candidatePaths) {
    try {
      const raw = await readFile(candidatePath, "utf8");
      raw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#") && line.includes("="))
        .forEach((line) => {
          const splitIndex = line.indexOf("=");
          const key = line.slice(0, splitIndex).trim();
          const value = line.slice(splitIndex + 1).trim();
          if (!fileValues[key]) {
            fileValues[key] = value;
          }
        });
    } catch {
      // Skip missing env files.
    }
  }

  return {
    YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY || fileValues.YOUTUBE_API_KEY || "",
    PERSON_NAME: process.env.PERSON_NAME || fileValues.PERSON_NAME || "",
    PERSON_NAME_VARIANTS:
      process.env.PERSON_NAME_VARIANTS || fileValues.PERSON_NAME_VARIANTS || "",
    MAX_RESULTS: Number(process.env.MAX_RESULTS || fileValues.MAX_RESULTS || 25),
    OUTPUT_PATH:
      process.env.OUTPUT_PATH ||
      fileValues.OUTPUT_PATH ||
      path.resolve(__dirname, "../data/videos.json"),
  };
}

function normalize(value) {
  return value.toLowerCase().trim();
}

function parseVariants(mainName, variantsInput) {
  const variants = [mainName];
  if (variantsInput.trim()) {
    variants.push(
      ...variantsInput
        .split(",")
        .map((item) => item.replaceAll('"', "").trim())
        .filter(Boolean)
    );
  }
  return [...new Set(variants.map((item) => normalize(item)).filter(Boolean))];
}

function hasVariantMatch(video, variants) {
  const title = normalize(video?.snippet?.title || "");
  const description = normalize(video?.snippet?.description || "");
  return variants.some(
    (variant) => title.includes(variant) || description.includes(variant)
  );
}

function mapVideo(video) {
  const snippet = video?.snippet || {};
  const thumbnails = snippet.thumbnails || {};
  const thumb =
    thumbnails.high?.url || thumbnails.medium?.url || thumbnails.default?.url || "";
  const videoId = video?.id?.videoId || "";
  return {
    videoId,
    videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
    title: snippet.title || "Untitled",
    description: snippet.description || "",
    channelTitle: snippet.channelTitle || "Unknown Channel",
    publishedAt: snippet.publishedAt || "",
    thumbnailUrl: thumb,
  };
}

async function fetchYoutubeCandidates({ apiKey, personName, maxResults }) {
  const params = new URLSearchParams({
    part: "snippet",
    type: "video",
    order: "date",
    q: `"${personName}"`,
    maxResults: String(maxResults),
    key: apiKey,
  });
  const url = `https://www.googleapis.com/youtube/v3/search?${params.toString()}`;
  const response = await fetch(url);
  const payload = await response.json();
  if (!response.ok) {
    const message = payload?.error?.message || "Unknown YouTube API error.";
    throw new Error(message);
  }
  return Array.isArray(payload.items) ? payload.items : [];
}

async function writeFeed(outputPath, payload) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function run() {
  const config = await loadEnvConfig();

  if (!config.YOUTUBE_API_KEY) {
    throw new Error("Missing YOUTUBE_API_KEY in env.");
  }

  if (!config.PERSON_NAME.trim()) {
    throw new Error("Missing PERSON_NAME in env.");
  }

  const variants = parseVariants(config.PERSON_NAME, config.PERSON_NAME_VARIANTS);
  const candidates = await fetchYoutubeCandidates({
    apiKey: config.YOUTUBE_API_KEY,
    personName: config.PERSON_NAME,
    maxResults: Math.max(5, Math.min(config.MAX_RESULTS, 50)),
  });
  const videos = candidates.filter((video) => hasVariantMatch(video, variants)).map(mapVideo);

  const payload = {
    personName: config.PERSON_NAME,
    nameVariants: variants,
    updatedAt: new Date().toISOString(),
    videoCount: videos.length,
    videos,
  };

  await writeFeed(config.OUTPUT_PATH, payload);
  console.log(`Saved ${videos.length} videos to ${config.OUTPUT_PATH}`);
}

run().catch((error) => {
  console.error("Feed update failed:", error.message);
  process.exit(1);
});
