const THEME_STORAGE_KEY = "hc-theme";
const LIGHT_THEME = "light";
const DARK_THEME = "dark";

function getCurrentTheme() {
  const fromAttr = document.documentElement.getAttribute("data-theme");
  if (fromAttr === LIGHT_THEME || fromAttr === DARK_THEME) {
    return fromAttr;
  }
  return LIGHT_THEME;
}

function applyTheme(theme) {
  const nextTheme = theme === DARK_THEME ? DARK_THEME : LIGHT_THEME;
  document.documentElement.setAttribute("data-theme", nextTheme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  } catch {
    // Ignore storage failures.
  }
  return nextTheme;
}

function updateToggleLabel(button, theme) {
  if (!button) {
    return;
  }
  button.textContent = theme === DARK_THEME ? "Light mode" : "Dark mode";
}

function initThemeToggle() {
  const button = document.getElementById("theme-toggle");
  if (!button) {
    return;
  }

  const initialTheme = applyTheme(getCurrentTheme());
  updateToggleLabel(button, initialTheme);

  button.addEventListener("click", () => {
    const nextTheme = getCurrentTheme() === DARK_THEME ? LIGHT_THEME : DARK_THEME;
    const applied = applyTheme(nextTheme);
    updateToggleLabel(button, applied);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initThemeToggle, { once: true });
} else {
  initThemeToggle();
}
