import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  esbuild: {
    // Allow both .jsx and .tsx files
    include: /\.[jt]sx?$/,
  },
})
