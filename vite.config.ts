import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(), 
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icon-512.png'],
        workbox: {
          maximumFileSizeToCacheInBytes: 5000000,
        },
        manifest: {
          short_name: "Sistema Vendas",
          name: "Sistema de Venda - Controle Financeiro Núcleo",
          description: "Controle de vendas, catálogo de produtos, orçamentos e relatórios financeiros de forma integrada e offline.",
          theme_color: "#e91e63",
          background_color: "#0d1117",
          display: "standalone",
          orientation: "portrait",
          start_url: "/",
          icons: [
            {
              src: "/icon-512.png",
              sizes: "192x192",
              type: "image/png",
              purpose: "any maskable"
            },
            {
              src: "/icon-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "any maskable"
            }
          ]
        }
      })
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    optimizeDeps: {
      include: ['html2canvas', 'jspdf'],
    },
    build: {
      rollupOptions: {
        output: {
          entryFileNames: 'assets/[name]-[hash].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash].[ext]',
        },
      },
    },
    server: {
      cors: true,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
        "Access-Control-Allow-Headers": "X-Requested-With, content-type, Authorization, access_token"
      },
      allowedHosts: true as const,
      proxy: {
        '/api/asaas-proxy': {
          target: 'https://api.asaas.com/v3',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/asaas-proxy/, ''),
          headers: {
            "Access-Control-Allow-Origin": "*",
          }
        },
        '/api/asaas-sandbox-proxy': {
          target: 'https://sandbox.asaas.com/v3',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/asaas-sandbox-proxy/, ''),
          headers: {
            "Access-Control-Allow-Origin": "*",
          }
        }
      },
      // Disable HMR and WebSocket to prevent connection errors in cloud sandbox environments
      hmr: false,
      // Disable file watching to save CPU resources in dev container
      watch: null,
    },
  };
});
