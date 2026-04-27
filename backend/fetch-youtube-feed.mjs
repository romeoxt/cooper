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

  const get = (key, fallback = "") => process.env[key] || fileValues[key] || fallback;
  return {
    YOUTUBE_API_KEY: get("YOUTUBE_API_KEY"),
    PERSON_NAME: get("PERSON_NAME"),
    SEARCH_QUERY: get("SEARCH_QUERY"),
    PERSON_NAME_VARIANTS: get("PERSON_NAME_VARIANTS"),
    MAX_RESULTS: Number(get("MAX_RESULTS", 300)),
    SEARCH_PAGE_SIZE: Number(get("SEARCH_PAGE_SIZE", 50)),
    MAX_PAGES: Number(get("MAX_PAGES", 20)),
    INCREMENTAL_FETCH_LIMIT: Number(get("INCREMENTAL_FETCH_LIMIT", 120)),
    INCREMENTAL_MAX_PAGES: Number(get("INCREMENTAL_MAX_PAGES", 3)),
    PUBLISHED_AFTER: get("PUBLISHED_AFTER"),
    PUBLISHED_BEFORE: get("PUBLISHED_BEFORE"),
    OUTPUT_PATH: get("OUTPUT_PATH", path.resolve(__dirname, "../data/videos.json")),
  };
}

function normalize(value) {
  return String(value || "").toLowerCase().trim();
}

