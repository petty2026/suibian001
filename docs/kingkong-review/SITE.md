# 金刚 H5 测试地址（固定记录）

> 后续测试统一使用以下地址，勿改用 staging 域名。

## 主入口

| 用途 | URL |
|------|-----|
| **H5 根地址** | https://kingkong.ac/mobile.html |
| **游戏首页（默认测这个）** | https://kingkong.ac/mobile.html#/base/game |
| **登录页** | https://kingkong.ac/mobile.html#/login |
| **社区 Tab** | https://kingkong.ac/mobile.html#/base/community |
| **会话 Tab** | https://kingkong.ac/mobile.html#/base/service |
| **我的 Tab** | https://kingkong.ac/mobile.html#/base/my |
| **账单** | https://kingkong.ac/mobile.html#/bill |
| **语言设置** | https://kingkong.ac/mobile.html#/setting/language |

## 金刚牌局 · 大厅（子应用）

从 H5 首页进入路径：

1. 登录账号
2. `#/base/game` → 保持 **社交模式**
3. 二级分类点 **牌局**
4. 点击游戏卡片（牛牛 / 炸金花 / 三公 / 十三水）

进入后路由变为 `#/miniapp?url=...`，内嵌 iframe：

- 加载页：`prod-broadgame-client.api987.com/vue/#/loading?...&subGameKey=NiuNiu`
- **大厅页（好友组局）**：`prod-broadgame-client.api987.com/vue/#/join?gameType=2&jumpType=friend`
- 若账号有未完成牌桌，会自动跳：`#/detail?room=904949&gameType=1`

> 大厅 UI 为 Cocos Canvas，自动化截图可能全黑，但路由可验证已进入。

## 不可用 / 勿用

- `go-h5-app.comstg.com` — Cloudflare 403，无法访问

## 测试约定

- 界面语言：**简体中文**（`#/setting/language` → 简体中文）
- 截图比例：**780×1688**，Figma 内用 **FIT** 完整展示，不裁剪
- Tab 文案保持英文：**Home / Community / Conversation / My**（描述里写 Tab，不译成「标签页」）

## 关联产出

- Figma 汇总：https://www.figma.com/design/T8PcoyyXrzMoNM5YFlrTJU?node-id=15-2
- 交互报告：`OPTIMIZATION_REPORT.md`
