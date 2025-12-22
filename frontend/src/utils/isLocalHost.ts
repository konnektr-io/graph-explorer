// Utility to detect if running on localhost (dev mode)
export function isLocalhost() {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "[::1]" ||
    // Vite/other dev servers may use 192.168.x.x or 10.x.x.x for LAN
    /^192\.168\./.test(host) ||
    /^10\./.test(host)
  );
}
