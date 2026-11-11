import "dotenv/config";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { paymentMiddleware, x402ResourceServer } from "@x402/hono";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";

const app = new Hono();
const payTo = process.env.PAY_TO;
const port = Number(process.env.PORT || 3000);

if (!/^0x[a-fA-F0-9]{40}$/.test(payTo || "")) {
  throw new Error("Set a valid PAY_TO wallet address in .env");
}

const facilitator = new HTTPFacilitatorClient({
  url: process.env.FACILITATOR_URL || "https://x402.org/facilitator"
});

const server = new x402ResourceServer(facilitator)
  .register("eip155:84532", new ExactEvmScheme());

app.get("/", c => c.json({
  name: "Text Analyzer API",
  description: "Paid text analysis API using x402",
  endpoints: ["/health", "/openapi.json", "/paid"]
}));

app.get("/health", c => c.json({ status: "ok" }));

app.get("/openapi.json", c => c.json({
  openapi: "3.1.0",
  info: {
    title: "Text Analyzer API",
    version: "1.0.0",
    description: "Analyze text with x402 payment on Base."
  },
  paths: {
    "/paid": {
      post: {
        summary: "Analyze text",
        operationId: "analyzeText",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["text"],
                properties: {
                  text: { type: "string" }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Analysis result" },
          "402": { description: "Payment required" }
        }
      }
    }
  }
}));

app.use("/paid", paymentMiddleware({
  "POST /paid": {
    accepts: [{
      scheme: "exact",
      price: "$0.005",
      network: "eip155:84532",
      payTo
    }],
    description: "Text Analyzer API",
    mimeType: "application/json"
  }
}, server));

app.post("/paid", async c => {
  let body;

  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  if (typeof body.text !== "string" || !body.text.trim()) {
    return c.json({ error: "Please provide text" }, 400);
  }

  const input = body.text.trim();
  const words = input.split(/\s+/).filter(Boolean);
  const sentences = input.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];

  return c.json({
    success: true,
    analysis: {
      characters: input.length,
      charactersWithoutSpaces: input.replace(/\s/g, "").length,
      words: words.length,
      sentences: sentences.filter(s => s.trim()).length
    }
  });
});

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "Internal server error" }, 500);
});

serve({
  fetch: app.fetch,
  port,
  hostname: "0.0.0.0"
}, info => {
  console.log("Text Analyzer API running on port " + info.port);
});

