# PaddleOCR 官方 API 验收记录

## 1.0.1（2026-11-17）

### 修复

- 文档解析中无坐标的版面块（页眉、页脚、页码、脚注等缺少 `block_bbox`，或坐标面积为零的块）现在显式返回 `poly: null`。此前这类 item 省略了 `poly` 字段，宿主 `validateResult` 会以 `INVALID_RESPONSE: Invalid OCR blocks.` 拒绝整个文档解析结果；该缺陷已用 Sval 执行插件并调用真实宿主校验复现。
- 新增两条断言：结果集中每个文字项必须自带 `poly` 字段；缺 bbox 与零面积 bbox 的版面块都返回 `poly: null`。
- 插件内部任务预算由 100 秒改为 590 秒。宿主调用期限由实例 `httpTimeout` 决定（默认 120 秒，最大 600 秒），此前用户调大宿主超时也无法让长文档继续；现在由宿主先触发超时。超时错误码改为宿主故障表中的 `REQUEST_TIMEOUT`。
- 进度事件不再携带 `PADDLEOCR_SUBMITTED` 这类代码串 `message`，只上报 `progress` 数值。
- `PP-StructureV3` 不再发送其官方参数表未列出的 `useLayoutDetection`；PaddleOCR-VL 系列仍发送该开关。
- 新增回归测试：缺 `resultUrl`、非 JSON 响应、`PP-StructureV3` 参数裁剪、pending/running 进度事件。

### 验证

- `npm run check`、`npm test`（38 项协议测试）、`npm run build` 通过；离线协议测试使用假 HTTP 响应，仍未访问厂家接口。
- 真实 AI Studio Token 验收项与 1.0.0 相同，仍待完成。

## 1.0.0（2026-11-16）

### 已验证

以下结果来自本仓库离线单元测试（`npm run test:protocol`）和统一包检查（`npm run check`），使用假 HTTP 响应，不访问厂家接口：

| 检查 | 结果 |
| --- | --- |
| Manifest 身份、服务 ID、入口文件、图标与 8 种语言名称 | 通过 |
| OCR 提交任务：multipart 文件名、模型、optionalPayload | 通过 |
| OCR 轮询与 JSONL 解析：文字、文字行坐标、置信度 | 通过 |
| 文档解析：优先读取 parsing_res_list（含无坐标页眉、表格纯文本转换） | 通过 |
| 文档解析：移除 `<div><img>` / `![]()` 图片占位符 | 通过 |
| 文档解析：混合页（有版面块页 + 只有 Markdown 的页）按页序保留 | 通过 |
| 文档解析：旧版 PaddleOCR-VL 不发送 1.5/1.6 专属参数 | 通过 |
| 任务失败、缺少有效 OCR 坐标时返回错误而不是空成功 | 通过 |
| 下载 BOS 结果链接时不附加 Authorization | 通过（请求描述符断言） |

### 未验证

- **未使用真实 AI Studio Access Token 调用厂家接口**。本机没有可用凭据，因此没有真实提交/轮询/下载结果，也没有各模型的识别质量数据。
- **结果下载域名与重定向行为未实测**。官方文档称 `resultUrl.jsonUrl` 为 BOS 预签名链接；插件默认允许 `https://paddleocr.bj.bcebos.com`，并提供“结果下载域名”配置项。宿主的 HTTP 传输禁止重定向，若真实短链发生跳转需先由宿主支持。
- **浏览器 Worker/RPC、扩展页面安装与界面交互未验收**。离线测试不覆盖真实 Sval Worker 隔离和浏览器网络权限。
- **PP-StructureV3 与各 VL 模型的参数行为未逐项实测**。`useOcrForImageBlock`、`useSealRecognition` 依据官方 PaddleOCR-VL-1.6 参数文档提供；旧版 VL 不发送。表格/公式 `promptLabel` 模式未开放。
- **多页 PDF、超大图片、8 MiB 上限边界未实测**。宿主按页发送图片，插件只接收单张图片资产。

拿到测试凭据后，建议至少完成：

1. 每个模型各跑一张包含标题、正文、表格和图片的图片；
2. 记录实际 `resultUrl.jsonUrl` 的域名与是否重定向；
3. 核对 OCR 文字行坐标与图片位置；
4. 记录文档解析的耗时是否在宿主预算内（默认 120 秒，最大 600 秒）；
5. 通过浏览器安装包执行一次真实会话，确认 Worker/RPC 与网络权限。

官方依据：[异步 API 使用文档](https://ai.baidu.com/ai-doc/AISTUDIO/fml7mozw5)、[PaddleOCR-VL 参数](https://paddlepaddle.github.io/PaddleOCR/main/en/version3.x/pipeline_usage/PaddleOCR-VL.html)、[官方 TypeScript SDK](https://github.com/PaddlePaddle/PaddleOCR/tree/main/api_sdk/typescript)。
