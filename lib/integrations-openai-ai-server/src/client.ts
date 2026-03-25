import OpenAI from "openai";

if (!process.env.OPENAI_API_KEY) {
  throw new Error(
    "OPENAI_API_KEY must be set. See .env.example for configuration instructions.",
  );
}

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  ...(process.env.OPENAI_BASE_URL ? { baseURL: process.env.OPENAI_BASE_URL } : {}),
});
