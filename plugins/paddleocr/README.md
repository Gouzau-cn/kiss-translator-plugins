# PaddleOCR 官方 API

[English](README.en.md) | [简体中文](README.md)

通过百度 AI Studio 的 PaddleOCR 官方异步任务接口提供两类服务：

- **文字识别（PaddleOCR）**：PP-OCRv6 / PP-OCRv5 / PP-OCRv5-latin，返回文字行与文字坐标。
- **文档解析（PaddleOCR）**：PP-StructureV3 / PaddleOCR-VL / PaddleOCR-VL-1.5 / PaddleOCR-VL-1.6，返回整页文本与版面块。

插件由简约翻译维护，不代表百度发布或背书。

## 使用

1. 在扩展的“接口插件”中安装本插件（官方目录或导入 `plugins/paddleocr` 文件夹）。
2. 在“服务配置 → 添加 → 插件接口”中分别添加需要的服务：
   - 需要按行回填译文时选择“文字识别（PaddleOCR）”；
   - 需要整页文档解析时选择“文档解析（PaddleOCR）”。
3. 填写 AI Studio Access Token（只保存在密码字段），按需选择模型和其他开关。
4. 图片翻译的“文本识别”下拉会列出已配置的实例；“文档解析”实例会出现在识别的 VLM 分组中。

## 模型与能力

| 服务 | 模型 | 宿主能力 | 坐标 |
| --- | --- | --- | --- |
| 文字识别 | `PP-OCRv6`、`PP-OCRv5`、`PP-OCRv5-latin` | `recognizeText` | 有（文字行） |
| 文档解析 | `PP-StructureV3`、`PaddleOCR-VL`、`PaddleOCR-VL-1.5`、`PaddleOCR-VL-1.6` | `parseImage` | 有版面块时返回，不承诺完整 |

文档解析优先读取接口返回的 `prunedResult.parsing_res_list`：它包含官方 Markdown 默认忽略的页眉、页脚、页码、脚注等版面块，以及 `block_bbox`。整页没有版面块时才回退到 `markdown.text`。接口返回的图片占位符（`<div><img ...></div>`、`![](imgs/...)`）会在解析时移除，不会作为正文送去翻译。

## 参数

- 文档解析固定开启版面分析（`useLayoutDetection: true`），因此可以拿到版面块和完整文字。
- `PaddleOCR-VL-1.5/1.6` 支持“图片内文字识别”（默认开启）和“印章识别”（默认关闭）；旧版 `PaddleOCR-VL` 不会发送这两个参数。
- `PP-StructureV3` 使用“表格识别 / 公式识别 / 图表识别”开关。
- 官方异步接口不接受自定义提示词，界面上的“视觉解析提示词”对本插件无效；表格/公式提示词（`promptLabel`）尚未开放，需实测后再声明。

## 限制

- 单次调用沿用宿主插件预算（默认 120 秒，可在宿主设置中调大，最大 600 秒）；插件内部只保留 590 秒保险，默认由宿主先触发超时。
- 结果 JSONL 位于 BOS 预签名地址。插件默认允许接口域名与 `https://paddleocr.bj.bcebos.com`，并保留“结果下载域名”配置项；如果实际下载域名不同，请修改该字段。宿主禁止重定向，预签名地址应为直达链接。
- 接口单次响应上限为 8 MiB；文档解析请求不要求回传 Markdown 图片。
- 文档解析在 Markdown 回退页上没有坐标，图片翻译只能展示文本。

## 隐私

Access Token 只通过插件的密码字段保存，并作为 Bearer 凭据由宿主注入。插件不记录密钥，不把请求内容或结果写入日志。
