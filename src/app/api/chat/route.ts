import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import puppeteer from "puppeteer";
import * as cheerio from "cheerio";
import fetch from "node-fetch";

// Environment Variables
const GOOGLE_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_API_KEY;
const GOOGLE_CSE_ID = process.env.NEXT_PUBLIC_GOOGLE_SEARCH_ENGINE_ID;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// Ensure all required environment variables are set
if (!GOOGLE_API_KEY || !GOOGLE_CSE_ID || !GROQ_API_KEY) {
  console.error("Missing required environment variables.");
  throw new Error("Missing required environment variables.");
}

// Constants
const MAX_WORDS = 500;

// Utility Functions
const isUrl = (input: string): boolean => /^(https?:\/\/[^\s]+)$/.test(input.trim());

const sanitizeUrl = (url: string): string => url.trim().replace(/^[\s\(\[]+|[\s\)\]]+$/g, "");

const formatInlineCitations = (references: string[]): string[] => references.map(
  (url, index) =>
    `<a href="${sanitizeUrl(url)}" target="_blank" style="color: #48AAAD; text-decoration: underline;">[${index + 1}]</a>`
);

const truncateText = (text: string, maxWords: number): string => {
  const words = text.split(/\s+/);
  return words.length > maxWords ? words.slice(0, maxWords).join(" ") + " webscraping content..." : text;
};

// Fetch Google Search results
async function fetchGoogleSearchResults(query: string): Promise<string[]> {
  const url = `https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(query)}&key=${GOOGLE_API_KEY}&cx=${GOOGLE_CSE_ID}`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch search results: ${response.statusText}`);
    }
    const data = await response.json();
    return data.items?.map((item: { link: string }) => item.link) || [];
  } catch (error) {
    console.error("Error fetching Google search results:", error);
    return [];
  }
}

// Scrape content from a URL
async function scrapeContent(url: string): Promise<{ bodyContent: string; citations: string[] }> {
  try {
    const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    const page = await browser.newPage();
    await page.setUserAgent("Mozilla/5.0");
    await page.goto(url, { waitUntil: "domcontentloaded" });
    const html = await page.content();
    const $ = cheerio.load(html);

    const bodyContent = $("h1, h2, p")
      .map((_, el) => $(el).text().trim())
      .get()
      .join(" ") || "No meaningful content found.";

    await browser.close();

    return bodyContent.length > 20 ? { bodyContent, citations: [url] } : { bodyContent: "Content is not useful or empty.", citations: [] };
  } catch (error) {
    console.error("Error scraping content from URL:", url, error);
    return { bodyContent: "Error occurred during scraping.", citations: [] };
  }
}

// Handle POST request
export async function POST(request: Request) {
  try {
    const { message } = await request.json();
    if (!message || typeof message !== "string") {
      return NextResponse.json({
        error: "Invalid input. Please provide a valid query message.",
        status: 400,
      });
    }

    let combinedContent = "";
    let references: string[] = [];

    if (isUrl(message)) {
      const { bodyContent, citations } = await scrapeContent(message);
      combinedContent = bodyContent;
      references = citations;
    } else {
      const match = message.match(/https?:\/\/[^\s]+/);
      if (match) {
        const { bodyContent, citations } = await scrapeContent(match[0]);
        combinedContent = bodyContent;
        references = citations;
      } else {
        const urls = await fetchGoogleSearchResults(message);
        references = urls;
        for (const url of urls) {
          const { bodyContent } = await scrapeContent(url);
          combinedContent += ` ${bodyContent}`;
        }
      }
    }

    if (!combinedContent.trim()) {
      return NextResponse.json({
        response: "No relevant information could be extracted. Please try a different query or provide a direct link.",
      });
    }

    const truncatedContent = truncateText(combinedContent, MAX_WORDS);

    const aiPrompt = `
      Summarize the following text in detail with inline citations linked directly to the provided references:
      User Input: "${message}"
      Scraped Content: "${truncatedContent}"

      *Guidelines*
      1. Use inline citations like [1], [2], etc., directly referencing the URLs.
      2. Do not invent references or citations.
      3. Ensure citations correspond to actual scraped content.
      4. Do not include URLS in the response.
    `;

    try {
      const groq = new Groq({ apiKey: GROQ_API_KEY });
      const chatCompletion = await groq.chat.completions.create({
        messages: [{ role: "system", content: aiPrompt }],
        model: "llama3-8b-8192",
      });

      const responseMessage = chatCompletion.choices?.[0]?.message?.content?.trim()
        || "No response from AI model.";

      const clickableCitations = formatInlineCitations(references);
      const finalResponse = responseMessage.replace(/\[([0-9]+)\]/g, (_, num) => clickableCitations[num - 1]);

      return NextResponse.json({
        response: finalResponse,
      });
    } catch (aiError) {
      console.error("Error generating AI response:", aiError);
      return NextResponse.json({
        response: "Unable to generate a summary. Please try again later.",
      });
    }
  } catch (error) {
    console.error("General error processing request:", error);
    return NextResponse.json({
      error: "An error occurred while processing your request.",
      status: 500,
    });
  }
}