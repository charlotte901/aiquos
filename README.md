# AIQUOS

按提供的 1536 × 1024 参考图制作的可交互网页。

## 如何使用

- 原内容编辑弹窗、屏幕编辑按钮及右侧编辑星星已按要求移除。
- 首页右上角 **登录** 在 900ms 内将现有立方体转为居中的单面屏幕；点击时立即停止全部案例动画，屏幕变为浅粉色。转正后显示账号、密码和登录按钮。
- 表单为免验证演示：留空或填写内容都可点击 **登录** 进入 CHOOSE! 功能选择页。密码可显示/隐藏；提交清空字段，不读取、保存或发送账号密码，没有真实身份验证。
- CHOOSE! 页提供测试闯关 / 报告查询 / 个人中心三个入口。**测试闯关** 进入 TEST! 测评选择页；**报告查询** 展示真实作答生成的最新能力报告和历史记录；**个人中心** 的测评记录可打开对应的已完成报告。
- 登录 → 选择页为三横带分条抽出转场（接缝落在卡片留白处，外两条同向、中间反向）；选择页 ↔ 测评页为整卡飞行转场（旧卡飞出、新卡错峰飞入，往返方向相反）；**返回首页** 反向分条收回，落定后立方体再转回案例播放。减少动态偏好下全部直接切换。
- 首页 **AI测评** 进入演示登录流程。综合测评使用本地题库逐题自适应出题，并由独立评分核心生成六维能力结果；客观题测评使用一轮固定的 25 题试卷。
- 下方四个圆点与右下角箭头切换真实案例，默认每 15 秒自动轮换。暂停按钮只暂停轮换，案例动画继续播放；视频默认静音，可点击屏幕里的声音按钮开启解说。
- 冷启动时先并行准备当前三块屏幕，三者均有实际视频帧/场景帧后才揭开首页；下一项在此之后才开始预热。后续切换始终保留完整旧画面，直到真实场景帧/解码后的视频帧就绪，因此不会切到黑屏。每面最多两个内容层，预加载场景完成两帧后停止绘制，隐藏视频保持暂停。个别嵌入式 webview 在面板被遮挡时会停发渲染帧，场景帧永远无法到达；此时最多 8 秒后照常揭幕。

## 立方体旋转与第二屏

- `/#home`：首页；`/#login`：单面屏幕内的登录表单；`/#choose`：CHOOSE! 功能选择页；`/#assessments`：黑底测评选择页。
- 登录转场由 three.js 把外壳渲染为**单个连续 3D 网格**：`cube3d.js` 提供纯数学（与旧 2D 投影逐点一致、静止时经顶点校准复刻原图照片、棱线全程共享不断裂），`cube-scene.js` 负责光栅化；三块屏幕仍是实时 DOM，每帧由同一投影驱动，不会与外壳脱节。WebGL 不可用时自动退回原 DOM 投影路径。结束时顶部、左侧面积归零，右侧屏幕完全正视；外壳材质直接从原图反投影获取，并按圆角外轮廓去除底色/底座残片。
- 转动与居中使用相同的 900ms 缓出节奏；旋转期间不运行任何案例。减少动态效果偏好下直接呈现正面。
- 顶部 **TEST!** 字标由 `TestWordmark.jsx` 保留 `test-wordmark-reference.png` 的字形并去除深色底。四种测评都进入各自的五关地图；综合测评与客观题测评每关五题，共 25 题，提交后显示反馈、正确答案和解析。综合测评的选题状态与评分结果分别保存，报告分数不参与选题。测评页 **返回选择** 回到 CHOOSE! 页。
- 第二张源图尺寸为 1672 × 941。`src/assessment-layout.js` 管理四张卡片的裁切和文字元数据；`AssessmentHub.jsx` 将原图美术放入真实可选按钮。当前可见卡片文字属于原图素材，后续更换时需要同步替换对应美术和文字元数据。
- CHOOSE! 页源图尺寸为 1822 × 863。`src/choose-layout.js` 管理三张卡片与字标的裁切；`ChooseHub.jsx` 复用 `SourceCrop` 与 `TestWordmark`，交互与测评页卡片一致。
- 登录 → 选择页、选择页 ↔ 测评页、返回首页的转场由 `split-transition.js`（三横带，接缝取自卡片留白 `measureAssessmentBands`）与 `card-transition.js`（整卡飞出/飞入）实现：转场冻结当前视图（含 iframe 场景帧），在新视图挂载后逐条/逐卡播放动画，结束才揭幕，全程不重复挂载 WebGL 场景。
- `LoginForm.jsx` 提供本地演示表单；屏幕内层抵消透视画布缩放，输入文字保持实际 16px、操作区域保持 44px。较小屏幕使用紧凑布局，极短窗口可在屏幕内部滚动。

