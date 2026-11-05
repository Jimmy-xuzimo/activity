const replacements: [RegExp, string][] = [
[/条记录。缩放时间轴探索不同日期，点击活动圆点查看详情。/g,' records. Zoom through time and select activity markers for details.'],

[/Archive \/ 完整月份列表/g,'Monthly archive'],
[/私有项目/g,'Private project'],[/六 (\d)/g,'Sat $1'],[/一 (\d)/g,'Mon $1'],[/二 (\d)/g,'Tue $1'],[/三 (\d)/g,'Wed $1'],[/四 (\d)/g,'Thu $1'],[/五 (\d)/g,'Fri $1'],[/日 (\d)/g,'Sun $1'],

[/提交只统计自有仓库的默认分支，/g,'Commits on default branches of owned repositories: '],
[/行数口径为新增减删除，净增/g,'Lines added minus lines removed; net: '],
[/小时自动抓取一次 GitHub 数据并重新构建页面。当前快照生成于/g,' hours. The page is rebuilt after sync. Snapshot: '],
[/每 /g,'Sync interval: '],[/，最近一条活动是/g,'; latest activity: '],
[/页面是静态快照，不会在浏览器里实时请求 GitHub。若快照超过 24 小时未更新，\s*这里会显示为告警状态。/g,'This is a static snapshot. A warning appears when it is more than 24 hours old.'],
[/最密集的一格是周/g,'Peak hour: '],[/累计/g,'total '],[/其他/g,'Other '],[/种/g,' languages'],[/条记录/g,' records'],[/个公开仓库/g,' public repositories'],[/次。/g,'.'],[/ 行。/g,' lines.'],[/核心数据速览/g,'Key statistics'],[/核心数据/g,'Key statistics'],[/章节导航/g,'Section navigation'],[/切换深浅色模式/g,'Switch theme'],[/。/g,'.'],[/，/g,', '],

[/GITHUB 编年史/g,'GITHUB CHRONICLE'],[/12H 自动同步/g,'SYNC EVERY 12H'],[/切换主题/g,'Theme'],
[/记录每一次/g,'A record of'],[/创造与生长。/g,'creating and growing.'],
[/从 2025 年 11 月 21 日的第一行提交，到今天为止的每一次 push、每一个版本、每一条 PR/g,'From the first commit on November 21, 2025, to every push, release, and pull request since'],[/全部按时间顺序摊开在这里/g,'laid out here in chronological order'],[/没有精选，也不做修饰。/g,'An unfiltered record.'],
[/全部活动/g,'All activity'],[/自有仓库默认分支/g,'Default branches of owned repositories'],[/次提交/g,' commits'],[/个仓库/g,' repositories'],[/个公开/g,' public'],[/个私有（匿名计入）/g,' private (anonymized)'],[/个版本发布/g,' releases'],[/正式版与预发布一并计入/g,'Including releases and prereleases'],[/行新增/g,' lines added'],[/删除/g,'Removed '],[/净增/g,'Net '],
[/编年史/g,'Chronicle'],[/热力/g,'Heatmap'],[/节奏/g,'Cadence'],[/仓库志/g,'Repositories'],[/尾声/g,'About'],
[/按北京时间顺序排列的/g,'In Beijing time, '],[/条记录。点击月份展开详情，同一天的多次提交也可以展开。/g,' records. Select a month to expand its activity; grouped commits can also be expanded.'],[/条活动/g,' activities'],[/提交仅覆盖自有仓库的默认分支；向第三方仓库提交的 PR 以 PR 事件单独记录，其分支提交不重复计入。私有仓库只保留事件类型与行数，不展示名称与内容。/g,'Commits cover default branches of owned repositories. Pull requests to other repositories are counted separately. Private projects are anonymized.'],
[/天里，有/g,' days, '],[/天留下过记录。每一格是一天，颜色深浅对应当天的活动条数。/g,' days had activity. Each square represents one day and its contribution count.'],[/近/g,'last '],[/单日最多/g,'Peak day: '],[/次贡献/g,' contributions'],[/最长连续/g,'Longest streak'],[/左右滑动查看完整一年 →/g,'Swipe to see the full year →'],[/贡献数来自 GitHub 的 contributions collection，包含提交、PR、Issue 与代码评审。快照生成于/g,'Contribution counts come from GitHub and include commits, PRs, issues and reviews. Snapshot: '],[/月度数据/g,'Monthly data'],[/月份/g,'Month'],[/活跃天/g,'Active days'],[/记录/g,'Records'],[/新增/g,'Added'],[/提交/g,'Commits'],
[/不是均匀的滴答声。某些月份几乎停摆，某些夜晚一口气推完整个功能 —— 这张图保留这种不均匀。/g,'Activity comes in waves. These charts show its changing rhythm over time.'],[/柱形为每月提交 · 细线为累计/g,'Bars: monthly commits · line: cumulative'],[/左轴：每月提交量 · 右轴：累计提交量 · 最后一个月份为快照当月的进行中数据/g,'Left: monthly commits · right: cumulative · current month is in progress'],[/按仓库字节数/g,'By repository bytes'],[/北京时间/g,'Beijing time'],[/最忙的月份/g,'Busiest month'],[/当前连续/g,'Current streak'],[/单日峰值/g,'Peak day'],[/活跃日/g,'Active days'],[/平均/g,'average'],
[/个公开仓库，按提交量排序。点开任意一张卡片，能看到它的语言构成、版本与全部数字。/g,' public repositories, sorted by commits. Select a card for languages, releases and statistics.'],[/没有填写描述。/g,'No description provided.'],[/匿名/g,'Anonymous'],[/个私有项目/g,' private projects'],[/名称、描述与链接不公开。这里只保留匿名的活动痕迹 —— 每一次提交、每一个版本依然计入总数，但看不出是哪一个项目。/g,'Names, descriptions and links remain private. Their activity is included anonymously.'],[/仅统计活动/g,'Activity only'],[/个版本/g,' releases'],[/私有项目在数据管道里以哈希键替代仓库名，事件写出前会经过隐私校验：私有仓库名一旦出现在任何 JSON 字段，同步任务即失败并且不写入。/g,'Private repository names are replaced with hashed keys. Privacy checks run before data is written.'],
[/这是一份自动生成的档案，不是作品集。它记录发生了什么，也记录哪些东西没有被记录。/g,'An automatically generated archive, including the limits of what it records.'],[/数据口径/g,'Coverage'],[/同步正常/g,'Snapshot current'],[/快照已过期/g,'Snapshot outdated'],[/同步/g,'Sync'],[/技术/g,'Technology'],[/链接/g,'Links'],[/分钟前/g,' minutes ago'],[/小时前/g,' hours ago'],[/天前/g,' days ago'],[/小时/g,' hours'],[/分钟/g,' minutes'],[/天/g,' days'],[/分/g,' min'],
[/向第三方仓库提交的 PR 单独记录，其分支提交不重复计入。/g,'Pull requests to third-party repositories are counted separately.'],[/机器人提交（github-actions\[bot\]）与数据同步自身的提交已排除。/g,'Bot commits and data synchronization commits are excluded.'],[/时间统一换算为北京时间（UTC\+8）。/g,'All times use Beijing time (UTC+8).'],[/Astro 静态生成，无客户端框架。/g,'Statically generated with Astro.'],[/GitHub Actions 定时抓取 \+ GitHub Pages 部署。/g,'Scheduled with GitHub Actions and deployed with GitHub Pages.'],[/无统计脚本，无第三方追踪。/g,'No analytics or third-party tracking.'],[/移动端、平板与桌面共用同一套版式。/g,'Responsive on phones, tablets and desktops.'],[/本站源码 · 同步脚本/g,'Source and sync scripts'],[/回到开头/g,'Back to top'],[/数据截至/g,'Data through'],[/条/g,' items'],
[/还没有发布过版本。/g,'No releases yet.'],[/已归档/g,'Archived'],[/fork 自其他项目/g,'Forked from another project'],[/关闭 \/ ESC/g,'Close / ESC'],[/没有可统计的语言。/g,'No language data.'],[/在 GitHub 打开/g,'Open on GitHub'],[/主页/g,'Homepage'],[/创建于/g,'Created '],[/最近 push/g,'Last push '],[/周日/g,'Sun'],[/周一/g,'Mon'],[/周二/g,'Tue'],[/周三/g,'Wed'],[/周四/g,'Thu'],[/周五/g,'Fri'],[/周六/g,'Sat'],
[/没有记录/g,'No activity'],[/仓库/g,'Repository'],[/版本/g,'Release'],[/评论/g,'Comment'],[/合并/g,'Merged']
];
const originals = new WeakMap<Text, string>();
let lang = 'en';
try { lang = localStorage.getItem('activity-language') === 'zh' ? 'zh' : 'en'; } catch {}
function translate(root: Node) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  for (const node of nodes) {
    const parent = node.parentElement;
    if (!parent || parent.closest('.time-explorer, script, style, .event__title, .repo-card__desc, .modal__desc, .commit-row__msg, .commit-summary__preview, .modal__release')) { if (node.data.trim() !== '没有填写描述。') continue; }
    const original = originals.get(node) ?? node.data;
    if (!originals.has(node)) originals.set(node, original);
    let value = original; if (/^[一二三四五六日]$/.test(original.trim())) { const names:Record<string,string>={一:'Mon',二:'Tue',三:'Wed',四:'Thu',五:'Fri',六:'Sat',日:'Sun'}; if (lang === 'en') { node.data=names[original.trim()]; continue; } }
    if (lang === 'en') for (const [pattern, replacement] of [...replacements].sort((a,b) => b[0].source.length - a[0].source.length)) value = value.replace(pattern, replacement);
    if (node.data !== value) node.data = value;
  }
}
function apply() {
  document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN';
  const button = document.querySelector<HTMLButtonElement>('.language-toggle');
  if (button) { button.innerHTML = '<span>EN</span><span>中</span>'; button.dataset.language = lang; button.setAttribute('aria-label', lang === 'en' ? 'Switch to Chinese' : 'Switch to English'); }
  translate(document.body);
}
document.querySelector('.language-toggle')?.addEventListener('click', () => {
  lang = lang === 'en' ? 'zh' : 'en';
  try { localStorage.setItem('activity-language', lang); } catch {}
  apply();
});
apply();
const modal = document.getElementById('modal-body');
if (modal) new MutationObserver(() => translate(modal)).observe(modal, {childList:true, subtree:true});
