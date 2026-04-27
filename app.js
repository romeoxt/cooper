const statusEl = document.getElementById("status");
const videoListEl = document.getElementById("video-list");
const feedMetaEl = document.getElementById("feed-meta");
const searchEl = document.getElementById("filter-search");
const chipButtons = Array.from(document.querySelectorAll(".chip"));
const sentinelEl = document.getElementById("scroll-sentinel");
const modalEl = document.getElementById("video-modal");
const modalCloseEl = document.getElementById("video-modal-close");
const videoFrameEl = document.getElementById("video-frame");
const introLoaderEl = document.getElementById("intro-loader");
const fallbackFeedUrl = "./data/videos.json";
const feedUrl = window.VIDEO_FEED_URL || fallbackFeedUrl;

let allVideos = [];
let filteredVideos = [];
let activeChip = "all";
let renderIndex = 0;
const pageSize = 24;
let lastUpdatedLabel = "Unknown";

function decodeHtmlEntities(value) {
  const textarea = document.createElement("textarea");
  textarea.innerHTML = String(value || "");
  return textarea.value;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDate(isoDate, includeTime = false) {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }
  const options = {
    month: "short",
    day: "numeric",
    year: "numeric",
  };
  if (includeTime) {
    options.hour = "numeric";
    options.minute = "2-digit";
  }
  return new Intl.DateTimeFormat("en-US", options).format(date);
}

function durationToSeconds(duration) {
  if (!duration || !duration.includes(":")) {
    return 0;
  }
  const parts = duration.split(":").map((value) => Number(value));
  if (parts.some((value) => Number.isNaN(value))) {
    return 0;
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return 0;
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("is-error", isError);
}

function renderMeta(updatedAt) {
  if (!feedMetaEl) {
    return;
  }
  feedMetaEl.innerHTML = `
    <span class="meta-pill is-live">
      <span class="meta-dot" aria-hidden="true"></span>
      Last updated: ${escapeHtml(updatedAt)}
    </span>
  `;
}

function makeCardMarkup(video) {
  const title = escapeHtml(decodeHtmlEntities(video.title || "Untitled"));
  const channel = escapeHtml(decodeHtmlEntities(video.channelTitle || "Unknown Channel"));
  const thumb = escapeHtml(video.thumbnailUrl || "");
  const duration = escapeHtml(video.duration || "");
  const published = escapeHtml(formatDate(video.publishedAt));
  const videoId = escapeHtml(video.videoId || "");
  return `
    <article class="video-card" data-video-id="${videoId}">
      <div class="thumb-wrap">
        <img src="${thumb}" alt="Thumbnail for ${title}" loading="lazy" />
        <span class="duration-badge">${duration || "Live"}</span>
      </div>
      <div class="video-content">
        <h3 class="video-title">${title}</h3>
        <p class="video-meta">${channel} · ${published}</p>
      </div>
    </article>
  `;
}

function renderNextChunk() {
  if (renderIndex >= filteredVideos.length) {
    return;
  }
  const next = filteredVideos.slice(renderIndex, renderIndex + pageSize);
  const html = next.map(makeCardMarkup).join("");
  videoListEl.insertAdjacentHTML("beforeend", html);
  renderIndex += next.length;
  setStatus(
    `Showing ${renderIndex} of ${filteredVideos.length} videos · Last updated ${lastUpdatedLabel}`
  );
}

function applyFilters() {
  const query = (searchEl?.value || "").toLowerCase().trim();
  const now = Date.now();
  const oneYearMs = 1000 * 60 * 60 * 24 * 365;

  filteredVideos = allVideos.filter((video) => {
    const haystack = `${video.title || ""} ${video.channelTitle || ""} ${
      video.description || ""
    }`.toLowerCase();
    if (query && !haystack.includes(query)) {
      return false;
    }

    if (activeChip === "recent") {
      const publishedAt = new Date(video.publishedAt).getTime();
      return !Number.isNaN(publishedAt) && now - publishedAt <= oneYearMs;
    }
    if (activeChip === "short") {
      return durationToSeconds(video.duration) > 0 && durationToSeconds(video.duration) <= 600;
    }
    if (activeChip === "long") {
      return durationToSeconds(video.duration) >= 1200;
    }
    return true;
  });

  videoListEl.innerHTML = "";
  renderIndex = 0;

  if (filteredVideos.length === 0) {
    setStatus("No videos match your current filters.");
    return;
  }

  renderNextChunk();
}

function setupInfiniteScroll() {
  if (!sentinelEl) {
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          renderNextChunk();
        }
      });
    },
    { rootMargin: "500px 0px 500px 0px" }
  );
  observer.observe(sentinelEl);
}

function runIntroLoader() {
  if (!introLoaderEl) {
    return;
  }
  introLoaderEl.classList.add("fallback-run");
  window.setTimeout(() => {
    introLoaderEl.classList.add("fallback-exit");
  }, 650);
  window.setTimeout(() => {
    introLoaderEl.classList.add("is-hidden");
    introLoaderEl.remove();
  }, 1300);
}

function openVideoModal(videoId) {
  if (!videoId) {
    return;
  }
  videoFrameEl.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`;
  modalEl.classList.add("open");
  modalEl.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeVideoModal() {
  videoFrameEl.src = "";
  modalEl.classList.remove("open");
  modalEl.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

videoListEl.addEventListener("click", (event) => {
  const card = event.target.closest(".video-card");
  if (!card) {
    return;
  }
  openVideoModal(card.dataset.videoId);
});

modalCloseEl.addEventListener("click", closeVideoModal);
modalEl.addEventListener("click", (event) => {
  if (event.target === modalEl) {
    closeVideoModal();
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && modalEl.classList.contains("open")) {
    closeVideoModal();
  }
});

if (searchEl) {
  searchEl.addEventListener("input", applyFilters);
}
chipButtons.forEach((button) => {
  button.addEventListener("click", () => {
    chipButtons.forEach((btn) => btn.classList.remove("active"));
    button.classList.add("active");
    activeChip = button.dataset.chip || "all";
    applyFilters();
  });
});

async function loadFeed() {
  setStatus("Loading videos...");
  try {
    const response = await fetch(feedUrl, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error || "Feed request failed.");
    }
    allVideos = Array.isArray(payload.videos) ? payload.videos : [];
    lastUpdatedLabel = formatDate(payload.updatedAt, true);
    renderMeta(lastUpdatedLabel);

    if (allVideos.length === 0) {
      setStatus("No videos currently available in the feed.");
      return;
    }

    applyFilters();
  } catch (error) {
    setStatus(`Could not load feed: ${error.message}`, true);
  }
}

setupInfiniteScroll();
loadFeed();

if (document.readyState === "complete") {
  window.setTimeout(runIntroLoader, 100);
} else {
  window.addEventListener("load", () => window.setTimeout(runIntroLoader, 100), {
    once: true,
  });
}
