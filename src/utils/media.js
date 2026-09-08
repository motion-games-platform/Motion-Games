// 游戏运行时媒体的统一 URL 前缀。
// 原 Nuxt 项目里 mediaUrl 会把 /storage/... 切到 CDN 子域（storage.swayjoy.com）；
// 本单游戏项目所有资源同源本地提供（public/ 原样映射到站点根），因此直接原样返回即可。
// 引擎 / 组件在 import 顶层就调用 mediaUrl 拼贴图 / 常量，这里保持纯函数、无运行时竞态。
export const mediaUrl = (p) => String(p);
