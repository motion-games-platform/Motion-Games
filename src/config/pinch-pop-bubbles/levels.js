// Motion Bubble Shooter 关卡配置（内部目录名 pinch-pop-bubbles）
// 在这里调整关卡数量、每一关的难易程度和过关要求。

// 字段说明：
//   bubbleCount     泡泡总数
//   clusterCount    泡泡分成几堆（越小越集中，越容易）
//   sameColorRatio  同色相邻占比（0~1，越高越容易，同色挨在一起好消除）
//   colorCount      颜色种类（3 容易 / 4 难）
//   passScore       过关所需分数
//   passMode        "OR"（满足「分数达标」或「全部清空」其一即过关） / "AND"（两者都要满足）
//   aimLineLength   方向线可见长度（内容高度的比例，越长越容易瞄准）

// 分数规则：
//   消除泡泡  每消除 1 个泡泡（3 个及以上同色相连，同时消除） +100 分
//   掉落泡泡  每掉落 1 个泡泡（消除后失去顶部支撑的悬浮泡泡） +200 分

export const LEVELS = [
  { id: 1, name: "Level 1", bubbleCount: 30, clusterCount: 2, sameColorRatio: 0.8, colorCount: 2, passScore: 720, passMode: "OR", aimLineLength: 1.0 },
  { id: 2, name: "Level 2", bubbleCount: 50, clusterCount: 3, sameColorRatio: 0.6, colorCount: 3, passScore: 2000, passMode: "OR", aimLineLength: 0.95 },
  { id: 3, name: "Level 3", bubbleCount: 70, clusterCount: 3, sameColorRatio: 0.5, colorCount: 3, passScore: 3920, passMode: "OR", aimLineLength: 0.9 },
  { id: 4, name: "Level 4", bubbleCount: 90, clusterCount: 4, sameColorRatio: 0.4, colorCount: 3, passScore: 6480, passMode: "OR", aimLineLength: 0.85 },
  { id: 5, name: "Level 5", bubbleCount: 110, clusterCount: 4, sameColorRatio: 0.65, colorCount: 3, passScore: 9680, passMode: "OR", aimLineLength: 0.8 },
  { id: 6, name: "Level 6", bubbleCount: 130, clusterCount: 4, sameColorRatio: 0.6, colorCount: 3, passScore: 13520, passMode: "OR", aimLineLength: 0.78 },
  { id: 7, name: "Level 7", bubbleCount: 150, clusterCount: 4, sameColorRatio: 0.55, colorCount: 4, passScore: 18000, passMode: "OR", aimLineLength: 0.75 },
  { id: 8, name: "Level 8", bubbleCount: 170, clusterCount: 4, sameColorRatio: 0.5, colorCount: 4, passScore: 23120, passMode: "OR", aimLineLength: 0.72 },
  { id: 9, name: "Level 9", bubbleCount: 190, clusterCount: 4, sameColorRatio: 0.45, colorCount: 4, passScore: 28880, passMode: "OR", aimLineLength: 0.7 },
  { id: 10, name: "Level 10", bubbleCount: 210, clusterCount: 4, sameColorRatio: 0.4, colorCount: 4, passScore: 35280, passMode: "OR", aimLineLength: 0.68 },
  { id: 11, name: "Level 11", bubbleCount: 140, clusterCount: 4, sameColorRatio: 0.1, colorCount: 4, passScore: 12000, passMode: "AND", aimLineLength: 0.65 },
  { id: 12, name: "Level 12", bubbleCount: 250, clusterCount: 4, sameColorRatio: 0.35, colorCount: 4, passScore: 50000, passMode: "AND", aimLineLength: 0.62 },
  { id: 13, name: "Level 13", bubbleCount: 270, clusterCount: 4, sameColorRatio: 0.3, colorCount: 4, passScore: 58320, passMode: "AND", aimLineLength: 0.6 },
];

export const TOTAL_LEVELS = LEVELS.length;
