"use client";

import { useEffect } from "react";

const FRAME_SELECTOR = ".image-frame-text-graphic";
const IMAGE_SELECTOR = ".image-frame-content";
const PROCESSED_ATTRIBUTE = "data-edge-color-sampled";
const SAMPLE_SIZE = 32;
const EDGE_DEPTH = 2;
const MIN_OPAQUE_SHARE = 0.75;
const MIN_COLOR_SHARE = 0.58;
const COLOR_STEP = 16;

type Pixel = { red: number; green: number; blue: number; alpha: number };

function colorBucket(pixel: Pixel) {
  return [pixel.red, pixel.green, pixel.blue]
    .map((channel) => Math.min(255, Math.round(channel / COLOR_STEP) * COLOR_STEP))
    .join(",");
}

function sampleEdgeColor(image: HTMLImageElement) {
  const canvas = document.createElement("canvas");
  canvas.width = SAMPLE_SIZE;
  canvas.height = SAMPLE_SIZE;
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    return null;
  }

  context.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
  const data = context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data;
  const pixels: Pixel[] = [];

  const addPixel = (x: number, y: number) => {
    const offset = (y * SAMPLE_SIZE + x) * 4;
    pixels.push({
      red: data[offset],
      green: data[offset + 1],
      blue: data[offset + 2],
      alpha: data[offset + 3],
    });
  };

  for (let index = 0; index < SAMPLE_SIZE; index += 1) {
    for (let inset = 0; inset < EDGE_DEPTH; inset += 1) {
      addPixel(index, inset);
      addPixel(index, SAMPLE_SIZE - 1 - inset);
      addPixel(inset, index);
      addPixel(SAMPLE_SIZE - 1 - inset, index);
    }
  }

  const opaquePixels = pixels.filter((pixel) => pixel.alpha >= 245);
  if (opaquePixels.length / pixels.length < MIN_OPAQUE_SHARE) {
    return null;
  }

  const buckets = new Map<string, Pixel[]>();
  for (const pixel of opaquePixels) {
    const bucket = colorBucket(pixel);
    buckets.set(bucket, [...(buckets.get(bucket) || []), pixel]);
  }

  const dominant = [...buckets.values()].sort((first, second) => second.length - first.length)[0];
  if (!dominant || dominant.length / opaquePixels.length < MIN_COLOR_SHARE) {
    return null;
  }

  const average = dominant.reduce(
    (color, pixel) => ({
      red: color.red + pixel.red,
      green: color.green + pixel.green,
      blue: color.blue + pixel.blue,
    }),
    { red: 0, green: 0, blue: 0 },
  );

  return `rgb(${Math.round(average.red / dominant.length)} ${Math.round(average.green / dominant.length)} ${Math.round(average.blue / dominant.length)})`;
}

function applySampledBackground(frame: HTMLElement, source: string) {
  if (frame.hasAttribute(PROCESSED_ATTRIBUTE)) {
    return;
  }
  frame.setAttribute(PROCESSED_ATTRIBUTE, "");

  const probe = new window.Image();
  probe.crossOrigin = "anonymous";
  probe.decoding = "async";
  probe.onload = () => {
    try {
      const color = sampleEdgeColor(probe);
      if (!color) {
        return;
      }
      frame.style.setProperty("--image-edge-color", color);
      frame.classList.add("has-sampled-background");
    } catch {
      // Cross-origin or unreadable images retain the existing blurred fallback.
    }
  };
  probe.src = source;
}

function sampleFrames(root: ParentNode) {
  const frames = [
    ...(root instanceof HTMLElement && root.matches(FRAME_SELECTOR) ? [root] : []),
    ...root.querySelectorAll<HTMLElement>(FRAME_SELECTOR),
  ];

  for (const frame of frames) {
    const image = frame.querySelector<HTMLImageElement>(IMAGE_SELECTOR);
    const source = image?.currentSrc || image?.src;
    if (source) {
      applySampledBackground(frame, source);
    }
  }
}

export function LogoBackgroundSampler() {
  useEffect(() => {
    sampleFrames(document);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof HTMLElement) {
            sampleFrames(node);
          }
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
