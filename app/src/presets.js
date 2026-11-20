// Layouts, grades and export sizes for the studio.
// A panel rect is fractions of the poster: [x, y, w, h] plus an optional
// tilt in degrees. The poster itself is drawn at the chosen export size;
// every layout is resolution-independent.

const LAYOUTS = [
  {
    id: "vice-grid",
    name: "Vice Grid",
    blurb: "Hero on top, two frames below",
    panels: [
      { x: 0, y: 0, w: 1, h: 0.52 },
      { x: 0, y: 0.52, w: 0.5, h: 0.48 },
      { x: 0.5, y: 0.52, w: 0.5, h: 0.48 },
    ],
  },
  {
    id: "sunset-strip",
    name: "Sunset Strip",
    blurb: "One big moment, two small ones",
    panels: [
      { x: 0, y: 0, w: 1, h: 0.66 },
      { x: 0, y: 0.66, w: 0.5, h: 0.34 },
      { x: 0.5, y: 0.66, w: 0.5, h: 0.34 },
    ],
  },
  {
    id: "mosaic",
    name: "Mosaic",
    blurb: "Six frames, street-poster grid",
    panels: [
      { x: 0, y: 0, w: 0.5, h: 0.34 },
      { x: 0.5, y: 0, w: 0.5, h: 0.34 },
      { x: 0, y: 0.34, w: 0.5, h: 0.33 },
      { x: 0.5, y: 0.34, w: 0.5, h: 0.33 },
      { x: 0, y: 0.67, w: 0.5, h: 0.33 },
      { x: 0.5, y: 0.67, w: 0.5, h: 0.33 },
    ],
  },
  {
    id: "hero-left",
    name: "Hero Left",
    blurb: "Tall lead frame, two stacked",
    panels: [
      { x: 0, y: 0, w: 0.62, h: 1 },
      { x: 0.62, y: 0, w: 0.38, h: 0.5 },
      { x: 0.62, y: 0.5, w: 0.38, h: 0.5 },
    ],
  },
  {
    id: "duo",
    name: "Duo",
    blurb: "Two halves, one story",
    panels: [
      { x: 0, y: 0, w: 0.5, h: 1 },
      { x: 0.5, y: 0, w: 0.5, h: 1 },
    ],
  },
  {
    id: "tilted",
    name: "Tilted",
    blurb: "Full-bleed hero, two crooked snaps",
    panels: [
      { x: 0, y: 0, w: 1, h: 1 },
      { x: 0.05, y: 0.56, w: 0.43, h: 0.3, tilt: -4 },
      { x: 0.52, y: 0.6, w: 0.43, h: 0.3, tilt: 3 },
    ],
  },
];

// A grade re-lights the whole poster: sky gradient, photo wash, accent
// colour for the caption band and the skyline glow.
const GRADES = [
  {
    id: "sunset",
    name: "Sunset",
    sky: ["#2b1055", "#ff7e2e"],
    wash: "#ff2e63",
    accent: "#ffd166",
    ink: "#fff3e0",
  },
  {
    id: "neon-night",
    name: "Neon Night",
    sky: ["#12002b", "#ff2e88"],
    wash: "#7b2fff",
    accent: "#37f4ff",
    ink: "#f5f0ff",
  },
  {
    id: "vice-gold",
    name: "Vice Gold",
    sky: ["#3a1c00", "#f6a93b"],
    wash: "#f6d365",
    accent: "#fff7d6",
    ink: "#2b1500",
  },
  {
    id: "palm-teal",
    name: "Palm Teal",
    sky: ["#04141a", "#1d7a6e"],
    wash: "#2c5364",
    accent: "#7ef0d4",
    ink: "#eafff8",
  },
  {
    id: "mono-noir",
    name: "Mono Noir",
    sky: ["#0a0a0a", "#4a4a4a"],
    wash: "#8a8a8a",
    accent: "#ffffff",
    ink: "#f2f2f2",
  },
];

const EXPORT_SIZES = [
  { id: "square", name: "Square", w: 1080, h: 1080 },
  { id: "portrait", name: "Portrait", w: 1080, h: 1350 },
  { id: "story", name: "Story", w: 1080, h: 1920 },
];

const SAMPLE_PHOTOS = [
  { id: "boulevard", name: "Boulevard", src: "samples/boulevard.png" },
  { id: "pier", name: "Pier", src: "samples/pier.png" },
];
