// Utility to ensure custom fonts are loaded before remeasuring Monaco editor fonts
export function ensureFontsLoaded(callback: () => void) {
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      // @ts-ignore: monaco may not be typed globally
      if (
        window.monaco &&
        window.monaco.editor &&
        window.monaco.editor.remeasureFonts
      ) {
        window.monaco.editor.remeasureFonts();
      }
      callback();
    });
  } else {
    // Fallback: call callback immediately if Font Loading API is not supported
    callback();
  }
}
