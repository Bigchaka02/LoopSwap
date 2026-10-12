/** Resolve only app-local destinations for imperative navigation. */
export function appDestination(destination: string, currentUrl: string): string {
  const current = new URL(currentUrl);
  const next = new URL(destination, current);
  if (!['http:', 'https:'].includes(next.protocol) || next.origin !== current.origin) {
    throw new Error('Choose a page within this campus app.');
  }
  return next.href;
}

export function navigateApp(destination: string): void {
  window.location.assign(appDestination(destination, window.location.href));
}
