'use client';

import React, { useState, useEffect, FormEvent, useRef, useMemo } from "react";

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

type Article = {
  title: string;
  link: string;
};

const ChatPage = () => {
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([
    { id: 1, name: "New Chat", messages: [] },
  ]);
  const [currentChatId, setCurrentChatId] = useState(1);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [relatedArticles, setRelatedArticles] = useState<Article[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const currentMessages = useMemo(() => {
    return chatSessions.find((chat) => chat.id === currentChatId)?.messages || [];
  }, [chatSessions, currentChatId]);

  useEffect(() => {
    scrollToBottom();
  }, [currentMessages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleInputChange = (value: string) => {
    setInput(value);
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
    setInput("");
    setLoading(true);
    setRelatedArticles([]);

    // Update the chat name with the first user message
    updateChatName(userMessage.text);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage.text }),
      });

      const data = await response.json();
      const botText = response.ok ? data.response : "Something went wrong.";
      const rawReferences = data.references || [];

      const inlineLinkedText = botText.replace(/\[(\d+)\]/g, (match: string, number: string) => {
        const url = rawReferences[parseInt(number, 10) - 1];
        return url ? `<a href="${url}" target="_blank" class="underline text-blue-600">[${number}]</a>` : `[${number}]`;
      });

      const botMessage: Message = {
        id: Date.now() + 1,
        sender: "bot",
        text: inlineLinkedText,
      };

      newMessages = [...newMessages, botMessage];
      updateChatMessages(newMessages);

      // Fetch related articles from Google Custom Search API
      const relatedArticlesResponse = await fetch(
        `https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(userMessage.text)}&key=${process.env.NEXT_PUBLIC_GOOGLE_API_KEY}&cx=${process.env.NEXT_PUBLIC_GOOGLE_SEARCH_ENGINE_ID}`
      );
      const relatedArticlesData = await relatedArticlesResponse.json();

      const articles: Article[] = relatedArticlesData.items || [];
      setRelatedArticles(
        articles.map((article) => ({
          title: article.title,
          link: article.link,
        }))
      );
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

  const handleDeleteChat = (chatId: number) => {
    setChatSessions((prevSessions) =>
      prevSessions.filter((chat) => chat.id !== chatId)
    );
  };

  return (
    <div className="flex h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-700">
      {/* Sidebar */}
      <div className="w-64 bg-gray-800 shadow-lg p-4 overflow-y-auto">
        <button
          onClick={createNewChat}
          className="w-full bg-gray-700 text-white py-2 rounded-lg mb-4 hover:bg-gray-600"
        >
          + New Chat
        </button>
        <ul className="space-y-2">
          {chatSessions.map((chat) => (
            <li key={chat.id} className="flex justify-between items-center">
              <button
                onClick={() => setCurrentChatId(chat.id)}
                className={`w-full text-left py-2 px-4 rounded-lg ${
                  chat.id === currentChatId
                    ? "bg-gray-600 text-white"
                    : "bg-gray-700 text-gray-400 hover:bg-gray-600"
                }`}
              >
                {chat.name}
              </button>
              <button
                onClick={() => handleDeleteChat(chat.id)}
                className="text-red-500 ml-2"
                aria-label="Delete Chat"
              >
                🗑️
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Main Chat Section */}
      <div className="flex flex-col flex-1">
        {/* Header */}
        <header className="bg-gray-700 shadow px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-semibold text-white">WebChat</h1>
          <button
            onClick={shareChat}
            className="bg-gray-600 text-white px-4 py-2 rounded-lg ml-4 hover:bg-gray-500"
          >
            Share Chat
          </button>
        </header>

        {/* Chat Box */}
        <div className="flex-1 overflow-y-auto p-4 bg-gray-900 bg-opacity-70">
          {currentMessages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${
                msg.sender === "user" ? "justify-end" : "justify-start"
              } mb-4`}
            >
              {msg.sender === "user" ? (
                <div className="w-8 h-8 rounded-full bg-[#48AAAD] flex items-center justify-center text-white mr-2">
                  😊 {/* Smiley face for user */}
                </div>
              ) : (
                <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center text-white mr-2">
                  🤖 {/* Smiley face for bot */}
                </div>
              )}
              <div
                className={`rounded-lg px-4 py-2 max-w-xl ${
                  msg.sender === "user"
                    ? "bg-[#48AAAD] text-white" // Updated to use #48AAAD for the user bubble
                    : "bg-gray-700 text-gray-300"
                }`}
                dangerouslySetInnerHTML={{ __html: msg.text }}
              />
            </div>
          ))}

          {/* Display related articles */}
          {relatedArticles.length > 0 && (
            <div className="bg-gray-800 rounded-lg p-4 space-y-2 mt-4">
              <h3 className="text-lg font-semibold text-white">Related Articles:</h3>
              <ul className="space-y-2">
                {relatedArticles.map((article, index) => (
                  <li key={index} className="text-blue-600 underline">
                    <a href={article.link} target="_blank" rel="noopener noreferrer">
                      {article.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {loading && (
            <div className="flex justify-start mb-4">
              <div className="flex justify-start mt-2">
                <div className="rounded-lg px-4 py-2 max-w-xl bg-gray-600 text-white flex items-center flex-col space-y-2">
                  <span>searching Google...</span>
                  {/* Loading indicators with animation */}
                  <div className="flex flex-col space-y-2">
                    <div className="w-40 h-5 bg-gray-500 rounded-full animate-pulse"></div>
                    <div className="w-36 h-5 bg-gray-500 rounded-full animate-pulse"></div>
                    <div className="w-28 h-5 bg-gray-500 rounded-full animate-pulse"></div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef}></div>
        </div>

        {/* Footer - User Input */}
        <div className="bg-gray-800 px-4 py-2 flex">
          <form onSubmit={handleSubmit} className="flex w-full space-x-4">
            <input
              type="text"
              value={input}
              onChange={(e) => handleInputChange(e.target.value)}
              className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg focus:outline-none"
              placeholder="Ask a question..."
            />
            <button
              type="submit"
              className="bg-[#48AAAD] text-white py-2 px-4 rounded-lg hover:bg-[#48A3A3]"
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ChatPage;
