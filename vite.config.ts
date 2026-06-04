import react from "@vitejs/plugin-react"
import { defineConfig } from "rolldown-vite"

export default defineConfig({
  base: process.env.GITHUB_PAGES === "true" ? "/global-delivery/" : "/",
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 13845,
    allowedHosts: true,
  },
})
