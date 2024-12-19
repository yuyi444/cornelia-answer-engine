"use client";

import { useState, useEffect, FormEvent, useRef, useMemo } from "react";

type Message = {
  id: number;
  sender: "user" | "bot";
  text: string;
};

type ChatSession = {
  id: number;
  name: string;
  messages: Message[];
};

const ChatPage = () => {
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([
    { id: 1, name: "New Chat", messages: [] },
  ]);
  const [currentChatId, setCurrentChatId] = useState(1);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [relatedArticles, setRelatedArticles] = useState<{ title: string; url: string }[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const currentMessages = useMemo(() => {
    return chatSessions.find((chat) => chat.id === currentChatId)?.messages || [];
  }, [chatSessions, currentChatId]);

  useEffect(() => {
    scrollToBottom();
  }, [currentMessages]);

  useEffect(() => {
    loadSharedChatFromURL();
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleInputChange = (value: string) => {
    setInput(value);
    if (value.startsWith("www")) {
      setSuggestions([
        "www.chase.com login",
        "www.chatgpt",
        "www.change cyber support.com",
      ]);
    } else {
      setSuggestions([]);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setInput(suggestion);
    setSuggestions([]);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage: Message = {
      id: Date.now(),
      sender: "user",
      text: input.trim(),
    };

    let newMessages = [...currentMessages, userMessage];
    updateChatMessages(newMessages);
    updateChatName(userMessage.text);
    setInput("");
    setSuggestions([]);
    setLoading(true);
    setRelatedArticles([]); // Clear previous related articles

    try {
      // Step 1: Fetch bot response
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage.text }),
      });

      const data = await response.json();
      const botMessage: Message = {
        id: Date.now() + 1,
        sender: "bot",
        text: response.ok ? data.response : "Something went wrong.",
      };

      // Add the bot message
      newMessages = [...newMessages, botMessage];

      // Step 2: Fetch related articles from Google Custom Search API
      const relatedArticlesResponse = await fetch(
        `https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(userMessage.text)}&key=${process.env.NEXT_PUBLIC_GOOGLE_API_KEY}&cx=${process.env.NEXT_PUBLIC_GOOGLE_SEARCH_ENGINE_ID}`
      );
      const relatedArticlesData = await relatedArticlesResponse.json();

      const articles = relatedArticlesData.items || [];
      setRelatedArticles(
        articles.map((article: any) => ({
          title: article.title,
          url: article.link,
        }))
      );

      updateChatMessages(newMessages);
    } catch {
      updateChatMessages([
        ...newMessages,
        { id: Date.now(), sender: "bot", text: "An unexpected error occurred." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const updateChatMessages = (newMessages: Message[]) => {
    setChatSessions((prev) =>
      prev.map((chat) =>
        chat.id === currentChatId ? { ...chat, messages: newMessages } : chat
      )
    );
  };

  const updateChatName = (inputText: string) => {
    setChatSessions((prev) =>
      prev.map((chat) =>
        chat.id === currentChatId && chat.name === "New Chat"
          ? { ...chat, name: inputText.slice(0, 20) }
          : chat
      )
    );
  };

  const createNewChat = () => {
    const newChat = { id: Date.now(), name: "New Chat", messages: [] };
    setChatSessions((prev) => [...prev, newChat]);
    setCurrentChatId(newChat.id);
  };

  const shareChat = () => {
    const chatToShare = chatSessions.find((chat) => chat.id === currentChatId);
    if (!chatToShare) return;

    const encodedChat = encodeURIComponent(JSON.stringify(chatToShare.messages));
    const shareableURL = `${window.location.origin}?sharedChat=${encodedChat}`;
    navigator.clipboard.writeText(shareableURL);
    alert("Shareable link copied to clipboard!");
  };

  const loadSharedChatFromURL = () => {
    const params = new URLSearchParams(window.location.search);
    const sharedChat = params.get("sharedChat");

    if (sharedChat) {
      try {
        const messages: Message[] = JSON.parse(decodeURIComponent(sharedChat));
        const sharedChatSession: ChatSession = {
          id: Date.now(),
          name: "Shared Chat",
          messages,
        };
        setChatSessions((prev) => [...prev, sharedChatSession]);
        setCurrentChatId(sharedChatSession.id);
      } catch (error) {
        console.error("Failed to load shared chat:", error);
      }
    }
  };

  return (
    <div className="flex h-screen bg-gradient-to-br from-pink-300 via-purple-300 to-teal-300">
      {/* Sidebar */}
      <div className="w-64 bg-white shadow-lg p-4 overflow-y-auto">
        <button
          onClick={createNewChat}
          className="w-full bg-gradient-to-r from-pink-400 to-teal-400 text-white py-2 rounded-lg mb-4 hover:opacity-90"
        >
          + New Chat
        </button>
        <ul>
          {chatSessions.map((chat) => (
            <li
              key={chat.id}
              onClick={() => setCurrentChatId(chat.id)}
              className={`cursor-pointer py-2 px-4 rounded-lg mb-2 ${
                chat.id === currentChatId
                  ? "bg-gradient-to-r from-pink-400 to-teal-400 text-white"
                  : "hover:bg-gray-200 text-gray-700"
              }`}
            >
              {chat.name}
            </li>
          ))}
        </ul>
      </div>

      {/* Main Chat Section */}
      <div className="flex flex-col flex-1">
        <header className="bg-gradient-to-r from-pink-500 via-purple-500 to-teal-500 shadow px-4 py-4 flex justify-between items-center rounded-b-lg">
          <h1 className="text-2xl font-semibold text-white">
            Cornelia
          </h1>
          <button
            onClick={shareChat}
            className="bg-white text-pink-500 py-2 px-4 rounded-lg hover:opacity-90 shadow"
          >
            Share Chat
          </button>
        </header>

        {/* Chat Box */}
        <div className="flex-1 overflow-y-auto p-4 bg-white bg-opacity-70">
          {currentMessages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${
                msg.sender === "user" ? "justify-end" : "justify-start"
              } mb-4`}
            >
              <div
                className={`rounded-lg px-4 py-2 max-w-xl ${
                  msg.sender === "user"
                    ? "bg-gradient-to-r from-pink-400 to-purple-400 text-white"
                    : "bg-gray-200 text-gray-800"
                }`}
              >
                {msg.text}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start mb-4">
              <div className="flex space-x-1">
                <span className="block w-2 h-2 bg-gray-400 rounded-full animate-pulse"></span>
                <span className="block w-2 h-2 bg-gray-400 rounded-full animate-pulse delay-200"></span>
                <span className="block w-2 h-2 bg-gray-400 rounded-full animate-pulse delay-400"></span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Form */}
        <form onSubmit={handleSubmit} className="flex p-4 bg-white shadow">
          <input
            type="text"
            value={input}
            onChange={(e) => handleInputChange(e.target.value)}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg shadow-sm"
            placeholder="Ask me anything..."
          />
          <button
            type="submit"
            className="bg-gradient-to-r from-pink-400 to-teal-400 text-white px-4 py-2 rounded-lg ml-4 hover:opacity-90"
          >
            {loading ? "..." : "Send"}
          </button>
        </form>
      </div>

      {/* Related Articles Section */}
      {relatedArticles.length > 0 && (
        <div className="w-64 bg-white shadow-lg p-4 overflow-y-auto">
          <h2 className="text-lg font-bold mb-2 text-gray-700">Related Articles</h2>
          <ul className="list-none space-y-2">
  {relatedArticles.map((article, index) => (
    <li key={index} className="text-sm text-gray-800">
      <a
        href={article.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block px-4 py-2 bg-gradient-to-r from-pink-400 to-teal-400 text-white rounded-lg shadow-md hover:opacity-90"
      >
        {article.title}
      </a>
    </li>
  ))}
</ul>


        </div>
      )}
    </div>
  );
};

export default ChatPage;
