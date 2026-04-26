export const defaultCardPalette = {
  primary: "56 209 153",
  secondary: "10 16 20",
};

const albumPaletteCache = new Map();

function clampChannel(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function rgbArrayToCss(rgb) {
  if (!Array.isArray(rgb) || rgb.length !== 3) {
    return defaultCardPalette.primary;
  }
  return `${clampChannel(rgb[0])} ${clampChannel(rgb[1])} ${clampChannel(rgb[2])}`;
}

function colorDistance(a, b) {
  return Math.sqrt(
    (a[0] - b[0]) * (a[0] - b[0])
      + (a[1] - b[1]) * (a[1] - b[1])
      + (a[2] - b[2]) * (a[2] - b[2])
  );
}

function blendToward(color, toward, ratio) {
  return [
    color[0] * (1 - ratio) + toward[0] * ratio,
    color[1] * (1 - ratio) + toward[1] * ratio,
    color[2] * (1 - ratio) + toward[2] * ratio,
  ];
}

function averageRgbFromImageData(imageData) {
  const { data } = imageData;
  let totalR = 0;
  let totalG = 0;
  let totalB = 0;
  let count = 0;

  for (let index = 0; index < data.length; index += 16) {
    const alpha = data[index + 3];
    if (alpha < 64) {
      continue;
    }
    totalR += data[index];
    totalG += data[index + 1];
    totalB += data[index + 2];
    count += 1;
  }

  if (!count) {
    return null;
  }

  return [totalR / count, totalG / count, totalB / count];
}

export async function extractAlbumPalette(imageUrl) {
  if (!imageUrl) {
    return null;
  }

  const cached = albumPaletteCache.get(imageUrl);
  if (cached) {
    return cached;
  }

  const image = new Image();
  image.crossOrigin = "anonymous";
  image.referrerPolicy = "no-referrer";

  const loaded = await new Promise((resolve, reject) => {
    image.onload = () => resolve(true);
    image.onerror = () => reject(new Error("Image load failed"));
    image.src = imageUrl;
  });

  if (!loaded) {
    return null;
  }

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return null;
  }

  canvas.width = 32;
  canvas.height = 32;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const average = averageRgbFromImageData(imageData);
  if (!average) {
    return null;
  }

  const darkReference = [18, 18, 20];
  let primary = blendToward(average, [46, 190, 130], 0.24);
  if (colorDistance(primary, darkReference) < 75) {
    primary = blendToward(primary, [72, 214, 158], 0.28);
  }

  const palette = {
    primary: rgbArrayToCss(primary),
    secondary: rgbArrayToCss(blendToward(primary, [13, 23, 31], 0.65)),
  };

  albumPaletteCache.set(imageUrl, palette);
  return palette;
}

export function getCachedAlbumPalette(imageUrl) {
  return albumPaletteCache.get(imageUrl) || null;
}
