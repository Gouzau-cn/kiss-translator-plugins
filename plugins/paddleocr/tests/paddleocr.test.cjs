const { test } = require("node:test");
const assert = require("node:assert/strict");
const handlers = require("../services/paddleocr.js");

const IMAGE = { assetId: "asset-1", mimeType: "image/png" };
const JSON_URL = "https://paddleocr.bj.bcebos.com/result.jsonl";

function response(body) {
  return { status: 200, headers: {}, body: body };
}

// 用顺序化的假 HTTP 响应替代真实网络，检查请求描述符与解析结果。
function createContext(steps) {
  const calls = [];
  const ctx = {
    secrets: { ref: (key) => ({ scope: "service", key: key }) },
    emit: async (event) => {
      calls.push({ emit: event });
    },
    http: {
      async request(request) {
        calls.push({ request: request });
        const step = steps.shift();
        if (!step) throw new Error("unexpected request: " + request.url);
        return step(request);
      },
    },
  };
  return { ctx: ctx, calls: calls };
}

const OCR_PAGE = {
  ocrResults: [
    {
      prunedResult: {
        rec_texts: ["Hello", "World"],
        rec_scores: [0.99, 0.8],
        rec_polys: [
          [
            [0, 0],
            [10, 0],
            [10, 5],
            [0, 5],
          ],
          [
            [0, 10],
            [10, 10],
            [10, 15],
            [0, 15],
          ],
        ],
      },
    },
  ],
};

test("recognizeText submits a job, polls and parses OCR lines", async () => {
  const { ctx, calls } = createContext([
    () => response(JSON.stringify({ code: 0, data: { jobId: "job-1" } })),
    () =>
      response(
        JSON.stringify({
          code: 0,
          data: { state: "done", resultUrl: { jsonUrl: JSON_URL } },
        })
      ),
    () => response(JSON.stringify({ result: OCR_PAGE })),
  ]);

  const result = await handlers.recognizeText({ image: IMAGE }, {}, ctx);
  const requests = calls
    .filter((call) => call.request)
    .map((call) => call.request);

  assert.equal(result.format, "text");
  assert.equal(result.text, "Hello\nWorld");
  assert.equal(result.items.length, 2);
  assert.deepEqual(result.items[0].poly, [
    [0, 0],
    [10, 0],
    [10, 5],
    [0, 5],
  ]);
  assert.equal(result.items[0].confidence, 0.99);

  const submit = requests[0];
  assert.equal(submit.method, "POST");
  assert.equal(submit.bodyType, "multipart");
  assert.equal(submit.body.model, "PP-OCRv6");
  assert.equal(submit.body.file.filename, "image.png");
  assert.deepEqual(JSON.parse(submit.body.optionalPayload), {
    useDocOrientationClassify: false,
    useDocUnwarping: false,
    useTextlineOrientation: false,
  });

  // 结果链接是 BOS 预签名地址，不能附加 Authorization。
  assert.equal(requests[2].url, JSON_URL);
  assert.equal(requests[2].auth, undefined);
});

test("parseImage keeps layout blocks, headers and Markdown fallback pages", async () => {
  const docPage = {
    layoutParsingResults: [
      {
        prunedResult: {
          parsing_res_list: [
            {
              block_label: "doc_title",
              block_content: "# 标题",
              block_bbox: [1, 2, 30, 40],
            },
            // 没有 block_bbox 的块仍要参与翻译。
            { block_label: "header", block_content: "页眉 2026" },
            {
              block_label: "image",
              block_content:
                '<div style="text-align: center;"><img src="imgs/a.jpg" alt="Image" width="39%" /></div>',
              block_bbox: [10, 10, 50, 50],
            },
            {
              block_label: "table",
              block_content:
                "<table><tr><td>姓名</td><td>张&amp;三</td></tr></table>",
              block_bbox: [2, 60, 90, 80],
            },
          ],
        },
      },
      { markdown: { text: "第二页 Markdown" } },
    ],
  };
  const { ctx, calls } = createContext([
    () => response(JSON.stringify({ code: 0, data: { jobId: "job-2" } })),
    () =>
      response(
        JSON.stringify({
          code: 0,
          data: { state: "done", resultUrl: { jsonUrl: JSON_URL } },
        })
      ),
    () => response(JSON.stringify({ result: docPage })),
  ]);

  const result = await handlers.parseImage(
    { image: IMAGE },
    { model: "PaddleOCR-VL-1.6" },
    ctx
  );

  assert.equal(result.format, "markdown");
  assert.equal(
    result.text,
    "# 标题\n\n页眉 2026\n\n<table><tr><td>姓名</td><td>张&amp;三</td></tr></table>\n\n第二页 Markdown"
  );
  assert.deepEqual(result.items, [
    {
      text: "# 标题",
      type: "doc_title",
      poly: [
        [1, 2],
        [30, 2],
        [30, 40],
        [1, 40],
      ],
    },
    { text: "页眉 2026", type: "header", poly: null },
    { text: "姓名 张&三", type: "table", poly: [[2, 60], [90, 60], [90, 80], [2, 80]] },
    { text: "第二页 Markdown", poly: null },
  ]);
  // 宿主要求每个文字项显式声明 poly（多边形或 null），省略字段会被拒绝。
  assert.ok(
    result.items.every((item) =>
      Object.prototype.hasOwnProperty.call(item, "poly")
    )
  );

  const payload = JSON.parse(calls[0].request.body.optionalPayload);
  assert.equal(calls[0].request.body.model, "PaddleOCR-VL-1.6");
  assert.equal(payload.useLayoutDetection, true);
  assert.equal(payload.useOcrForImageBlock, true);
  assert.equal(payload.returnMarkdownImages, false);
  assert.equal(payload.useTextlineOrientation, undefined);
});

