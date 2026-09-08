// 关卡管理层：管理当前关卡、进度（localStorage）、界面流转状态机。
// 界面流转：home（游戏首页）→ intro（下一关要求预览）→ playing → win（通关恭喜）
//           / summary（失败汇总）→ summary（路线图）→ intro（继续）→ playing

import { reactive, computed } from "vue";
import { LEVELS, TOTAL_LEVELS } from "~/config/pinch-pop-bubbles/levels";

const STORAGE_KEY = "swayjoy:pinch-pop-bubbles:progress";

function loadPassedIds(): number[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    }
  } catch {
    // ignore
  }
  return [];
}

function saveProgress(passedIds: number[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(passedIds));
  } catch {
    // ignore
  }
}

// 第一个未通过的关卡索引（0-based）；全部通过则停在最后一关
function firstUnpassedIndex(passedIds: number[]) {
  for (let i = 0; i < TOTAL_LEVELS; i++) {
    if (!passedIds.includes(LEVELS[i].id)) {
      return i;
    }
  }
  return TOTAL_LEVELS - 1;
}

// 模块级单例状态，跨页面 / GameClient / 界面组件共享
const state = reactive({
  screen: "home",
  lastScore: 0,
  lastLevelId: 1,
  lastResult: "win", // win | fail
  passedIds: loadPassedIds() as number[],
  // 显式指定要玩的关卡 id（用于「再玩一次」重放当前关卡）；null = 自然推进到第一个未通过关卡
  playLevelId: null as number | null,
});

export function useLevelManager() {
  // 当前要玩的关卡：优先取 playLevelId（重放），否则取第一个未通过的关卡
  const currentLevel = computed(() => {
    const id =
      state.playLevelId ?? LEVELS[firstUnpassedIndex(state.passedIds)].id;
    return LEVELS.find((l) => l.id === id) ?? LEVELS[0];
  });
  const allCleared = computed(() => state.passedIds.length >= TOTAL_LEVELS);

  function isPassed(id: number) {
    return state.passedIds.includes(id);
  }

  function isUnlocked(id: number) {
    if (id === 1) return true;
    return state.passedIds.includes(id - 1);
  }

  /** 游戏过关时调用（GameClient 触发）。 */
  function completeCurrent(score: number) {
    const level = currentLevel.value;
    if (!state.passedIds.includes(level.id)) {
      state.passedIds.push(level.id);
      saveProgress(state.passedIds);
    }
    state.lastScore = score;
    state.lastLevelId = level.id;
    state.lastResult = "win";
    state.screen = "win";
  }

  /** 游戏失败时调用（GameClient 触发）。 */
  function failCurrent() {
    state.lastScore = 0;
    state.lastLevelId = currentLevel.value.id;
    state.lastResult = "fail";
    state.screen = "summary";
  }

  /** 恭喜页点「确定」→ 汇总页。 */
  function toSummary() {
    state.screen = "summary";
  }

  /** 通关弹窗点「Continue」→ 下一关要求预览（自然推进）。 */
  function toNextLevel() {
    state.playLevelId = null;
    state.screen = "intro";
  }

  /** 通关弹窗点「再玩一次」→ 重放当前关卡要求预览。 */
  function replayCurrent() {
    state.playLevelId = state.lastLevelId;
    state.screen = "intro";
  }

  /** 汇总页点「继续 / 重试」→ 当前关卡要求预览。 */
  function toIntro() {
    state.screen = "intro";
  }

  /** 关卡预览 / 首页点「Exit」→ 返回游戏首页。 */
  function toHome() {
    state.screen = "home";
  }

  /** 首页点「新的开始」→ 清空进度，从第一关开始。 */
  function newGame() {
    state.passedIds = [];
    saveProgress(state.passedIds);
    state.playLevelId = null;
    state.screen = "intro";
  }

  /** 首页点「继续游戏」→ 自然推进到第一个未通过的关卡；全部通关则直接进入恭喜画面。 */
  function continueGame() {
    state.playLevelId = null;
    if (state.passedIds.length >= TOTAL_LEVELS) {
      // 已通关全部关卡：定格在通关恭喜画面，等玩家点 Finish / Replay
      state.lastResult = "win";
      state.lastLevelId = TOTAL_LEVELS;
      state.lastScore = 0;
      state.screen = "win";
    } else {
      state.screen = "intro";
    }
  }

  /** 要求预览点「开始」或倒计时结束 → 进入游戏。 */
  function startCurrent() {
    state.screen = "playing";
  }

  return {
    state,
    currentLevel,
    allCleared,
    isPassed,
    isUnlocked,
    completeCurrent,
    failCurrent,
    toSummary,
    toNextLevel,
    replayCurrent,
    toIntro,
    toHome,
    newGame,
    continueGame,
    startCurrent,
  };
}
