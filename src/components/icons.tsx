// Inline icon set, stroked with currentColor so it follows the theme.

import type { ReactNode } from 'react'

interface IconProps {
  size?: number
  children: ReactNode
}

function Icon({ size = 18, children }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

export const IconPlay = (props: { size?: number }) => (
  <Icon {...props}>
    <path d="M7 4.5 19 12 7 19.5z" fill="currentColor" stroke="none" />
  </Icon>
)

export const IconPause = (props: { size?: number }) => (
  <Icon {...props}>
    <rect x="6.5" y="5" width="3.6" height="14" rx="1.2" fill="currentColor" stroke="none" />
    <rect x="13.9" y="5" width="3.6" height="14" rx="1.2" fill="currentColor" stroke="none" />
  </Icon>
)

export const IconMarkIn = (props: { size?: number }) => (
  <Icon {...props}>
    <path d="M8 4v16" />
    <path d="M12 8.5 15.5 12 12 15.5" />
    <path d="M19 12h-7" />
  </Icon>
)

export const IconMarkOut = (props: { size?: number }) => (
  <Icon {...props}>
    <path d="M16 4v16" />
    <path d="M12 8.5 8.5 12 12 15.5" />
    <path d="M5 12h7" />
  </Icon>
)

export const IconLoop = (props: { size?: number }) => (
  <Icon {...props}>
    <path d="M4 9a4 4 0 0 1 4-4h8l-2.4-2.2M20 15a4 4 0 0 1-4 4H8l2.4 2.2" />
    <path d="M20 15V9M4 9v6" />
  </Icon>
)

export const IconScissors = (props: { size?: number }) => (
  <Icon {...props}>
    <circle cx="6.5" cy="18" r="2.5" />
    <circle cx="6.5" cy="6" r="2.5" />
    <path d="M8.6 7.6 20 18M20 6 8.6 16.4" />
  </Icon>
)

export const IconDownload = (props: { size?: number }) => (
  <Icon {...props}>
    <path d="M12 3v12" />
    <path d="M7.5 10.5 12 15l4.5-4.5" />
    <path d="M4 19h16" />
  </Icon>
)

export const IconFolder = (props: { size?: number }) => (
  <Icon {...props}>
    <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4.2l1.8 2.2h9A1.5 1.5 0 0 1 21 9.7v8.8A1.5 1.5 0 0 1 19.5 20h-15A1.5 1.5 0 0 1 3 18.5z" />
  </Icon>
)

export const IconTrash = (props: { size?: number }) => (
  <Icon {...props}>
    <path d="M4 6.5h16M9.5 6.5V4.5h5v2M6.5 6.5 7.4 20h9.2l.9-13.5" />
  </Icon>
)

export const IconRetry = (props: { size?: number }) => (
  <Icon {...props}>
    <path d="M4.5 12a7.5 7.5 0 1 1 2.6 5.7" />
    <path d="M4 7.5v4.2h4.2" />
  </Icon>
)

export const IconSun = (props: { size?: number }) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4" />
  </Icon>
)

export const IconMoon = (props: { size?: number }) => (
  <Icon {...props}>
    <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
  </Icon>
)

export const IconGithub = (props: { size?: number }) => (
  <Icon {...props}>
    <path
      fill="currentColor"
      stroke="none"
      d="M12 2C6.5 2 2 6.6 2 12.25c0 4.51 2.87 8.34 6.84 9.69.5.1.68-.22.68-.49l-.01-1.9c-2.78.62-3.37-1.2-3.37-1.2-.46-1.18-1.11-1.5-1.11-1.5-.91-.63.07-.62.07-.62 1 .07 1.53 1.05 1.53 1.05.9 1.56 2.34 1.11 2.92.85.09-.66.35-1.11.63-1.36-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05a9.3 9.3 0 0 1 5 0c1.91-1.33 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.81-4.57 5.06.36.32.68.94.68 1.9l-.01 2.82c0 .27.18.6.69.49A10.06 10.06 0 0 0 22 12.25C22 6.6 17.5 2 12 2z"
    />
  </Icon>
)