## 还原方式与范围

当前产品定位为 AI 使用能力测试。左侧文案为「AI 时代，你的实力到哪一步？」及「用真实任务，检验你的 AI 能力。从精准提问，到把想法变成作品。」屏幕说明保留标题与副标题，改为小面积的无边框半透明标注，不再覆盖整条画面。

- AIQUOS 是参考图中的定制字标，不是完整可安装字体。`Brand.jsx` 从原图读取字形并去除粉色底色，保留六个字母的轮廓与弧形排列。
- 显示器外壳保留原始图片质感。三面可沿设计路径旋转至正面，但没有背面材质，不支持任意角度拖动。
- 三块内容层是独立 DOM 平面，使用四角单应性投影贴合屏幕，可以容纳图片、视频和任意 React 组件。
- 导航、按钮、正文、轮播控件、弹窗均为网页元素，而不是整页截图。底部统计栏与左下角 10k+ 区块已按要求移除。
- 页面已做窄屏适配。参考图未提供手机设计，手机版按相同视觉语言重新排列。
- 本项目没有真实账号、收费、测评结果后端或云同步。对话与实操任务保留既有服务端 AI 代理接口；本次六维评分只覆盖综合测评与客观题测评，在浏览器内计算。

## 六维评分、恢复与历史报告

综合测评从中等难度开始，以既有 `correct / partial / wrong` 反馈驱动逐题自适应路由，兼顾维度覆盖、题型变化与整轮不重复；跨关只进行一次向中等难度回归。评分核心独立读取已提交题目的难度、维度与精确得分率，不把评分、评级或雷达值反馈给自适应控制器。

客观题测评从 120 道正式题库中按种子一次生成固定试卷，保存全部题目 ID 和种子；答题表现不会更换剩余题目，刷新后恢复原试卷。每轮 25 题不重复、覆盖全部六维，蓝图为：

| 关卡 | 低难度 | 中难度 | 高难度 |
| --- | ---: | ---: | ---: |
| 第一关 | 5 | 0 | 0 |
| 第二关 | 2 | 3 | 0 |
| 第三关 | 0 | 5 | 0 |
| 第四关 | 0 | 2 | 3 |
| 第五关 | 0 | 0 | 5 |
| 合计 | 7 | 10 | 8 |

报告依次显示 AI基础认知（D1）、提示词工程（D2）、AI工具使用（D3）、AI结果评估与优化（D4）、人机协同解决问题（D5）、AI伦理与合规（D6）。整数百分比是简化 Rasch 模型进行难度校正后的能力估计，不是答对题数占比。单选/判断完全正确计 1，否则计 0；多选有部分分和全选防猜规则。完整模型、输入约束与公式见 [评分模型](skills/aiquos-six-dimension-scoring/references/scoring-model.md)。

每次提交都会更新该轮的六维结果。尚无证据的维度显示“待测”；进行中只显示进度与已测维度，不显示正式总百分比或评级。25 题全部提交且六维都有证据后，完成结果取六维整数百分比的等权平均并四舍五入，评级为 S（90–100）、A（80–89）、B（70–79）、C（60–69）、D（0–59）。完成第五关流程后保存历史快照。

