// Sets light or dark mode before the page is drawn, so it never flashes the wrong one. The choice
// is saved in localStorage by src/lib/theme.ts, which keeps the mode up to date after this.
{
  let choice = null;
  try {
    choice = localStorage.getItem('hotshoe-theme');
  } catch {
    // Storage can be blocked, such as in some private windows. The phone's setting decides.
  }
  const dark =
    choice === 'dark' ||
    (choice !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  // The same colours as --surface in src/styles/index.css
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', dark ? '#0c0a09' : '#fafaf9');
}