// The wordmark logo, drawn once here and mirrored by public/favicon.svg.
export const BrandMark = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="clipr-mark" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#7c5cff" />
        <stop offset="1" stopColor="#46d5ff" />
      </linearGradient>
    </defs>
    <rect width="32" height="32" rx="8" fill="url(#clipr-mark)" />
    <g fill="none" stroke="#0d0e14" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 9h-2.5a1.5 1.5 0 0 0-1.5 1.5v11a1.5 1.5 0 0 0 1.5 1.5H13" />
      <path d="M19 9h2.5a1.5 1.5 0 0 1 1.5 1.5v11a1.5 1.5 0 0 1-1.5 1.5H19" />
    </g>
  </svg>
)

export const IconSettings = (props: { size?: number }) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M19.4 14.5a1.6 1.6 0 0 0 .32 1.77l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.6 1.6 0 0 0-1.77-.32 1.6 1.6 0 0 0-1 1.47V21a2 2 0 0 1-4 0v-.1a1.6 1.6 0 0 0-1.05-1.47 1.6 1.6 0 0 0-1.77.32l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.6 1.6 0 0 0 .32-1.77 1.6 1.6 0 0 0-1.47-1H3a2 2 0 0 1 0-4h.1a1.6 1.6 0 0 0 1.47-1.05 1.6 1.6 0 0 0-.32-1.77l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.6 1.6 0 0 0 1.77.32H9a1.6 1.6 0 0 0 1-1.47V3a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 1 1.47 1.6 1.6 0 0 0 1.77-.32l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.6 1.6 0 0 0-.32 1.77V9a1.6 1.6 0 0 0 1.47 1H21a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.47 1z" />
  </Icon>
)

export const IconKeyboard = (props: { size?: number }) => (
  <Icon {...props}>
    <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
    <path d="M7 10h.01M11 10h.01M15 10h.01M17 10h.01M7 13h.01M8.5 15.5h7" />
  </Icon>
)

export const IconClose = (props: { size?: number }) => (
  <Icon {...props}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
)

export const IconPlus = (props: { size?: number }) => (
  <Icon {...props}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
)

export const IconUpload = (props: { size?: number }) => (
  <Icon {...props}>
    <path d="M12 16V4" />
    <path d="M7.5 8.5 12 4l4.5 4.5" />
    <path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15" />
  </Icon>
)

export const IconCheck = (props: { size?: number }) => (
  <Icon {...props}>
    <path d="M4.5 12.5 9.5 17.5 19.5 7" />
  </Icon>
)

export const IconAlert = (props: { size?: number }) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5.5M12 16.4h.01" />
  </Icon>
)

export const IconSkipStart = (props: { size?: number }) => (
  <Icon {...props}>
    <path d="M6 5v14" />
    <path d="M19 5.5 9.5 12 19 18.5z" fill="currentColor" stroke="none" />
  </Icon>
)

export const IconSkipEnd = (props: { size?: number }) => (
  <Icon {...props}>
    <path d="M18 5v14" />
    <path d="M5 5.5 14.5 12 5 18.5z" fill="currentColor" stroke="none" />
  </Icon>
)

export const IconVolume = (props: { size?: number }) => (
  <Icon {...props}>
    <path d="M5 9.5h3L12 6v12l-4-3.5H5z" />
    <path d="M15.5 9.5a3.5 3.5 0 0 1 0 5M18 7a7 7 0 0 1 0 10" />
  </Icon>
)

export const IconMute = (props: { size?: number }) => (
  <Icon {...props}>
    <path d="M5 9.5h3L12 6v12l-4-3.5H5z" />
    <path d="M16 10l4 4M20 10l-4 4" />
  </Icon>
)
