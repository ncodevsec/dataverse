// Applies the saved theme before first paint (avoids a light/dark flash). Kept as an external file so the CSP can forbid inline scripts.
(function () {
  try {
    var t = localStorage.getItem('dv-theme') || 'system';
    var dark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
  } catch (e) {}
})();
