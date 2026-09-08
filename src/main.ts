import { createApp } from "vue";

// 全局共用样式（原 Nuxt 项目的 assets/css/main.css，含 .game-area / .stage / 关卡界面 / 设置弹窗等）
import "./assets/css/main.css";

import App from "./App.vue";

// —— 全局注册 Motion Bubble Shooter 组件（内部目录名 pinch-pop-bubbles）——
// 原项目里组件由 Nuxt 按文件名自动注册为 PinchPopBubblesXxx；此处手动注册成同名全局组件，
// 使 GameClient 模板里的 <PinchPopBubblesLevelHome/> 等引用无需改动即可解析。
import PinchPopBubblesGameClient from "./components/pinch-pop-bubbles/GameClient.vue";
import PinchPopBubblesGameSettings from "./components/pinch-pop-bubbles/GameSettings.vue";
import PinchPopBubblesLevelHome from "./components/pinch-pop-bubbles/LevelHome.vue";
import PinchPopBubblesLevelIntro from "./components/pinch-pop-bubbles/LevelIntro.vue";
import PinchPopBubblesLevelComplete from "./components/pinch-pop-bubbles/LevelComplete.vue";
import PinchPopBubblesLevelMap from "./components/pinch-pop-bubbles/LevelMap.vue";
import PinchPopBubblesStatusPanel from "./components/pinch-pop-bubbles/StatusPanel.vue";

const app = createApp(App);

app.component("PinchPopBubblesGameClient", PinchPopBubblesGameClient);
app.component("PinchPopBubblesGameSettings", PinchPopBubblesGameSettings);
app.component("PinchPopBubblesLevelHome", PinchPopBubblesLevelHome);
app.component("PinchPopBubblesLevelIntro", PinchPopBubblesLevelIntro);
app.component("PinchPopBubblesLevelComplete", PinchPopBubblesLevelComplete);
app.component("PinchPopBubblesLevelMap", PinchPopBubblesLevelMap);
app.component("PinchPopBubblesStatusPanel", PinchPopBubblesStatusPanel);

app.mount("#app");