test("layout blocks without a usable box declare poly null", async () => {
  const page = {
    layoutParsingResults: [
      {
        prunedResult: {
          parsing_res_list: [
            // 缺少 block_bbox 的页脚。
            { block_label: "footer", block_content: "第 1 页" },
            // 零面积的退化坐标也不能省略 poly。
            {
              block_label: "text",
              block_content: "正文",
              block_bbox: [5, 5, 5, 5],
            },
          ],
        },
      },
    ],
  };
  const { ctx } = createContext([
    () => response(JSON.stringify({ code: 0, data: { jobId: "job-box" } })),
    () =>
      response(
        JSON.stringify({
          code: 0,
          data: { state: "done", resultUrl: { jsonUrl: JSON_URL } },
        })
      ),
    () => response(JSON.stringify({ result: page })),
  ]);
  const result = await handlers.parseImage({ image: IMAGE }, {}, ctx);
  assert.deepEqual(result.items, [
    { text: "第 1 页", type: "footer", poly: null },
    { text: "正文", type: "text", poly: null },
  ]);
});

test("legacy PaddleOCR-VL does not receive 1.5-only payload fields", async () => {
  const { ctx, calls } = createContext([
    () => response(JSON.stringify({ code: 0, data: { jobId: "job-3" } })),
    () =>
      response(
        JSON.stringify({
          code: 0,
          data: { state: "done", resultUrl: { jsonUrl: JSON_URL } },
        })
      ),
    () =>
      response(
        JSON.stringify({ result: { layoutParsingResults: [] } })
      ),
  ]);
  // 空结果会抛错，但提交请求已经发生，可直接检查 payload。
  await assert.rejects(
    handlers.parseImage(
      { image: IMAGE },
      {
        model: "PaddleOCR-VL",
        useOcrForImageBlock: true,
        useSealRecognition: true,
      },
      ctx
    ),
    /未返回文档解析结果/
  );
  const payload = JSON.parse(calls[0].request.body.optionalPayload);
  assert.equal(payload.useOcrForImageBlock, undefined);
  assert.equal(payload.useSealRecognition, undefined);
});

test("failed jobs and missing coordinates are reported", async () => {
  const failed = createContext([
    () => response(JSON.stringify({ code: 0, data: { jobId: "job-4" } })),
    () =>
      response(
        JSON.stringify({
          code: 0,
          data: { state: "failed", errorMsg: "bad file" },
        })
      ),
  ]);
  await assert.rejects(
    handlers.recognizeText({ image: IMAGE }, {}, failed.ctx),
    (error) => error.code === "PROVIDER_ERROR" && /bad file/.test(error.message)
  );

  const noPoly = createContext([
    () => response(JSON.stringify({ code: 0, data: { jobId: "job-5" } })),
    () =>
      response(
        JSON.stringify({
          code: 0,
          data: { state: "done", resultUrl: { jsonUrl: JSON_URL } },
        })
      ),
    () =>
      response(
        JSON.stringify({
          result: {
            ocrResults: [{ prunedResult: { rec_texts: ["Hello"] } }],
          },
        })
      ),
  ]);
  await assert.rejects(
    handlers.recognizeText({ image: IMAGE }, {}, noPoly.ctx),
    (error) => error.code === "INVALID_RESPONSE"
  );
});
