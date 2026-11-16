import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Builds one self-contained index.html (JS + CSS inlined) so the prototype
// can be hosted anywhere, including a single-file artifact.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
})