function parseVariants(mainName, variantsInput) {
  const variants = [mainName];
  if (String(variantsInput || "").trim()) {
    variants.push(
      ...String(variantsInput)
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

function mapVideoWithDuration(video, duration) {
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
    duration: duration || "",
  };
}

async function fetchYoutubeCandidates({
  apiKey,
  searchQuery,
  maxResults,
  searchPageSize,
  maxPages,
  publishedAfter,
  publishedBefore,
}) {
  const collected = [];
  let pageToken = "";
  let pageCount = 0;
  const pageSize = Math.max(5, Math.min(searchPageSize, 50));

  while (pageCount < maxPages && collected.length < maxResults) {
    const params = new URLSearchParams({
      part: "snippet",
      type: "video",
      order: "date",
      q: searchQuery,
      maxResults: String(pageSize),
      key: apiKey,
    });
    if (pageToken) {
      params.set("pageToken", pageToken);
    }
    if (publishedAfter) {
      params.set("publishedAfter", publishedAfter);
    }
    if (publishedBefore) {
      params.set("publishedBefore", publishedBefore);
    }

    const url = `https://www.googleapis.com/youtube/v3/search?${params.toString()}`;
    const response = await fetch(url);
    const payload = await response.json();
    if (!response.ok) {
      const message = payload?.error?.message || "Unknown YouTube API error.";
      throw new Error(message);
    }

    const items = Array.isArray(payload.items) ? payload.items : [];
    collected.push(...items);
    pageToken = payload.nextPageToken || "";
    pageCount += 1;
    if (!pageToken) {
      break;
    }
  }

  return collected;
}

function parseIsoDuration(isoDuration) {
  if (!isoDuration) {
    return "";
  }
  const match = isoDuration.match(
    /^P(?:\d+Y)?(?:\d+M)?(?:\d+W)?(?:\d+D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/
  );
  if (!match) {
    return "";
  }
  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(
      2,
      "0"
    )}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

async function fetchVideoDurations(apiKey, videoIds) {
  const durationById = {};
  const chunkSize = 50;
  for (let i = 0; i < videoIds.length; i += chunkSize) {
    const chunk = videoIds.slice(i, i + chunkSize);
    if (chunk.length === 0) {
      continue;
    }
    const params = new URLSearchParams({
      part: "contentDetails",
      id: chunk.join(","),
      key: apiKey,
      maxResults: String(chunk.length),
    });
    const url = `https://www.googleapis.com/youtube/v3/videos?${params.toString()}`;
    const response = await fetch(url);
    const payload = await response.json();
    if (!response.ok) {
      const message = payload?.error?.message || "Unknown YouTube API error.";
      throw new Error(message);
    }
    const items = Array.isArray(payload.items) ? payload.items : [];
    for (const item of items) {
      durationById[item.id] = parseIsoDuration(item?.contentDetails?.duration || "");
    }
  }
  return durationById;
}

function dedupeVideosById(videos) {
  const seen = new Set();
  return videos.filter((video) => {
    const id = video?.id?.videoId || video?.videoId || "";
    if (!id || seen.has(id)) {
      return false;
    }
    seen.add(id);
    return true;
  });
}

function sortByPublishedAtDesc(videos) {
  return [...videos].sort(
    (a, b) =>
      new Date(b?.snippet?.publishedAt || b?.publishedAt || 0).getTime() -
      new Date(a?.snippet?.publishedAt || a?.publishedAt || 0).getTime()
  );
}

function toIsoDateString(value) {
  if (!value) {
    return "";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date value: ${value}`);
  }
  return parsed.toISOString();
}

function addOneSecond(isoDateString) {
  const date = new Date(isoDateString);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Date(date.getTime() + 1000).toISOString();
}

function getLatestPublishedAt(videos) {
  const validDates = videos
    .map((video) => video?.publishedAt || "")
    .filter(Boolean)
    .map((value) => new Date(value).getTime())
    .filter((value) => !Number.isNaN(value));
  if (validDates.length === 0) {
    return "";
  }
  return new Date(Math.max(...validDates)).toISOString();
}

function mergeAndTrimVideos(newVideos, existingVideos, maxResults) {
  return sortByPublishedAtDesc(dedupeVideosById([...newVideos, ...existingVideos])).slice(
    0,
    maxResults
  );
}

async function readExistingFeed(outputPath) {
  try {
    const raw = await readFile(outputPath, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.videos)) {
      return parsed;
    }
  } catch {
    // Ignore missing/invalid existing feed.
  }
  return null;
}

async function writeFeed(outputPath, payload) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function run() {
  const config = await loadEnvConfig();
  const mode = process.argv.includes("--bootstrap") ? "bootstrap" : "incremental";

  if (!config.YOUTUBE_API_KEY) {
    throw new Error("Missing YOUTUBE_API_KEY in env.");
  }

  if (!config.PERSON_NAME.trim()) {
    throw new Error("Missing PERSON_NAME in env.");
  }

  const variants = parseVariants(config.PERSON_NAME, config.PERSON_NAME_VARIANTS);
  const finalMaxResults = Math.max(5, config.MAX_RESULTS);
  const searchQuery = (config.SEARCH_QUERY || config.PERSON_NAME).trim();
  const pageSize = Math.max(5, Math.min(config.SEARCH_PAGE_SIZE, 50));
  const existingFeed = await readExistingFeed(config.OUTPUT_PATH);

  const configuredPublishedAfter = toIsoDateString(config.PUBLISHED_AFTER);
  let effectivePublishedAfter = configuredPublishedAfter;
  if (mode === "incremental" && existingFeed?.videos?.length) {
    const latestExisting = getLatestPublishedAt(existingFeed.videos);
    if (latestExisting) {
      const latestPlusOne = addOneSecond(latestExisting);
      if (!effectivePublishedAfter) {
        effectivePublishedAfter = latestPlusOne;
      } else {
        const latestTime = new Date(latestPlusOne).getTime();
        const configuredTime = new Date(effectivePublishedAfter).getTime();
        effectivePublishedAfter =
          latestTime > configuredTime ? latestPlusOne : effectivePublishedAfter;
      }
    }
  }

  const publishedBefore = toIsoDateString(config.PUBLISHED_BEFORE);
  const maxPages =
    mode === "bootstrap" ? Math.max(1, config.MAX_PAGES) : Math.max(1, config.INCREMENTAL_MAX_PAGES);
  const fetchTarget =
    mode === "bootstrap"
      ? Math.min(Math.max(finalMaxResults * 6, 300), pageSize * maxPages)
      : Math.max(20, config.INCREMENTAL_FETCH_LIMIT);

  const candidates = await fetchYoutubeCandidates({
    apiKey: config.YOUTUBE_API_KEY,
    searchQuery,
    maxResults: fetchTarget,
    searchPageSize: pageSize,
    maxPages,
    publishedAfter: effectivePublishedAfter,
    publishedBefore,
  });

  const matchingCandidates = sortByPublishedAtDesc(
    dedupeVideosById(candidates).filter((video) => hasVariantMatch(video, variants))
  );

  const cappedCandidates =
    mode === "bootstrap"
      ? matchingCandidates.slice(0, finalMaxResults)
      : matchingCandidates.slice(0, Math.max(config.INCREMENTAL_FETCH_LIMIT, 20));

  const newVideoIds = cappedCandidates.map((video) => video?.id?.videoId || "").filter(Boolean);
  const durationById = await fetchVideoDurations(config.YOUTUBE_API_KEY, newVideoIds);
  const newMappedVideos = cappedCandidates.map((video) =>
    mapVideoWithDuration(video, durationById[video?.id?.videoId || ""] || "")
  );

  const previousVideos = Array.isArray(existingFeed?.videos) ? existingFeed.videos : [];
  const finalVideos =
    mode === "bootstrap"
      ? newMappedVideos
      : mergeAndTrimVideos(newMappedVideos, previousVideos, finalMaxResults);

  const payload = {
    personName: config.PERSON_NAME,
    nameVariants: variants,
    updatedAt: new Date().toISOString(),
    videoCount: finalVideos.length,
    mode,
    queryConfig: {
      searchQuery,
      maxResults: finalMaxResults,
      searchPageSize: pageSize,
      maxPages,
      incrementalFetchLimit: config.INCREMENTAL_FETCH_LIMIT,
      incrementalMaxPages: config.INCREMENTAL_MAX_PAGES,
      publishedAfter: effectivePublishedAfter || null,
      publishedBefore: publishedBefore || null,
    },
    videos: finalVideos,
  };

  await writeFeed(config.OUTPUT_PATH, payload);
  console.log(`Saved ${finalVideos.length} videos to ${config.OUTPUT_PATH} (${mode})`);
}

run().catch((error) => {
  console.error("Feed update failed:", error.message);
  process.exit(1);
});
