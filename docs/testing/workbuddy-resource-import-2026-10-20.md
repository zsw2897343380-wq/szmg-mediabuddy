# WorkBuddy 公共资源导入验收（2026-10-20）

## 导入结果

用户确认按平台公共资源导入，由超管统一上下架。资源已保存到当前本地实例的数据目录；没有新建或启动专家运行实例。

- 技能 ZIP：9 个，其中新增 7 个，2 个与已有文件逐字节一致，复用原记录。
- WorkBuddy 插件：42 个，均为 agent 专家配置，已转换为独立的公共专家模板。
- 保留专家名称、描述、头像、完整人格提示词、快捷提问及原始插件/agent 元数据。
- 分类沿用现有八类媒体业务分类；原始 WorkBuddy categoryId 保存在来源元数据中。
- 时政知识库的 SKILL.md、agents/openai.yaml、两个 scripts/\*.py 文件全部保留；未执行这些脚本。

## 技能清单

| 技能                | 处理       | 公共状态         |
| ------------------- | ---------- | ---------------- |
| 体育报道能手        | 新增       | 已上架           |
| 口播脚本能手        | 新增       | 已上架           |
| 国际报道能手        | 复用原记录 | 保留此前下架状态 |
| 政策分析能手        | 复用原记录 | 保留此前下架状态 |
| 时政新闻知识库skill | 新增       | 已上架           |
| 极速快讯能手        | 新增       | 已上架           |
| 热点选题能手        | 新增       | 已上架           |
| 财经报道能手        | 新增       | 已上架           |
| 采访提纲能手        | 新增       | 已上架           |

新增 7 项归入“WorkBuddy 导入技能（2026-10-20）”，并安装到当前 admin 的个人技能库。未修改其他用户的安装/启用偏好。已有独立私有技能副本继续保留，因此聊天选择器仍可显示私有的国际报道、政策分析技能。

时政知识库使用原 ZIP 文件名对应的版本目录标识，与通用助理已有私有副本一致；解决同一技能在聊天选择器重复显示的问题，未改动私有副本内容。

## 公共专家清单

| 专家                             | 分类     | 公共 ID                      |
| -------------------------------- | -------- | ---------------------------- |
| 账号运营数据分析智能体           | 数据分析 | `01M5BKKY6W0GHED7AQVHZNEE9N` |
| 全能广告文案生成专家             | 爆款创作 | `01M5BKKY715VC8T8NRJSG4QRTC` |
| AI图片中英双语提示词智能体       | 爆款创作 | `01M5BKKY77NS02Z5N673767C7W` |
| AI视频中英双语提示词智能体       | 爆款创作 | `01M5BKKY7CVXHRXD33YHKVMWTX` |
| 资深中英双语新闻主编与翻译官     | 国际传播 | `01M5BKKY7HT3DKC8CNZWN9HXWE` |
| 中英文双语翻译专家               | 国际传播 | `01M5BKKY7NRKM3T8QD89YB9FF0` |
| 【国内】多平台热搜聚合分析智能体 | 数据分析 | `01M5BKKY7VFDBB22MCZR4W7TNQ` |
| 国内全域新媒体账号运营专家       | 内容运营 | `01M5BKKY7ZHC5H0X252FDHXAWP` |
| 【国内】热点选题与策划智能体     | 选题策划 | `01M5BKKY84HP3GHRCDM5V7Z9J8` |
| 资深内容延展专家                 | 稿件生产 | `01M5BKKY891SVCTKG1PW775QRR` |
| 今日潜力选题推荐智能体           | 选题策划 | `01M5BKKY8FTF8BG11C1ABV7HGJ` |
| 文稿“去AI味”洗稿专家             | 审核校对 | `01M5BKKY8NC9D5DTQKECNE5TE4` |
| 抖音黄金3秒设计专家              | 爆款创作 | `01M5BKKY8T29Q3Z6TFGHYZQ035` |
| 抖音爆款炼金术师                 | 爆款创作 | `01M5BKKY8Z8SE1RNK3VJX3YVVK` |
| 高端访谈策划架构师               | 选题策划 | `01M5BKKY930HNRS1J8SHP035NK` |
| 资深GEO 策略架构师               | 内容运营 | `01M5BKKY98X0S29ESVF7SCJNVZ` |
| 国传中心AI新闻时事评论员         | 国际传播 | `01M5BKKY9D518XW4KAE7ZHCSAM` |
| 【国际】多平台热搜聚合分析智能体 | 国际传播 | `01M5BKKY9HXT435M5NMMEX9TD6` |
| 国际多平台社媒运营增长专家       | 国际传播 | `01M5BKKY9PYT1FKF00MHQWWWK7` |
| 【国际】热点选题与策划智能体     | 国际传播 | `01M5BKKY9VQ8D21K98N0PCE1SC` |
| 热点素材批量爬取智能体           | 办公协作 | `01M5BKKYA063S35WNNKFWW13NM` |
| 全网热点事件脉络梳理专家         | 选题策划 | `01M5BKKYA58VP753GPKKW1YAVD` |
| 热点新闻文稿生成智能体           | 稿件生产 | `01M5BKKYAACC8FP847HN2BEZM8` |
| 信息精炼架构师                   | 稿件生产 | `01M5BKKYAFAF89DF6GFJV5ATCZ` |
| 长文案切片智能体                 | 稿件生产 | `01M5BKKYAKVQK4GP11WMSS2SHA` |
| 资深文稿润色专家                 | 稿件生产 | `01M5BKKYAR8MWPQZR1830J3QBN` |
| 会议纪要助手                     | 办公协作 | `01M5BKKYAYFDQ8D18E493S9A7Y` |
| 全网多引擎搜索智能体             | 办公协作 | `01M5BKKYB2S0YCCH0GZ6PK5ZST` |
| 热点链接一键转多平台风格         | 稿件生产 | `01M5BKKYB7THQCSRE5T7H1SR6D` |
| 公函发文助手                     | 办公协作 | `01M5BKKYBCDXM0MP9648A456D5` |
| 东南亚小语种翻译官               | 国际传播 | `01M5BKKYBHX1GE5YS815WNJ5TZ` |
| 深圳线下活动策划专家             | 选题策划 | `01M5BKKYBNE72YQFTNN6NXBVBK` |
| 全域短视频分镜导演               | 爆款创作 | `01M5BKKYBTHGP4Y4Y140MNWD2K` |
| Suno 音乐创作大师                | 爆款创作 | `01M5BKKYBZS5432QHG9G06ZH43` |
| 【TrendRadar】热点分析预测       | 数据分析 | `01M5BKKYC3H34HK2Q96TVM09BG` |
| 全域爆款标题助手                 | 爆款创作 | `01M5BKKYC8SXJEXH7HPHV73JDE` |
| 爆款视频AI拆解专家               | 爆款创作 | `01M5BKKYCDSGY49WXCBEK9ZDQM` |
| 本周热点舆情复盘与前瞻专家       | 数据分析 | `01M5BKKYCHB0J72R58J7ZAHTR2` |
| 微博热搜制造器                   | 爆款创作 | `01M5BKKYCPW3B04D4E2TWYKH01` |
| 工作汇报助手                     | 办公协作 | `01M5BKKYCVVBZNZKXKFX0XTER9` |
| 小红书爆款种草机                 | 爆款创作 | `01M5BKKYCZH145KMGYXJQ6RPPT` |
| YouTube 视频素材搜索专家         | 国际传播 | `01M5BKKYD4S1X13B8JWW6WKBZ7` |

