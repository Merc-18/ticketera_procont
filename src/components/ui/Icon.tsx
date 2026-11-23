import type { SVGProps } from 'react'

// Glifos de interfaz Lucide (ISC); key, tag y package simplificados a trazos equivalentes.
// Sustituyen a los emojis como iconos funcionales (Taste: un sistema de iconos). No representan marcas.
const paths = {
  plus: 'M12 5v14M5 12h14',
  tickets: 'M9 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4M9 3h12v12H9zM12 7h6M12 11h4M6 10v6',
  search: 'm21 21-4.3-4.3M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  arrow: 'M4 12h16m-6-6 6 6-6 6',
  user: 'M20 21v-2a7 7 0 0 0-14 0v2M17 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  building: 'M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18M2 22h20M10 6h4M10 10h4M10 14h4M10 22v-4h4v4',
  lock: 'M6 10h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2ZM8 10V6a4 4 0 0 1 8 0v4M12 14v4',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  eyeOff: 'm3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A11 11 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.1 3.9M6.6 6.6A18 18 0 0 0 2 12s3.5 7 10 7a11 11 0 0 0 5.4-1.6',
  close: 'm6 6 12 12M6 18 18 6',
  check: 'm5 12 4 4L19 6',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8ZM14 2v6h6M8 13h8M8 17h6',
  upload: 'M12 16V3m-5 5 5-5 5 5M3 16v4a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-4',
  chart: 'M3 3v18h18M7 14l4-5 4 3 5-7',
  board: 'M3 4h18v16H3ZM9 4v16M15 4v16M6 8v4M12 8v7M18 8v2',
  inbox: 'M4 4h16l2 12v4H2v-4ZM2 16h6l2 3h4l2-3h6',
  team: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  clock: 'M12 8v4l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  block: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0M5 5l14 14',
  calendar: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2',
  table: 'M3 3h18v18H3zM3 9h18M9 9v12',
  download: 'M12 3v12m-5-5 5 5 5-5M3 17v4h18v-4',
  refresh: 'M20 7a9 9 0 1 0 1 10M20 2v5h-5',
  archive: 'M3 3h18v5H3zM5 8v13h14V8M10 12h4',
  edit: 'm16 3 5 5-13 13H3v-5ZM13 6l5 5',
  comments: 'M21 15a4 4 0 0 1-4 4H7l-5 3V6a4 4 0 0 1 4-4h11a4 4 0 0 1 4 4ZM7 7h9M7 12h6',
  code: 'm8 6-6 6 6 6m8-12 6 6-6 6M14 3l-4 18',
  alert: 'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3ZM12 9v4M12 17h.01',
  trash: 'M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6',
  pin: 'M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  flag: 'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7',
  layers: 'm12 2 10 5-10 5L2 7zM2 17l10 5 10-5M2 12l10 5 10-5',
  info: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0M12 16v-4M12 8h.01',
  bell: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0',
  package: 'm7.5 4.3 9 5.2M21 8 12 3 3 8v8l9 5 9-5ZM3.3 7.5 12 12.5l8.7-5M12 22V12.5',
  star: 'm12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z',
  key: 'M21 2l-9.6 9.6M15.5 7.5l3 3M18 5l2.5 2.5M7.5 21a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11Z',
  tag: 'M12.6 2.6A2 2 0 0 0 11.2 2H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.7 8.7a2.4 2.4 0 0 0 3.4 0l6.6-6.6a2.4 2.4 0 0 0 0-3.4ZM7.5 7.5h.01',
  square: 'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z',
  circle: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
} as const
export type IconName = keyof typeof paths

export default function Icon({ name, size = 20, ...props }: SVGProps<SVGSVGElement> & { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}><path d={paths[name]} /></svg>
}