新一轮测评从第一题提交起覆盖最新报告；综合与客观结果分别保存、不合并。仅开始而未答题不会替换现有报告。完成时追加不可变历史快照，不重算或静默截断旧记录；历史支持全部/综合/客观筛选、侧边预览和完整弹窗。截图导出与“保存 PDF”（浏览器打印）使用当前查看的报告，历史弹窗使用所选快照。

每种计分测评最多保留一个未完成草稿。再次进入默认恢复，刷新可恢复题目、已选答案、反馈、故事位置及综合自适应状态。“重新开始本次测评”需在界面确认，只清除对应未完成草稿，保留另一类草稿与完成历史。

结果仅保存在当前浏览器、当前站点来源的 `localStorage`，没有账号或跨设备同步；更换浏览器、访问不同域名/端口或清理站点数据会使已有结果无法在当前页面访问，清理站点数据会删除本地记录。保存失败会保留当前内存结果并显示警告，但刷新可能丢失未保存内容。损坏数据会尝试备份到 `aiquos.assessment-state.corrupt.<timestamp>`；不兼容草稿保留并要求确认重开，不静默替换。

| 常量 | 当前值 | 位置 |
| --- | --- | --- |
| `STORAGE_KEY` | `aiquos.assessment-state.v1` | `src/assessment-storage.js` |
| `SCHEMA_VERSION` | `1` | `src/assessment-storage.js` |
| `SCORING_VERSION` | `1.0.0` | `skills/aiquos-six-dimension-scoring/scripts/scoring-core.mjs` |
| `QUESTION_BANK_VERSION` | `objective-bank-v6-120` | `src/question-bank.js` |

每条 Attempt 和历史快照保存 `scoringVersion` 与 `questionBankVersion`。修改影响评分或恢复的题干、答案、难度、维度标签时需显式升级题库版本；未来评分升级只影响新 Attempt，旧历史继续读取保存时的结果。

## 独立评分 Skill

`skills/aiquos-six-dimension-scoring/` 包含唯一评分核心、两个 CLI、文档、独立示例与测试。浏览器应用直接导入其中的纯函数核心；Skill 无第三方运行依赖，只需支持 ES modules 的 Node.js 运行 CLI。仓库开发和验证使用 Node.js 24。本交付不执行全局安装或 CC Switch 同步。

在仓库根目录验证题库并运行两个完整示例：

```sh
node skills/aiquos-six-dimension-scoring/scripts/validate-question-bank.mjs src/comprehensive-questions.json
node skills/aiquos-six-dimension-scoring/scripts/score-responses.mjs skills/aiquos-six-dimension-scoring/examples/comprehensive-responses.json
node skills/aiquos-six-dimension-scoring/scripts/score-responses.mjs skills/aiquos-six-dimension-scoring/examples/objective-responses.json
node --test tests/*.test.mjs skills/aiquos-six-dimension-scoring/tests/*.test.mjs
```

独立交付包名为 `aiquos-six-dimension-scoring-v1.0.0.zip`，根目录为 `aiquos-six-dimension-scoring/`，只含 Skill，不含应用、依赖目录、真实用户作答或历史。解压后进入该目录即可独立运行：

```sh
node --test tests/*.test.mjs
node scripts/score-responses.mjs examples/comprehensive-responses.json
node scripts/score-responses.mjs examples/objective-responses.json
node scripts/validate-question-bank.mjs <your-question-bank.json>
```

输入格式与集成方式见 [Skill 说明](skills/aiquos-six-dimension-scoring/SKILL.md)。

## 案例来源与扩展

案例来自桌面 `项目合集_2026-08-31`，原文件未修改：

1. Wing It 中文解说成片：完整 114 秒、1080p H.264/AAC 文件。
2. 超级马里奥：原像素游戏，嵌入模式加入自动演示控制器。
3. 日式便利店：现存第二版雨夜街角实时 3D；第一版仅出现在整理说明中，实际文件夹不存在。
4. 暴风雨海盗船：实时 3D、雷暴天气。

