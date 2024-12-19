// TODO: Implement the chat API with Groq and web scraping with Cheerio and Puppeteer
// Refer to the Next.js Docs on how to read the Request body: https://nextjs.org/docs/app/building-your-application/routing/route-handlers
// Refer to the Groq SDK here on how to use an LLM: https://www.npmjs.com/package/groq-sdk
// Refer to the Cheerio docs here on how to parse HTML: https://cheerio.js.org/docs/basics/loading
// Refer to Puppeteer docs here: https://pptr.dev/guides/what-is-puppeteer
import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import puppeteer from "puppeteer";
import * as cheerio from "cheerio";
import fetch from "node-fetch"; // For making HTTP requests

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Google Search API call
interface SearchResult {
  title: string;
  link: string;
  snippet: string;
}

async function googleSearch(query: string): Promise<SearchResult[]> {
  const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
  const GOOGLE_SEARCH_ENGINE_ID = process.env.GOOGLE_SEARCH_ENGINE_ID;

  const searchUrl = `https://www.googleapis.com/customsearch/v1?q=${query}&key=${GOOGLE_API_KEY}&cx=${GOOGLE_SEARCH_ENGINE_ID}`;
  try {
    const response = await fetch(searchUrl);
    const data = await response.json();

    if (data.items) {
      return data.items.map((item: any) => ({
        title: item.title,
        link: item.link,
        snippet: item.snippet,
      }));
    } else {
      console.error("No items found in search results.");
      return [];
    }
  } catch (error) {
    console.error("Google Search API Error:", error);
    return [];
  }
}

// Function to fetch publish date
async function fetchPublishDate(url: string) {
  try {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("meta[name='article:published_time'], meta[name='date'], time");

    const publishDate = await page.evaluate(() => {
      const metaDate = document.querySelector("meta[name='article:published_time']")?.getAttribute("content");
      if (metaDate) return metaDate;
      const fallbackDate = document.querySelector("meta[name='date']")?.getAttribute("content");
      if (fallbackDate) return fallbackDate;
      const timeElement = document.querySelector("time");
      if (timeElement) return timeElement.getAttribute("datetime");
      return null;
    });

    await browser.close();

    if (publishDate) {
      return publishDate;
    } else {
      return "Publish date not available.";
    }
  } catch (error) {
    console.error("Error fetching publish date:", error);
    return "Error fetching publish date.";
  }
}

export async function POST(request: Request) {
  try {
    const { message, url } = await request.json();

    if (!message) {
      return NextResponse.json(
        { error: "Message content is required." },
        { status: 400 }
      );
    }

    let scrapedData = "No data scraped.";
    let citations: string[] = [];
    let publishDate = "No publish date available.";

    // Scraping data from the URL if provided
    if (url) {
      try {
        const browser = await puppeteer.launch({ headless: true });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
        await page.goto(url, { waitUntil: "domcontentloaded" });
        await page.waitForSelector("h1, h2, p");

        const html = await page.content();
        const $ = cheerio.load(html);
        const extractedText = $("h1, h2, p").text();

        scrapedData = extractedText || "No text found.";
        publishDate = await fetchPublishDate(url);

        await browser.close();
      } catch (scrapeError) {
        console.error("Error during web scraping:", scrapeError);
        scrapedData = "Failed to scrape the website.";
      }
    }

    // Fetch Google Search results based on the message content
    const searchResults = await googleSearch(message);

    if (searchResults.length > 0) {
      citations = searchResults.map((result: SearchResult) => {
        return `<a href="${result.link}" target="_blank">${result.title}</a> - ${result.snippet}`;
      });
    } else {
      citations.push("No search results found.");
    }

    // Construct AI prompt
    const aiPrompt = `

      User's message: "${message}"
      Scraped data from URL: "${scrapedData}"
      Publish Date of the Article: "${publishDate}"
      Citations (search results): ${citations.join("\n")}

      
      Based on the provided message and the relevant scraped data from the URL, please provide a detailed, well-informed response to the user's query. 
      Ensure to include references to any relevant articles and citations.
    `;

    // Pass the prompt to the Groq AI model
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { role: "system", content: aiPrompt }
      ],
      model: "llama3-8b-8192", // Replace with your Groq model of choice
    });

    const responseMessage =
      chatCompletion.choices[0]?.message?.content || "No response from AI model.";

    return NextResponse.json({ response: responseMessage, scrapedData, publishDate, citations });
  } catch (error) {
    console.error("Error in chat API:", error);
    return NextResponse.json(
      { error: "An error occurred while processing your request." },
      { status: 500 }
    );
  }
}
