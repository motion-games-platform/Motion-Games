// Motion Bubble Shooter — Vite 配置
// 说明：
//   - resolve.alias：把 Nuxt 风格的 `~/xxx` 别名指到 `src/`，迁移来的源码 import 路径无需改动。
//   - AutoImport：原项目在 Nuxt 里 ref/computed/watch 等是自动导入的；这里用 unplugin-auto-import 还原该行为，
//     并把 `mediaUrl` 也做成全局自动导入（原项目经 Nuxt utils 自动导入使用）。
//   - 摄像头调用需在安全上下文运行：dev 用 http://localhost 即可（浏览器视 localhost 为安全上下文）。

import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import AutoImport from "unplugin-auto-import/vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [
    vue(),
    AutoImport({
      imports: [
        "vue",
        // 原项目里 mediaUrl 是 Nuxt 自动导入的（app/utils/* 顶层导出），此处还原，供组件模板/脚本直接调用
        { "~/utils/media": ["mediaUrl"] },
      ],
      // 原项目模板里也直接使用 mediaUrl（如 LevelComplete 的 replay 图）；默认只注入 <script>，需开 vueTemplate 才还原模板侧自动导入
      vueTemplate: true,
      dts: "src/auto-imports.d.ts",
    }),
  ],
  resolve: {
    alias: {
      "~": fileURLToPath(new URL("./src", import.meta.url)),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
  },
  build: {
    // MediaPipe 的 wasm 推理脚本较大，提示阈值开高些避免误告警
    chunkSizeWarningLimit: 6000,
  },
});
