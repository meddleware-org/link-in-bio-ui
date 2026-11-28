// Moving the browser to another address, in one place so a test can replace it (a test window cannot navigate). Used by the console's sign-out,
// which follows the identity provider's logout address.

/** Open `url` in this window (the console may run inside a frame, so the top window is moved when it is reachable). */
export function goTo(url: string): void {
  try {
    // Embedded in a frame: move the frame's parent.
    if (window.top && window.top !== window) window.top.location.assign(url)
    else window.location.assign(url)
  // A cross-origin parent refuses access: move this window instead.
  } catch {
    window.location.assign(url)
  }
}
