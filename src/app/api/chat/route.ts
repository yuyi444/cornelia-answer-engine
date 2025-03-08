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
function isUrl(input: string): boolean {
  const urlPattern = /^(https?:\/\/[^\s]+)$/;
  return urlPattern.test(input.trim());
}

function sanitizeUrl(url: string): string {
  return url.trim().replace(/^[\s\(\[]+|[\s\)\]]+$/g, "");
}

function formatInlineCitations(references: string[]): string[] {
  return references.map(
    (url, index) =>
      `<a href="${sanitizeUrl(url)}" target="_blank" style="color: #FF1493; text-decoration: underline;">[${index + 1}]</a>`
  );
}

function truncateText(text: string, maxWords: number): string {
  const words = text.split(/\s+/);
  return words.length > maxWords ? words.slice(0, maxWords).join(" ") + " webscraping content..." : text;
}

// Fetch Google Search results
async function fetchGoogleSearchResults(query: string): Promise<string[]> {
  const url = `https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(query)}&key=${GOOGLE_API_KEY}&cx=${GOOGLE_CSE_ID}`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error("Failed to fetch search results:", response.statusText);
      return [];
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

    if (bodyContent.length > 20) {
      return { bodyContent, citations: [url] };
    }

    return { bodyContent: "Content is not useful or empty.", citations: [] };
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
      // Direct link provided by the user
      const { bodyContent, citations } = await scrapeContent(message);
      combinedContent = bodyContent;
      references = citations;
    } else {
      // Detect if the message includes a URL even within text like "summarize <url>"
      const match = message.match(/https?:\/\/[^\s]+/);
      if (match) {
        const { bodyContent, citations } = await scrapeContent(match[0]);
        combinedContent = bodyContent;
        references = citations;
      } else {
        // Perform Google search if no URL is provided
        const urls = await fetchGoogleSearchResults(message);
        if (urls.length > 0) {
          references = urls;
          for (const url of urls) {
            const { bodyContent } = await scrapeContent(url);
            combinedContent += ` ${bodyContent}`;
          }
        } else {
          // If no search results found, directly use the user's message
          combinedContent = message;
          references = []; // No external reference available
        }
      }
    }

    // Handle case where no content is found
    if (!combinedContent.trim()) {
      return NextResponse.json({
        response: "No relevant information could be extracted. Please try a different query or provide a direct link.",
      });
    }

    // Truncate content for AI processing
    const truncatedContent = truncateText(combinedContent, MAX_WORDS);

    const aiPrompt = `
    Summarize the following text in detail with inline citations linked directly to the provided references:
    User Input: "${message}"
    Scraped Content: "${truncatedContent}"

    Note:
    - Use inline citations like [1], [2], etc., directly referencing the URLs.
    - Do not invent references or citations.
    - Ensure citations correspond to actual scraped content.
    `;
    console.log("Prompt to AI:", aiPrompt);

    try {
      const groq = new Groq({ apiKey: GROQ_API_KEY });
      const chatCompletion = await groq.chat.completions.create({
        messages: [{ role: "system", content: aiPrompt }],
        model: "llama3-8b-8192",
      });

      const responseMessage =
        chatCompletion.choices?.[0]?.message?.content?.trim() || "No response from AI model.";

      // Format inline citations
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


