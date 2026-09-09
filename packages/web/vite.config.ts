import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Same headers as packages/web/nginx.conf (the Docker/production path) - `vite
// preview` is a second, separate static-file server (used by CI's security job
// to serve the build for the ZAP scan) with its own default headers, so the
// nginx config alone doesn't cover it. Duplicated deliberately rather than
// reconciled into one place, since the two servers have no shared config layer.
const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' http://localhost:4000; img-src 'self' data:; frame-ancestors 'none'",
};

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  preview: { headers: securityHeaders },
});
