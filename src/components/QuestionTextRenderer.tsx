import React from "react";

interface QuestionTextRendererProps {
  text: string;
}

export const QuestionTextRenderer: React.FC<QuestionTextRendererProps> = ({ text }) => {
  if (!text) return null;

  // Regex to match markdown image format with base64 data url or generic urls
  const regex = /!\[.*?\]\((data:image\/[a-zA-Z+-]+;base64,[a-zA-Z0-9+/=]+|https?:\/\/[^\s)]+)\)/g;

  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const matchIndex = match.index;
    const imageUrl = match[1];

    // Push preceding text part
    if (matchIndex > lastIndex) {
      parts.push(text.substring(lastIndex, matchIndex));
    }

    // Push image component
    parts.push(
      <div key={matchIndex} className="my-3 block">
        <img
          src={imageUrl}
          alt="Question Attachment"
          referrerPolicy="no-referrer"
          className="max-w-full rounded-xl border border-slate-200 dark:border-slate-800 shadow-md max-h-[320px] object-contain transition-all hover:scale-[1.01]"
        />
      </div>
    );

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return (
    <div className="whitespace-pre-wrap font-sans leading-relaxed text-slate-800 dark:text-slate-100">
      {parts.map((part, i) => {
        if (typeof part === "string") {
          return <span key={i}>{part}</span>;
        }
        return part;
      })}
    </div>
  );
};
