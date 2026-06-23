import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// No backend — pure static SPA. Concept gallery for the gutter estimating PRD.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: true,
  },
})
