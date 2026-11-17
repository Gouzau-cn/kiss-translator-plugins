# PaddleOCR Official API

[English](README.en.md) | [简体中文](README.md)

Provides two services through Baidu AI Studio's official PaddleOCR asynchronous job API:

- **Text OCR (PaddleOCR)**: PP-OCRv6 / PP-OCRv5 / PP-OCRv5-latin, returning text lines and their coordinates.
- **Document parsing (PaddleOCR)**: PP-StructureV3 / PaddleOCR-VL / PaddleOCR-VL-1.5 / PaddleOCR-VL-1.6, returning full-page text and layout blocks.

The plugin is maintained by KISS Translator. It does not represent Baidu's release or endorsement.

## Usage

1. Install this plugin from the official catalog or import the `plugins/paddleocr` folder as an interface plugin.
2. Add the services you need under "Service configuration → Add → Plugin":
   - choose "Text OCR (PaddleOCR)" when translated lines should be placed back on the image;
   - choose "Document parsing (PaddleOCR)" for full-page document parsing.
3. Enter an AI Studio Access Token (stored only in the password field), then pick a model and options.
4. Configured instances appear in the image-translation recognition dropdown; document parsing instances show up in the VLM group.

## Models and capabilities

| Service | Models | Host capability | Coordinates |
| --- | --- | --- | --- |
| Text OCR | `PP-OCRv6`, `PP-OCRv5`, `PP-OCRv5-latin` | `recognizeText` | Yes (text lines) |
| Document parsing | `PP-StructureV3`, `PaddleOCR-VL`, `PaddleOCR-VL-1.5`, `PaddleOCR-VL-1.6` | `parseImage` | Layout blocks when present; not guaranteed |

Document parsing reads `prunedResult.parsing_res_list` first: it contains headers, footers, page numbers and footnotes that the official Markdown ignores, together with `block_bbox` values. Only pages without layout blocks fall back to `markdown.text`. Image placeholders (`<div><img ...></div>`, `![](imgs/...)`) are removed during parsing and never sent to translation as body text.

## Options

- Document parsing always enables layout detection (`useLayoutDetection: true`), which is required for layout blocks and complete text.
- `PaddleOCR-VL-1.5/1.6` support text-in-image recognition (enabled by default) and seal recognition (disabled by default). Legacy `PaddleOCR-VL` does not receive these options.
- `PP-StructureV3` uses the table / formula / chart recognition switches.
- The official asynchronous API does not accept free-form prompts, so the "vision prompt" in the host has no effect on this plugin. Table/formula `promptLabel` modes are not exposed until verified against the live API.

## Limitations

- Each invocation uses the host's plugin budget (120 seconds by default, configurable and capped at 600 seconds); the plugin keeps only a 590-second safety limit, so the host normally times out first.
- The result JSONL is served from a BOS pre-signed URL. The plugin allows the API origin and `https://paddleocr.bj.bcebos.com` by default and keeps a configurable "result download origin" field. Update it if the live service uses a different host. Redirects are rejected by the host, so the result URL must be a direct link.
- Responses are limited to 8 MiB by the host; document parsing does not request Markdown images.
- Markdown fallback pages have no coordinates, so image translation can only show their text.

## Privacy

The Access Token is stored only in the plugin's password field and injected as a Bearer credential by the host. The plugin does not log secrets, request contents or results.
