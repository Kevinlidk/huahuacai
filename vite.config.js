import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // 本地开发：/api 代理到内存版 KV 模拟服务（server/mock-server.js）
      '/api': { target: 'http://127.0.0.1:8788', changeOrigin: true },
    },
  },
});