## 展示与权限修复

专家首页原先忽略已经加载的 publishedExperts，导入公共模板后不会显示。本次补上公共模板的分类、搜索、详情和召唤入口；详情请求使用 published 路径，安装仍沿用既有私有副本流程。

新增集成测试覆盖无源 agent 的导入模板：列表分类、SOUL.md 详情、快捷提问、安装、超管下架后列表/详情/新安装不可访问，已安装私有副本保留。

## 验证

- 逐文件 SHA-256 对比：9 个技能及其全部附件、42 个专家快照的提示词/头像/清单均一致。
- 导入前后 public_resources_disabled:\* 的值完全一致；已有 agent 数量、enabled 和 last_state 完全一致。
- 本地浏览器：专家页 42 个“召唤”入口；搜索、分类、头像、完整详情、3 个快捷提问和创建表单可用；取消表单未创建专家。
- 本地浏览器：“我的技能”新增 7 项均启用；聊天选择器中的时政知识库只显示 1 项。
- `make all`：4921 passed、233 skipped；Ruff 和严格 mypy 均通过。
- 前端针对性 Vitest：10 passed；`npm run build`（含 TypeScript 检查）通过。
- 普通用户真实浏览器跨账号验收仍按此前约定标记待验；本次集成测试覆盖公共模板下架与私有副本保留。

## 数据与备份

- 数据目录：`C:\Users\Administrator\.octop`。
- 导入前数据库与清单备份：`C:\Users\Administrator\.octop\backups\workbuddy-import-20261020`。
- 完整导入 ID 与文件哈希：工作区 `.tools/layout-checks/workbuddy-import-result.json`。
- 浏览器截图：`.tools/layout-checks/workbuddy-import-experts.png`、`workbuddy-import-expert-detail.png`、`workbuddy-import-skills.png`。

这些资源是当前实例的数据，不会随本次 Git 代码提交迁移到其他实例。重新部署需迁移 Octop 数据目录或重新导入。导入不包含 WorkBuddy 的云端执行服务、连接器授权或模型凭证；联网、抓取、图像/视频制作等能力取决于平台已配置的工具和模型。原 maxTurns=50 作为来源元数据保留，未擅自转换为不同语义的 Octop 运行参数。
