const statusEl = document.getElementById("status");
const videoListEl = document.getElementById("video-list");
const feedMetaEl = document.getElementById("feed-meta");
const modalEl = document.getElementById("video-modal");
const modalCloseEl = document.getElementById("video-modal-close");
const videoFrameEl = document.getElementById("video-frame");
const introLoaderEl = document.getElementById("intro-loader");
const fallbackFeedUrl = "./data/videos.json";
const feedUrl = window.VIDEO_FEED_URL || fallbackFeedUrl;
let smoothScrollController = null;

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

function getDescriptionExcerpt(text) {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > 150 ? `${clean.slice(0, 147)}...` : clean;
}

function renderVideos(videos) {
  videoListEl.innerHTML = "";
  videos.forEach((video, index) => {
    const {
      title,
      description,
      channelTitle,
      publishedAt,
      thumbnailUrl,
      videoUrl,
      videoId,
    } = video;

    const safeTitle = escapeHtml(title);
    const safeChannelTitle = escapeHtml(channelTitle);
    const safeDescription = escapeHtml(getDescriptionExcerpt(description || ""));
    const safeThumbnailUrl = escapeHtml(thumbnailUrl);
    const embedId = videoId || (videoUrl.split("v=")[1] || "").split("&")[0];

    const card = document.createElement("article");
    card.className = "video-card reveal";
    card.style.setProperty("--reveal-delay", `${index * 70}ms`);
    card.innerHTML = `
      <div class="video-index">${String(index + 1).padStart(2, "0")}</div>
      <div class="video-body">
        <h3 class="video-title">${safeTitle}</h3>
        <p class="video-meta">${safeChannelTitle} / ${formatDate(publishedAt)}</p>
        <p class="video-desc">${safeDescription}</p>
        <button class="video-play" type="button" data-video-id="${embedId}">
          Watch Now
        </button>
      </div>
      <div class="video-thumb-wrap">
        <img src="${safeThumbnailUrl}" alt="Thumbnail for ${safeTitle}" loading="lazy">
      </div>
    `;
    videoListEl.append(card);
  });

  activateScrollAnimations();
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#b91c1c" : "#334155";
}

function renderMeta(payload) {
  const updatedAt = payload.updatedAt ? formatDate(payload.updatedAt, true) : "Unknown";
  feedMetaEl.innerHTML = `
    <span class="meta-pill">Last updated: ${updatedAt}</span>
  `;
}

function activateScrollAnimations() {
  const cards = document.querySelectorAll(".reveal");

  if (window.gsap && window.ScrollTrigger) {
    window.gsap.registerPlugin(window.ScrollTrigger);
    window.ScrollTrigger.getAll().forEach((trigger) => trigger.kill());

    window.gsap.set(cards, { opacity: 0, y: 22 });
    cards.forEach((card, index) => {
      const thumb = card.querySelector(".video-thumb-wrap img");

      window.gsap.to(card, {
        opacity: 1,
        y: 0,
        duration: 0.75,
        ease: "power3.out",
        delay: Math.min(index * 0.035, 0.35),
        scrollTrigger: {
          trigger: card,
          start: "top 86%",
          once: true,
        },
      });

      if (thumb) {
        window.gsap.fromTo(
          thumb,
          { yPercent: -6, scale: 1.06 },
          {
            yPercent: 6,
            scale: 1.02,
            ease: "none",
            scrollTrigger: {
              trigger: card,
              start: "top bottom",
              end: "bottom top",
              scrub: true,
            },
          }
        );
      }
    });

    return;
  }

  if (!("IntersectionObserver" in window)) {
    cards.forEach((card) => card.classList.add("in-view"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries, currentObserver) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("in-view");
          currentObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.18 }
  );

  cards.forEach((card) => observer.observe(card));
}

function setupSmoothScroll() {
  if (!window.Lenis) {
    return;
  }

  if (smoothScrollController) {
    smoothScrollController.destroy();
  }

  smoothScrollController = new window.Lenis({
    duration: 1.05,
    smoothWheel: true,
    wheelMultiplier: 0.95,
    touchMultiplier: 1.1,
  });

  const raf = (time) => {
    smoothScrollController.raf(time);
    requestAnimationFrame(raf);
  };
  requestAnimationFrame(raf);

  if (window.ScrollTrigger) {
    smoothScrollController.on("scroll", window.ScrollTrigger.update);
  }
}

function runIntroLoader() {
  if (!introLoaderEl) {
    return;
  }

  const complete = () => {
    introLoaderEl.classList.add("is-hidden");
    window.setTimeout(() => {
      introLoaderEl.remove();
    }, 900);
  };

  if (window.gsap) {
    const mark = introLoaderEl.querySelector(".intro-mark");
    const tl = window.gsap.timeline({ defaults: { ease: "power2.out" } });
    tl.to(mark, {
      opacity: 1,
      scale: 1,
      filter: "blur(0px)",
      duration: 0.85,
      ease: "expo.out",
    })
      .to(mark, {
        opacity: 0,
        scale: 1.03,
        filter: "blur(4px)",
        duration: 0.6,
        ease: "power2.inOut",
      })
      .to(
        introLoaderEl,
        {
          opacity: 0,
          duration: 0.75,
          ease: "power2.inOut",
          onComplete: complete,
        },
        "-=0.25"
      );
    return;
  }

  // CSS-only fallback when GSAP fails to load.
  introLoaderEl.classList.add("fallback-run");
  window.setTimeout(() => {
    introLoaderEl.classList.add("fallback-exit");
  }, 700);
  window.setTimeout(() => {
    complete();
  }, 1500);
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
  const playButton = event.target.closest(".video-play");
  if (!playButton) {
    return;
  }
  openVideoModal(playButton.dataset.videoId);
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

async function loadFeed() {
  setStatus("Loading videos...");
  try {
    const response = await fetch(feedUrl, { cache: "no-store" });
    const payload = await response.json();

    if (!response.ok) {
      const message = payload?.error || "Feed request failed.";
      throw new Error(message);
    }

    const videos = Array.isArray(payload.videos) ? payload.videos : [];
    renderMeta(payload);

    if (videos.length === 0) {
      setStatus("No videos currently available in the feed.");
      return;
    }

    renderVideos(videos);
    setStatus(`Showing ${videos.length} recent videos.`);
  } catch (error) {
    setStatus(`Could not load feed: ${error.message}`, true);
  }
}

loadFeed();
setupSmoothScroll();

if (document.readyState === "complete") {
  window.setTimeout(runIntroLoader, 120);
} else {
  window.addEventListener(
    "load",
    () => {
      window.setTimeout(runIntroLoader, 120);
    },
    { once: true }
  );
}
