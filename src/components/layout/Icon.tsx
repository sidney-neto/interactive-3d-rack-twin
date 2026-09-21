import type { CSSProperties } from "react";

const paths = {
  cube: "m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Zm-8 4.5 8 4.5 8-4.5M12 12v9",
  rack: "M6 3h12v18H6zM6 9h12M6 15h12M9 6h.01M9 12h.01M9 18h.01",
  layers: "m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5",
  chip: "M7 7h10v10H7zM9 3v4m6-4v4M9 17v4m6-4v4M3 9h4m-4 6h4m10-6h4m-4 6h4",
  specs: "M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7",
  rotate: "M20 7v5h-5M4 17v-5h5M5 8a7 7 0 0 1 12-3l3 3M4 16l3 3a7 7 0 0 0 12-3",
  front: "M5 4h14v16H5zM9 8h6M9 12h6M9 16h6",
  rear: "M5 4h14v16H5zM8 8h2m4 0h2m-8 4h2m4 0h2m-8 4h2m4 0h2",
  focus: "M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5M9 9h6v6H9z",
  reset: "M3 10a9 9 0 1 1 2 8M3 4v6h6",
  arrow: "M5 12h14m-5-5 5 5-5 5",
  close: "m6 6 12 12M6 18 18 6",
  chevron: "m9 5 7 7-7 7",
  info: "M12 11v6m0-10h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
} as const;
export function Icon({
  name,
  size = 18,
  style,
}: {
  name: keyof typeof paths;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      <path d={paths[name]} />
    </svg>
  );
}
