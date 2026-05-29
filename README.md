# FishReader

> 一个**对话式 UI 的本地 TXT 小说阅读器**,装在 VSCode 里。把"读小说"变成"和 AI 对话"的样子:深色对话流、`> user` / `● assistant`、流式输出、代码 diff、状态栏——专注阅读,需要时一键切换到"工作态"。

纯本地、不联网、不接在线书源、不调用任何 LLM。你的书只在你自己电脑上。

---

## ✨ 功能特性

- **对话式阅读界面**:视觉对齐 Claude Code 风格的深色对话流,跟随 VSCode 主题(深色 / 浅色 / 高对比度自动适配)。
- **整章输出 + 智能分页**:一条命令输出一整章;识别不到章节标题的书会按字数自动分页。
- **智能合并细碎段落**:对话体小说"一行一段"的碎段落会自动合并成可读的整块。
- **章节解析**:支持 `第X章/节/卷/回/篇`、`Chapter N`、`楔子`、`序章`、`番外`,正则可自定义。
- **多编码支持**:自动识别 UTF-8 / GBK / GB18030。
- **斜杠命令系统**:输入 `/` 唤起命令面板,模糊匹配、↑↓ 选择、Tab/Enter 补全。
- **命令历史**:输入框按 ↑ / ↓ 回溯历史命令,一个 ↑ + Enter 即可重复翻页。
- **书库 / 进度管理**:侧边栏列出所有读过的书(书名 + 进度条),点击即恢复上次位置;进度自动持久化,重启续读。
- **书签 / 搜索 / 跳转**:全文搜索、按章跳转、命名书签。
- **工作态切换(Boss Mode)**:一键(或被动触发)把界面切成"看似在用 AI 写代码"的编码对话,内容根据你当前打开的真实代码文件生成。

---

## 🚀 快速开始

1. 安装后,点左侧活动栏的 **◆ FishReader** 图标,打开侧边栏。
2. 点顶部 **＋ 新建会话**,会在编辑器区打开一个阅读面板(tab)。
3. 在输入框输入 `/init <txt 文件路径>` 关联一本书(也可以直接把 txt 文件**拖进面板**)。
4. 输入 `/next`(或按 ↑ 调出再回车)开始一章一章地读。

之后这本书会出现在侧边栏书库里,下次点一下就能从上次位置接着读。

---

## 💬 命令列表

输入 `/` 会弹出命令面板。命令支持中文名与英文别名,效果一致。

| 命令 | 别名 | 说明 |
|---|---|---|
| `/init <路径>` | `/open` `/load` | 关联一本本地 txt 文件 |
| `/toc` | `/目录` | 查看章节列表(可点击跳转) |
| `/next` | `/n` `/下一页` `/下一章` | 下一章(整章输出) |
| `/prev` | `/p` `/上一页` `/上一章` | 上一章 |
| `/jump <章节号>` | `/跳转` `/goto` | 跳到第 N 章 |
| `/search <关键词>` | `/搜索` `/find` | 全文搜索(结果可点击跳转) |
| `/bookmark [add 名称\|list\|jump 序号]` | `/书签` `/bm` | 书签:添加 / 列表 / 跳转 |
| `/history [N]` | `/历史` `/switch` | 切换最近读过的书 |
| `/settings` | `/设置` `/config` | 打开配置面板 |
| `/boss` | `/老板` | 手动进入工作态 |
| `/resume` | `/恢复` | 退出工作态,回到阅读 |
| `/help` | `/帮助` `/?` | 查看全部命令 |

**快捷键**(均可在 VSCode 键盘快捷方式里自定义):

| 快捷键 | 命令 |
|---|---|
| `Cmd/Ctrl+Shift+B` | 切换工作态(开 / 关) |
| `Alt+N` | 下一章 |
| `Alt+P` | 上一章 |

---

## 📖 阅读体验

