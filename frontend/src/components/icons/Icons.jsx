import React from 'react';

const IconBase = ({ size = 16, color = 'currentColor', strokeWidth = 1.6, children, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...props}
  >
    {children}
  </svg>
);

export const Thought = (props) => (
  <IconBase {...props}>
    <path d="M7 14a4 4 0 1 1 2.5-7.2A4.5 4.5 0 1 1 16.5 14H7z" />
    <circle cx="6" cy="18" r="1.3" />
    <circle cx="4" cy="20.5" r="0.9" />
  </IconBase>
);

export const Screenshot = (props) => (
  <IconBase {...props}>
    <rect x="4" y="4" width="16" height="16" rx="1.5" />
    <path d="M8 4v3M16 4v3M8 17v3M16 17v3" />
  </IconBase>
);

export const Chat = (props) => (
  <IconBase {...props}>
    <path d="M5 7h14v8H9l-4 4V7z" />
    <path d="M9 11h6" />
  </IconBase>
);

export const Url = (props) => (
  <IconBase {...props}>
    <path d="M9 15l-2 2a3 3 0 1 1-4-4l2-2" />
    <path d="M15 9l2-2a3 3 0 1 1 4 4l-2 2" />
    <path d="M8 12h8" />
  </IconBase>
);

export const Video = (props) => (
  <IconBase {...props}>
    <rect x="3" y="6" width="14" height="12" rx="1.5" />
    <path d="M17 10l4-2v8l-4-2" />
    <path d="M8.5 10.5l4 2.5-4 2.5z" />
  </IconBase>
);

export const Audio = (props) => (
  <IconBase {...props}>
    <path d="M4 10h4l4-3v10l-4-3H4z" />
    <path d="M16 9a4 4 0 0 1 0 6" />
    <path d="M18.5 7.5a7 7 0 0 1 0 9" />
  </IconBase>
);

export const Document = (props) => (
  <IconBase {...props}>
    <path d="M7 3h7l5 5v13H7z" />
    <path d="M14 3v5h5" />
    <path d="M9 13h6M9 17h6" />
  </IconBase>
);

export const Search = (props) => (
  <IconBase {...props}>
    <circle cx="11" cy="11" r="5.5" />
    <path d="M16.5 16.5L21 21" />
  </IconBase>
);

export const Capture = (props) => (
  <IconBase {...props}>
    <rect x="4" y="4" width="16" height="16" rx="1.5" />
    <path d="M12 8v8M8 12h8" />
  </IconBase>
);

export const Node = (props) => (
  <IconBase {...props}>
    <circle cx="12" cy="12" r="3.5" />
    <path d="M12 4v4M12 16v4M4 12h4M16 12h4" />
  </IconBase>
);

export const Close = (props) => (
  <IconBase {...props}>
    <path d="M6 6l12 12M18 6l-12 12" />
  </IconBase>
);

export const Expand = (props) => (
  <IconBase {...props}>
    <path d="M4 9V4h5M20 15v5h-5M20 9V4h-5M4 15v5h5" />
  </IconBase>
);

export const sourceIcon = (sourceType) => {
  switch (sourceType) {
    case 'thought':
      return Thought;
    case 'screenshot':
      return Screenshot;
    case 'ai_chat':
      return Chat;
    case 'url':
      return Url;
    case 'video':
      return Video;
    case 'audio':
      return Audio;
    case 'document':
    default:
      return Document;
  }
};

export default {
  Thought,
  Screenshot,
  Chat,
  Url,
  Video,
  Audio,
  Document,
  Search,
  Capture,
  Node,
  Close,
  Expand,
  sourceIcon,
};
