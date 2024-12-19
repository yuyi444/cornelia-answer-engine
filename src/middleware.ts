// TODO: Implement the code here to add rate limiting with Redis
// Refer to the Next.js Docs: https://nextjs.org/docs/app/building-your-application/routing/middleware
// Refer to Redis docs on Rate Limiting: https://upstash.com/docs/redis/sdks/ratelimit-ts/algorithms


import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

// Set up Redis and RateLimiter
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});
const rateLimit = new Ratelimit({
  redis: redis,
  limiter: Ratelimit.slidingWindow(10, "60 s"),
  analytics: true,
});

// Middleware function
export async function middleware() {
  try {
    // Apply rate limiting
    const { success, limit, reset, remaining } = await rateLimit.limit("user");

    console.log(`Rate limit status: success=${success}, remaining=${remaining}`);

    // Return appropriate response based on rate limit status
    const response = success
      ? NextResponse.next()
      : NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

    // Add rate limit info to response headers
    response.headers.set("X-RateLimit-Limit", limit.toString());
    response.headers.set("X-RateLimit-Remaining", remaining.toString());
    response.headers.set("X-RateLimit-Reset", reset.toString());
    return response;
  } catch (error) {
    console.error("Error in middleware - ", error);
    return NextResponse.next();
  }
}

// Configure the middleware path matcher
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)", // Exclude static files and images
  ],
};
