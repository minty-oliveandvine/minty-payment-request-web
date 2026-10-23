export async function compressImage(file: File): Promise<File> {
  // Leave non-images (e.g. PDFs) untouched
  if (!file.type.startsWith("image/")) {
    return file;
  }

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

      // White background (important when converting PNG with transparency)
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, width, height);

      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(img.src);

          if (!blob) {
            reject(new Error("Hmm, I couldn't quite process that image. Got another one?"));
            return;
          }

          const filename = file.name.replace(/\.[^.]+$/, ".jpg");

          resolve(
            new File([blob], filename, {
              type: "image/jpeg",
              lastModified: Date.now(),
            }),
          );
        },
        "image/jpeg",
        0.8, // Quality: 0.0 - 1.0
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error("Hmm, that image didn't load. Got another one?"));
    };

    img.src = URL.createObjectURL(file);
  });
}
