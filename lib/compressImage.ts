export async function compressImage(file: File): Promise<File> {
  // Leave non-images (e.g. PDFs) untouched
  if (!file.type.startsWith("image/")) {
    return file;
  }

  // A PNG stays a PNG (its transparency and its name with it) and a JPEG a JPEG; any other image
  // becomes a JPEG. 2026-11-03: receipt.png used to reach the bill as receipt.jpg.
  const keepType = file.type === "image/png" || file.type === "image/jpeg";
  const outType = keepType ? file.type : "image/jpeg";

  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      const MAX_DIMENSION = 1920;

      let { width, height } = img;

      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        const scale = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Hmm, I couldn't quite process that image. Got another one?"));
        return;
      }

      // White background behind anything transparent that becomes a JPEG
      if (outType === "image/jpeg") {
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, width, height);
      }

      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(img.src);

          if (!blob) {
            reject(new Error("Hmm, I couldn't quite process that image. Got another one?"));
            return;
          }

          const filename = keepType ? file.name : file.name.replace(/\.[^.]+$/, ".jpg");

          resolve(
            new File([blob], filename, {
              type: outType,
              lastModified: Date.now(),
            }),
          );
        },
        outType,
        0.8, // Quality: 0.0 - 1.0 (JPEG only; a PNG ignores it)
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error("Hmm, that image didn't load. Got another one?"));
    };

    img.src = URL.createObjectURL(file);
  });
}
