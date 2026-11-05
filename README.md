# GitHub Chronicle · activity

一个人的 GitHub 活动档案。静态生成，无客户端框架，无第三方统计。

- 在线站点：<https://jimmy-xuzimo.github.io/activity/>
- 数据仓库：<https://github.com/Jimmy-xuzimo/activity>

## 结构

```
data/            抓取产物（已提交，是站点的数据源）
  events.json    append-only 事件流，唯一真相
  repos.json     公开仓库档案
  calendar.json  365 天贡献日历
  aggregates.json 全部聚合指标（由事件派生）
  meta.json      快照元信息与口径声明
  profile.json   账号基本信息
  state.json     增量同步游标
scripts/
  sync.ts       抓取 + 去重 + 聚合 + 隐私校验，缺失 PAT 时以退出码 2 失败
  validate.ts   JSON 结构与隐私校验
  lib/          GitHub REST/GraphQL、HTTP、构建逻辑
src/
  components/   七个分区：Prologue / Numbers / Chronicle / Heatmap / Cadence / Atlas / Colophon
  styles/       设计 token、排版、动效
public/         字体子集（Noto Serif SC、JetBrains Mono）、OG 图
```

`data/events.json` 只追加。其余文件都可以由它重新派生——删除某个派生文件后再跑一次同步即可重建。

## 本地预览

```powershell
npm install
npm run build
npm run preview     # http://localhost:4321/activity/
```

开发模式用 `npm run dev`（同样带 `/activity/` 前缀，需要在 `http://localhost:4321/activity/` 打开）。

## 数据同步

```powershell
$env:SYNC_TOKEN = "<你的只读 PAT>"   # PowerShell；不要写进任何文件
npm run sync        # 增量：只拉取游标之后的活动
npm run backfill    # 全量：忽略游标重建整个事件流
npm run validate    # 校验 JSON 与隐私
```

同步完成后需要重新 `npm run build` 才能看到新数据。

## 部署

GitHub Pages，Source 设为 **GitHub Actions**。

| workflow | 触发 | 作用 |
| --- | --- | --- |
| `.github/workflows/deploy.yml` | push 到 `main`、手动 | 校验 → 构建 → 部署 `dist` |
| `.github/workflows/sync.yml` | 每 12 小时（`17 */12 * * *`）、手动 | 抓取 → 校验 → 构建 → 提交 `data/` → 部署 |

同步任务用 `GITHUB_TOKEN` 提交数据，这种提交不会触发新的 workflow，所以它在同一个作业里自行完成部署。

GitHub 的定时任务（cron）是 best-effort 的，实际触发时间可能比 `:17` 晚几分钟到十几分钟；仓库 60 天无活动时 GitHub 会自动暂停定时任务。

## 需要你手动完成的一步：配置 `SYNC_TOKEN`

`GITHUB_TOKEN` 只能访问当前仓库，读不到账号下的其他仓库，因此同步需要一个**细粒度只读个人访问令牌**。

1. GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token
2. **Repository access**：选择 *All repositories*（必须包含你的私有仓库，否则私有部分的活动无法统计）
3. **Permissions**（全部设为 Read-only，不要给写权限）：
   - `Contents: Read-only`
   - `Metadata: Read-only`（强制项）
   - `Issues: Read-only`
   - `Pull requests: Read-only`
4. 设置合理的过期时间，到期后回来更新 secret
5. 仓库 → Settings → Secrets and variables → Actions → New repository secret
   - Name：`SYNC_TOKEN`
   - Value：刚生成的令牌

没有配置时，`sync.yml` 的 “Check SYNC_TOKEN” 步骤会**直接失败**并在日志里写明需要什么权限；`scripts/sync.ts` 本身也会以退出码 2 退出。两种情况都不会写入空数据，`data/` 保留上一份快照，站点继续显示旧数据。

令牌只存在于仓库 Secret 和 Actions 运行时的环境变量里，没有进入代码、前端产物或提交历史。

## 数据口径

- **提交**：只统计 `Jimmy-xuzimo` 本人作为作者的提交，只取各仓库**默认分支**；非默认分支上的提交不计入。
- **排除**：`github-actions[bot]` 的提交，以及本仓库 `chore(data): sync` 这类数据同步提交。
- **行数**：新增与删除分别累加，净增量为差值。
- **时区**：所有按天/按小时的统计统一换算为北京时间（UTC+8）。
- **贡献热力图**：来自 GitHub 的 contributions collection（近 365 天），包含提交、PR、Issue 与代码评审，与下面的提交数口径不同，因此两者不必相等。
- **私有仓库**：只记录“有活动”——事件里 `repo` 为 `null`、显示名为「私有项目」、没有链接；匿名键取 `sha256(salt + owner/name)` 前 8 位。仓库名与内容不会进入任何 JSON。
- **Releases**：详情弹窗只列最近 5 条，总数以 `Releases` 统计为准（显示为 `5 / 19` 这种形式）。
- **PR / Issue / 评论**：通过搜索接口获取，包含私有仓库中你有权限看到的部分，同样匿名化后计入。

### 已知限制

- 非默认分支的提交、被 force-push 抹掉的提交、已删除仓库的历史活动无法回溯。
- 定时同步是 best-effort，最长可能延迟几十分钟；页面上的“同步状态”会按快照时间显示是否滞后。
- 私有仓库的活动无法给出仓库级详情（语言、版本、行数），页面只做汇总。
- 站点是静态快照，不会在浏览器里实时请求 GitHub。

## 隐私校验

`scripts/validate.ts` 在写入前检查三件事，任一失败即中止、不写文件：

1. 私有仓库名出现在任何序列化字段 → 报错（`sync.ts` 会把当前私有仓库名列表传进去）。
2. `state.json` 的游标键不属于已发布的公开仓库 → 报错。
3. 出现形如 `ghp_…` / `github_pat_…` 的令牌字符串 → 报错。

## 前端说明

- 纯 HTML/CSS/JS，Astro 静态输出；`html.js` 前缀保证禁用 JS 时内容依然可见。
- 滚动显现、数字递增用 `IntersectionObserver`；热力图与月度柱状图为自绘 SVG，没有引入图表库。
- 遵循 `prefers-reduced-motion`：关闭动效时所有内容直接呈现。
- 仅自托管两份字体子集，没有外部 CDN 请求。
