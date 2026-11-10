export function getTheme(): "light" | "dark" {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}
export function toggleTheme() {
  const next = getTheme() === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("tbia-theme", next);
  return next;
}