像素海盗船仍保留在原始资源中，但不再加入首页的案例轮播。

`src/cases.js` 是唯一案例清单；新增项目资源放到 `public/cases/` 后添加一项，即自动加入三个屏幕的轮播。每组显示连续三个不同案例，每个案例会依次出现在三个面上。

嵌入场景使用仅允许脚本的隔离 iframe，不允许访问父页面、存储、弹窗或顶层导航。便利店已将本地依赖编译为独立脚本，离线可用。播放中的场景限制到 30 fps、1× 渲染密度；后台预加载只绘制两帧就绪画面后暂停。切换采用短叠化并卸载旧层。页面不可见、旋转中、正面预览或说明弹窗打开时暂停轮换；系统偏好减少动态时默认不自动轮换。

便利店源码修改后，运行 `node scripts/build-cases.mjs` 重新生成嵌入脚本。

## 开发

### 自适应全屏

页面使用窗口宽高独立排列元素，不再将整个固定比例画布缩小居中。背景铺满可用窗口（保留原设计的细圆角边距），导航随窗口定位；字标、立方体分别等比缩放，屏幕透视保持不变。

手机与竖屏平板使用紧凑排列。常见手机高度可一屏展示；小于 760 px 的紧凑窗口及小于 680 px 的横向窗口允许纵向滚动，以保留文字与控件可读性。

`src/layout.js` 负责布局参数，`src/responsive.css` 负责自适应定位。运行 `node --test tests/layout.test.mjs` 可验证 14 种窗口尺寸及参考图坐标不变性。

```sh
npm install
npm run dev -- --host 127.0.0.1 --port 4286
npm run build
npm run test:sites
```

`npm run build` 在 Vite 构建后执行 Sites 准备脚本，要求本地存在被 Git 忽略的 `.openai/hosting.json`；正式部署需使用实际配置。缺失时仅为本地构建验证临时放入 `{}`，验证结束立即删除，不能把它作为部署配置。成功构建生成 `dist/client/index.html`、`dist/server/index.js` 和 `dist/.openai/hosting.json`；构建产物不提交。

## 在代码中替换屏幕

内容编辑界面已移除，但代码中的 `faces` 独立内容契约仍保留：

```jsx
const faces = {
  top: { type: 'image', src: '/assets/your-image.jpg', fit: 'cover' },
  left: { type: 'video', src: '/assets/your-video.mp4', fit: 'cover' },
  right: { type: 'component', content: <YourComponent /> },
};
<CubeDisplay faces={faces} flattened={false} active />
```

默认组件画布大小为 **500 × 520 CSS px**；顶部案例使用 **640 × 360** 宽幅画布。由 `projectPlane` 投影到参考图的屏幕四角，外壳不受内容更换影响。

内置类型：`original`、`image`、`video`、`clock`、`progress`、`music`、`quote`、`component`、`case`。

## 主要文件

- `src/Brand.jsx`：字标与源图去底渲染。
- `src/CubeDisplay.jsx`：显示器、透视投影、屏幕内容组件。
- `src/App.jsx`：主页、案例轮播与入口状态。
- `src/cube-geometry.js`、`cube-textures.js`：源图几何校准、外壳材质与单面旋转。
- `src/CaseScreen.jsx`、`case-buffer.js`：双层预加载、画面就绪检测与切换。
- `src/LoginForm.jsx`、`login.css`：免验证登录表单与屏幕内自适应布局。
- `src/styles.css`：样式与响应式布局。
- `public/assets/aiquos-reference.png`：用户提供的原始美术素材，项目运行所必需。
- `design-qa.md`：视觉与功能检查记录。

字体已随项目本地打包，无需访问外部字体服务。远程媒体是否可播放取决于源站、链接有效性与浏览器支持的编码。