- `/next` 一次输出**一整章**,光标(滚动条)固定在这一页的开头,你自己往下滚着读,节奏自己掌握。
- 章节之间穿插的 `● assistant · edited xxx.ts` + 代码 diff 是伪装效果,可在配置里关闭或调频率。
- 进度按字符级保存,关掉 VSCode 重开也能接着读。

---

## 🕶 工作态切换(Boss Mode)

一键把面板从"小说"瞬间切成"看似真实的编码对话"——标题变 `Claude`、隐藏书名、状态延续,内容根据你**当前打开的代码文件**(类名 / 函数名 / import / 真实代码片段)即时生成。

**进入方式**(被动触发可在设置里勾选):

| 方式 | 说明 |
|---|---|
| 快捷键 `Cmd/Ctrl+Shift+B` | 始终可用 |
| 输入框右下角 `</>` 按钮 / `/boss` | 始终可用 |
| 窗口失焦(`blur`) | 切到别的应用 N 秒后(可配,可关) |
| 鼠标离开面板(`mouseLeave`) | 鼠标移出面板 N 秒后(可配,可关) |
| 切到代码 tab(`editorFocus`) | 点开代码编辑器时(可配,默认关) |

**退出方式**:为了安全,**默认只能手动退出**——快捷键 / `</>` 按钮 / `/resume`。工作态下命令面板只放行 `/resume`,其它命令隐藏,绝不会误操作露出小说。(若想"鼠标移回 / 窗口重新聚焦自动退出",把 `bossMode.autoExit` 设为 `true`。)

---

## ⚙️ 配置项(`fishReader.*`)

在 VSCode 设置里搜 `FishReader`。

| 配置 | 默认 | 说明 |
|---|---|---|
| `charsPerPage` | `300` | 每页字数(仅用于页码显示) |
| `encoding` | `auto` | 文件编码:auto / utf-8 / gbk / gb18030 |
| `chapterRegex` | (见设置) | 章节标题匹配正则 |
| `maxChapterChars` | `3000` | 超长章节 / 无标题书的虚拟分页长度,`0` 关闭 |
| `mergeParagraphs` | `true` | 智能合并细碎段落 |
| `paragraphTargetChars` | `120` | 合并段落的目标字数 |
| `fakeThinkingSpeed` | `normal` | 流式速度:slow / normal / fast / off |
| `fakeDiff.enabled` | `true` | 是否在段落间插入假 diff |
| `fakeDiff.frequency` | `0.7` | 假 diff 出现概率 0~1 |
| `fakeDiff.language` | `auto` | 假 diff 语言,auto 跟随 workspace |
| `fakeDiff.snippetSource` | `workspace` | diff 文件名来源:workspace / builtin |
| `bossMode.triggers` | `["blur","mouseLeave"]` | 启用哪些被动触发:blur / mouseLeave / editorFocus |
| `bossMode.mouseLeaveDelay` | `1000` | 鼠标离开多久触发(ms) |
| `bossMode.blurDelay` | `5000` | 窗口失焦多久触发(ms) |
| `bossMode.autoExit` | `false` | 是否允许被动方式自动退出工作态 |
| `bossMode.readActiveTab` | `true` | 读当前 tab 生成伪装内容 |
| `bossMode.scanWorkspace` | `true` | 启动时扫描 workspace 真实文件名 |

---

## 🧩 两种打开方式

- **侧边栏(书库列表)**:活动栏 ◆ 图标 → 新建会话 / 搜索 / 书籍列表。
- **编辑器 tab(阅读面板)**:像普通编辑器标签一样,可拖到任意分组、左右分屏、独立窗口。

---

## 🛠 本地开发 / 构建

```bash
npm install      # 安装依赖
npm run build    # 产出 dist/(extension.js / webview.js / library.js / styles.css)
npm run watch    # 开发时增量构建
```

在 VSCode 里打开本项目按 **F5** 启动扩展开发宿主调试。


## 📄 License

MIT
