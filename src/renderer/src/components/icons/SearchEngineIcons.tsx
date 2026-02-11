// Search Engine SVG Icons
// Unified style: 16x16 viewBox, filled style, consistent design language

interface IconProps {
  className?: string;
  size?: number;
}

// Google Icon - Colorful "G" logo
export const GoogleIcon = ({ className = "", size = 16 }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <path
      d="M8.16 7.15v1.77h2.55c-.1.66-.75 1.93-2.55 1.93-1.53 0-2.78-1.27-2.78-2.83 0-1.57 1.25-2.84 2.78-2.84.87 0 1.45.37 1.79.69l1.22-1.18c-.78-.73-1.8-1.17-3.01-1.17C5.27 3.52 3 5.77 3 8.52c0 2.75 2.27 5 5.16 5 2.98 0 4.95-2.1 4.95-5.05 0-.34-.04-.6-.08-.85H8.16z"
      fill="#4285F4"
    />
    <path
      d="M3 8.52c0-2.75 2.27-5 5.16-5 1.21 0 2.23.44 3.01 1.17l-1.22 1.18c-.34-.32-.92-.69-1.79-.69-1.53 0-2.78 1.27-2.78 2.84 0 1.56 1.25 2.83 2.78 2.83 1.46 0 2.17-.93 2.4-1.5H8.16V7.15h4.87c.04.25.08.51.08.85 0 2.95-1.97 5.05-4.95 5.05C5.27 13.52 3 11.27 3 8.52z"
      fill="#34A853"
    />
    <path
      d="M12.03 8c0-.34-.04-.6-.08-.85H8.16v1.77h2.55c-.1.66-.75 1.93-2.55 1.93-.25 0-.49-.04-.71-.1-.44-.2-.77-.6-.93-1.07-.1-.27-.14-.56-.14-.85 0-.29.04-.58.14-.85.16-.47.49-.87.93-1.07.22-.06.46-.1.71-.1.37 0 .7.1.96.27l1.22-1.18c-.44-.32-1-.52-1.65-.52-1.21 0-2.23.44-3.01 1.17-.78.73-1.16 1.72-1.16 2.83 0 1.11.38 2.1 1.16 2.83.78.73 1.8 1.17 3.01 1.17 2.98 0 4.95-2.1 4.95-5.05z"
      fill="#FBBC05"
    />
    <path
      d="M8.16 10.85c-1.8 0-2.45-1.27-2.55-1.93H8.16V7.15H3.29c.04.25.08.51.08.85 0 2.95 1.97 5.05 4.95 5.05.65 0 1.21-.2 1.65-.52l-1.22-1.18c-.26.17-.59.27-.96.27z"
      fill="#EA4335"
    />
  </svg>
);

// Bing Icon - Stylized "b" logo
export const BingIcon = ({ className = "", size = 16 }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <path
      d="M4.5 2.5L11 6v3.5l-3.5-1.5v5L4.5 11V2.5z"
      fill="url(#bing-gradient)"
    />
    <defs>
      <linearGradient id="bing-gradient" x1="4.5" y1="2.5" x2="11" y2="13" gradientUnits="userSpaceOnUse">
        <stop stopColor="#008373" />
        <stop offset="1" stopColor="#0078D4" />
      </linearGradient>
    </defs>
  </svg>
);

// Baidu Icon - Paw print logo
export const BaiduIcon = ({ className = "", size = 16 }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <path
      d="M8 2.5c-.8 0-1.5.7-1.5 1.5S7.2 5.5 8 5.5s1.5-.7 1.5-1.5S8.8 2.5 8 2.5zM4 4.5c-.6 0-1 .4-1 1s.4 1 1 1 1-.4 1-1-.4-1-1-1zM12 4.5c-.6 0-1 .4-1 1s.4 1 1 1 1-.4 1-1-.4-1-1-1zM8 7c-1.7 0-3 1.3-3 3s1.3 3 3 3 3-1.3 3-3-1.3-3-3-3z"
      fill="#2932E1"
    />
    <path
      d="M5.5 8.5c-.6 0-1 .4-1 1s.4 1 1 1 1-.4 1-1-.4-1-1-1zM10.5 8.5c-.6 0-1 .4-1 1s.4 1 1 1 1-.4 1-1-.4-1-1-1z"
      fill="#2932E1"
    />
  </svg>
);

// Sogou Icon - "S" letter with dog ear
export const SogouIcon = ({ className = "", size = 16 }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <path
      d="M13.5 4.5c0-.8-.7-1.5-1.5-1.5H4C3.2 3 2.5 3.7 2.5 4.5v7c0 .8.7 1.5 1.5 1.5h8c.8 0 1.5-.7 1.5-1.5v-7z"
      fill="#FF6A00"
    />
    <path
      d="M11 6.5c0 .3-.1.5-.3.7-.2.2-.4.3-.7.3H9v2.5H7.5V7.5H6.3c-.3 0-.5-.1-.7-.3-.2-.2-.3-.4-.3-.7 0-.3.1-.5.3-.7.2-.2.4-.3.7-.3h3.7c.3 0 .5.1.7.3.2.2.3.4.3.7z"
      fill="white"
    />
    <path
      d="M13 3l1.5-1.5v4L13 4z"
      fill="#FF6A00"
    />
  </svg>
);

// Generic Search Icon fallback
export const GenericSearchIcon = ({ className = "", size = 16 }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <circle cx="7" cy="7" r="4" stroke="currentColor" strokeWidth="1.5" fill="none" />
    <path d="M10 10l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);
