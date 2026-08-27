<p align="center">
  <img src="https://img.shields.io/badge/WeChat--Mini--Program-v3.0%2B-07C160?logo=wechat" alt="WeChat" />
  <img src="https://img.shields.io/badge/Renderer-Skyline-4a90d9" alt="Skyline" />
  <img src="https://img.shields.io/badge/Cloud-WeChat%20Cloud%20Functions-07C160" alt="Cloud" />
</p>

# 基金管理 (Fund Manager)

一个微信小程序，用于个人基金持仓跟踪、AI 智能分析与行情发现。

## 功能概览

- **基金管理** — 按基金代码添加基金，支持持仓 / 自选双列表，自定义分组归类
- **AI 新闻分析** — 拉取持仓重仓股及关联板块的实时新闻，通过 DeepSeek 大模型或本地关键词引擎自动标注利好 / 利空，生成加仓 / 减仓 / 观望建议
- **基金详情** — 重仓股仓位、净值走势图（支持 1/3/6/12 月并与沪深 300 基准对比）、板块新闻情绪面板
- **交易记录** — 录入买入/卖出，自动计算持仓成本、浮动盈亏和持有天数；支持持仓金额/收益手动覆写
- **定投计划** — 每日/每周/每双周/每月自动执行定投，按当前净值生成交易记录
- **行情总览** — 上证、深证、创业板、科创 50 等指数实时行情，行业板块涨跌排行
- **基金发现** — 按类型（股票/混合/债券/指数/货币）和业绩指标排名浏览全市场基金，快速加入自选
- **每日建仓推荐** — 首页“推荐”栏综合净值趋势、行业景气、重仓股新闻情绪，用 AI 推荐当日适合建仓的基金并给出理由
- **云端同步** — 基于微信云开发实现多设备数据合并同步

## 技术栈

| 层 | 方案 |
|---|------|
| 前端框架 | 微信小程序原生 + Skyline 渲染引擎 + glass-easel 组件框架 |
| 样式 | 自定义 CSS 变量，嫩黄色活泼卡通风 |
| 后端 | 微信云函数（`fundApi` / `analyze` / `recommend` / `sync`） |
| 数据源 | 东方财富基金 API、新浪行情 API、华尔街见闻快讯 |
| AI 引擎 | DeepSeek API（可选），自动降级为本地关键词规则引擎 |
| 存储 | 微信 Storage 本地存储 + 云开发数据库云端同步 |

## 项目结构

```
fund-manager/
├── app.js                    # 应用入口，全局数据、API 封装、云同步、定投引擎
├── app.json                  # 应用配置（Skyline、glass-easel）
├── app.wxss                  # 全局样式（嫩黄卡通风 CSS 变量）
├── pages/
│   ├── index/                # 首页 — 持仓/自选/推荐列表、分组过滤、添加基金
│   ├── detail/               # 详情 — 净值走势图、重仓股、新闻分析、交易记录
│   ├── market/               # 行情 — 大盘指数、行业板块涨跌
│   └── discover/             # 发现 — 按类型/业绩排名浏览基金
├── components/
│   └── navigation-bar/       # 自定义导航栏
├── cloudfunctions/
│   ├── fundApi/              # 基金数据 API 代理（搜索、净值、历史、持仓、排名、行情）
│   ├── analyze/              # AI 分析引擎（DeepSeek + 关键词规则降级）
│   ├── recommend/            # 每日建仓基金推荐（候选筛选 + 特征富化 + AI 排序 + 缓存）
│   ├── sync/                 # 多设备数据合并同步
│   └── chickAssets/          # 小鸡插画/底部导航图标上传到云存储并返回 URL
├── project.config.json
└── sitemap.json
```

## 快速开始

### 前置条件

- [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html) 最新版
- 已注册微信小程序 AppID，并开通**云开发**能力

### 本地运行

1. 克隆仓库后在微信开发者工具中导入项目目录
2. 复制 `env.example.js` 为 `env.js`，把 `cloudEnvId` 替换成你的云环境 ID
3. 新建 `project.private.config.json`（该文件已被 `.gitignore` 忽略）并写入自己的小程序 `appid`：

   ```json
   {
     "appid": "wx你的AppID",
     "projectname": "fund-manager",
     "libVersion": "3.17.1"
   }
   ```

   `project.config.json` 中的 `appid` 使用 `touristappid` 占位，不会提交真实 AppID。
4. 在云开发控制台创建环境
5. 上传并部署 `cloudfunctions/` 下的五个云函数
6. 编译运行即可

> 部署 `chickAssets` 云函数后首次调用会把 `assets/` 下的小鸡插画和底部导航图标上传到云存储；`app.js` 会自动拉取并缓存 URL。

### 配置基金搜索 token（必选）

`fundApi` 云函数的基金搜索接口需要东方财富搜索 token，通过云函数环境变量配置，避免硬编码到仓库：

1. 微信云开发控制台 → 云函数 → `fundApi` → 环境变量，添加：
   - `EASTMONEY_SEARCH_TOKEN` = 你的东方财富搜索 token
2. 重新部署 `fundApi` 云函数

### 配置 AI 分析（可选）

`analyze` 和 `recommend` 云函数支持 DeepSeek 大模型分析，未配置时自动降级为本地关键词规则引擎：

1. 在 [DeepSeek 开放平台](https://platform.deepseek.com) 获取 API Key
2. 微信云开发控制台 → 云函数 → `analyze` 和 `recommend` → 环境变量，添加：
   - `DEEPSEEK_API_KEY` = `sk-xxxxxxxxxxxxxxxx`
3. 重新部署 `analyze` 和 `recommend` 云函数

## 隐私与安全

- `project.config.json` 中的 `appid` 使用 `touristappid` 占位，真实 AppID 只写在本地 `project.private.config.json`
- 云环境 ID 写在本地 `env.js`，该文件已被 `.gitignore` 忽略
- `fundApi` 的东方财富搜索 token 通过云函数环境变量 `EASTMONEY_SEARCH_TOKEN` 配置
- 涉及本地敏感配置的文件：`env.js`、`project.private.config.json`，请勿提交

## 数据存储

本地数据全部通过 `wx.setStorageSync` 存储在小程序端，涵盖基金代码、分组、类型、交易记录和定投计划。`sync` 云函数负责在多个微信端之间合并同步这些数据到云数据库。每次数据变更后自动静默推送。

## 图标与许可

界面图标来自 [Lucide](https://lucide.dev/)（[ISC](https://github.com/lucide-icons/lucide/blob/main/LICENSE)），以 CSS mask 形式内置，不使用 emoji 图片。

## License

MIT
