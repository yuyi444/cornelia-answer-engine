/*import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import puppeteer from "puppeteer";
import * as cheerio from "cheerio";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function fetchPublishDate(url: string) {
  try {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.setUserAgent("Mozilla/5.0");
    await page.goto(url, { waitUntil: "domcontentloaded" });

    await page.waitForSelector(
      "meta[name='article:published_time'], meta[name='date'], time"
    );

    const publishDate = await page.evaluate(() => {
      const metaDate = document.querySelector("meta[name='article:published_time']")?.getAttribute("content");
      if (metaDate) return metaDate;
      const fallbackDate = document.querySelector("meta[name='date']")?.getAttribute("content");
      if (fallbackDate) return fallbackDate;
      const timeElement = document.querySelector("time");
      if (timeElement) return timeElement.getAttribute("datetime");
      return "Publish date not available.";
    });

    await browser.close();

    return publishDate;
  } catch (error) {
    console.error("Error fetching publish date:", error);
    return "Error fetching publish date.";
  }
}

async function scrapeContent(url: string): Promise<{ bodyContent: string; citations: string[] }> {
  try {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.setUserAgent("Mozilla/5.0");

    await page.goto(url, { waitUntil: "domcontentloaded" });
    const html = await page.content();
    const $ = cheerio.load(html);

    const bodyContent = $("h1, h2, p").map((_, el) => $(el).text().trim()).get().join(" ") || "No meaningful content found.";
    const citations = [url];

    await browser.close();

    return { bodyContent, citations };
  } catch (error) {
    console.error("Error during web scraping:", error);
    return { bodyContent: "Error occurred during scraping.", citations: [] };
  }
}

export async function POST(request: Request) {
  try {
    const { message } = await request.json();

    const urlMatch = message.match(/https?:\/\/[^\s]+/);
    const url = urlMatch ? urlMatch[0] : null;

    if (!url) {
      return NextResponse.json({
        error: "No valid URL found in the message.",
        status: 400,
      });
    }

    const { bodyContent, citations } = await scrapeContent(url);

    if (bodyContent.includes("Error occurred during scraping.")) {
      return NextResponse.json({
        response: "Failed to retrieve or parse article content.",
        bodyContent,
        citations,
      });
    }

    const publishDate = await fetchPublishDate(url);

    const aiPrompt = `Summarize the following article: "${bodyContent}"\n\nURL: ${url}\n\nPlease provide a detailed, coherent summary.`;

    const chatCompletion = await groq.chat.completions.create({
      messages: [{ role: "system", content: aiPrompt }],
      model: "llama3-8b-8192",
    });

    const responseMessage = chatCompletion.choices?.[0]?.message?.content?.trim() || "No response from AI model.";

    const finalResponse = `${responseMessage}\n\nReferences:\n[Source]: ${url}`;

    console.log("Final response:", finalResponse);

    return NextResponse.json({
      response: finalResponse,
      bodyContent,
      publishDate,
      citations,
    });
  } catch (error) {
    console.error("Error in chat API:", error);
    return NextResponse.json({
      error: "An error occurred while processing your request.",
      status: 500,
    });
  }
}
*//*
import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import puppeteer from "puppeteer";
import * as cheerio from "cheerio";
import fetch from "node-fetch";

// Environment Variables
const GOOGLE_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_API_KEY; // Google API key
const GOOGLE_CSE_ID = process.env.NEXT_PUBLIC_GOOGLE_SEARCH_ENGINE_ID; // Custom Search Engine ID
const GROQ_API_KEY = process.env.GROQ_API_KEY; // Groq API key

// Ensure all required environment variables are set
if (!GOOGLE_API_KEY || !GOOGLE_CSE_ID || !GROQ_API_KEY) {
  console.error("Missing required environment variables.");
  throw new Error("Missing required environment variables.");
}

// Fetch Google Search results for the user's query
async function fetchGoogleSearchResults(query: string): Promise<string[]> {
  const url = `https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(query)}&key=${GOOGLE_API_KEY}&cx=${GOOGLE_CSE_ID}`;
  try {
    const response = await fetch(url);

    if (!response.ok) {
      console.error("Failed to fetch Google search results:", response.statusText);
      const errorResponse = await response.text();
      console.error("Error response:", errorResponse);
      return [];
    }

    const data = await response.json();
    console.log("Google Search results:", data); // Log search results
    return data.items?.map((item: { link: string }) => item.link) || [];
  } catch (error) {
    console.error("Error fetching Google search results:", error);
    return [];
  }
}

// Scrape content from a given URL
async function scrapeContent(url: string): Promise<{ bodyContent: string; citations: string[] }> {
  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    await page.setUserAgent("Mozilla/5.0");
    await page.goto(url, { waitUntil: "domcontentloaded" });
    const html = await page.content();
    const $ = cheerio.load(html);

    const bodyContent = $("h1, h2, p")
      .map((_, el) => $(el).text().trim())
      .get()
      .join(" ") || "No meaningful content found.";
    console.log("Scraped content:", bodyContent); // Log scraped content

    await browser.close();
    return { bodyContent, citations: [url] };
  } catch (error) {
    console.error("Error scraping content from URL:", url, error);
    return { bodyContent: "Error occurred during scraping.", citations: [] };
  }
}

// Handle POST request
export async function POST(request: Request) {
  try {
    const { message } = await request.json();
    console.log("Received message:", message); // Log input message

    if (!message || typeof message !== "string") {
      return NextResponse.json({
        error: "Invalid input. Please provide a valid query message.",
        status: 400,
      });
    }

    // Step 1: Fetch Google search results
    const urls = await fetchGoogleSearchResults(message);
    console.log("Fetched URLs:", urls); // Log URLs fetched

    // Step 2: Scrape content from each URL
    let combinedContent = "";
    const references: string[] = [];

    if (urls.length > 0) {
      for (const url of urls) {
        const { bodyContent, citations } = await scrapeContent(url);
        combinedContent += ` ${bodyContent}`;
        references.push(...citations);
      }
    } else {
      combinedContent = "No relevant content found via Google Search.";
    }

    // Step 3: Generate an AI summary
    const aiPrompt = `
      Summarize the following text based on the user's input and relevant web-scraped content.

      User Input: "${message}"
      Scraped Content: "${combinedContent}"

      References: ${references.join(", ")}

      Please provide a coherent and detailed summary that combines both sources.
    `;

    console.log("AI prompt:", aiPrompt); // Log AI prompt

    try {
      // Initialize Groq API client
      const groq = new Groq({ apiKey: GROQ_API_KEY });
      const chatCompletion = await groq.chat.completions.create({
        messages: [{ role: "system", content: aiPrompt }],
        model: "llama3-8b-8192", // Ensure this model is available
      });

      console.log("AI response:", chatCompletion); // Log AI response

      const responseMessage =
        chatCompletion.choices?.[0]?.message?.content?.trim() || "No response from AI model.";

      return NextResponse.json({
        response: responseMessage,
        references,
      });
    } catch (aiError) {
      console.error("Error generating AI response:", aiError);
      return NextResponse.json({
        response: "We're unable to generate a summary at the moment. Please try again later.",
        references,
      });
    }
  } catch (error) {
    console.error("Error processing request:", error);
    return NextResponse.json({
      error: "An error occurred while processing your request.",
      status: 500,
    });
  }
}
*/
/*
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
  const urlPattern = /(https?:\/\/[^\s]+)/g;
  return urlPattern.test(input.trim());
}

function sanitizeUrl(url: string): string {
  return url.trim().replace(/^[\s\(\[]+|[\s\)\]]+$/g, '');
}

function formatReferences(references: string[]): string {
  return references
    .map((reference, index) => `[${index + 1}] ${sanitizeUrl(reference)}`)
    .join("\n");
}

function truncateText(text: string, maxWords: number): string {
  const words = text.split(/\s+/);
  return words.length > maxWords ? words.slice(0, maxWords).join(" ") + "..." : text;
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
      // Perform Google search
      const urls = await fetchGoogleSearchResults(message);
      if (urls.length > 0) {
        references = urls; // Store the actual URLs for the references section
        for (const url of urls) {
          const { bodyContent } = await scrapeContent(url);
          combinedContent += ` ${bodyContent}`;
        }
      }
    }

    // Handle case where no content is found
    if (!combinedContent.trim()) {
      return NextResponse.json({
        response: "No relevant information could be extracted. Please try a different query or provide a direct link.",
        references: [],
      });
    }

    // Truncate content for AI processing
    const truncatedContent = truncateText(combinedContent, MAX_WORDS);

    const aiPrompt = `
    Summarize the following text in detail with inline citations linked to the references:
    User Input: "${message}"
    Scraped Content: "${truncatedContent}"

    References:
    ${formatReferences(references)}

    Note:
    - Use inline citations like [1], [2], etc., directly referencing the URLs.
    - Do not invent references or citations.
    - Keep responses concise and factual.
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

      return NextResponse.json({
        response: responseMessage,
        references, // Return the actual references
      });
    } catch (aiError) {
      console.error("Error generating AI response:", aiError);
      return NextResponse.json({
        response: "Unable to generate a summary. Please try again later.",
        references,
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
*/
/*
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
  const urlPattern = /(https?:\/\/[^\s]+)/g;
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
  return words.length > maxWords ? words.slice(0, maxWords).join(" ") + "..." : text;
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

    // Handle case where no content is found
    if (!combinedContent.trim()) {
      return NextResponse.json({
        response: "No relevant information could be extracted. Please try a different query or provide a direct link.",
        references: [],
      });
    }

    // Truncate content for AI processing
    const truncatedContent = truncateText(combinedContent, MAX_WORDS);

    const aiPrompt = `
    Summarize the following text in detail with inline citations linked directly to the provided references:
    User Input: "${message}"
    Scraped Content: "${truncatedContent}"

    References:
    ${references.join("\n")}

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

*/

/*
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
  const urlPattern = /(https?:\/\/[^\s]+)/g;
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
  return words.length > maxWords ? words.slice(0, maxWords).join(" ") + "webscraping content..." : text;
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

*/
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


