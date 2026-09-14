import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { tossPlugin } from './server/toss.ts'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), tossPlugin(loadEnv(mode, process.cwd(), 'TOSS_'))],
}))
