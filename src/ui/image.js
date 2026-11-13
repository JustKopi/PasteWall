// Kép betöltése és tömörítése, hogy élő játékban gyorsan átküldhető legyen (kb. 60–150 KB).
export function pickImage() {
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    inp.onchange = () => resolve(inp.files?.[0] || null);
    inp.click();
  });
}

export async function compressImage(file, maxSide = 800, quality = 0.72) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    let q = quality;
    let data = c.toDataURL('image/jpeg', q);
    while (data.length > 190000 && q > 0.35) { q -= 0.1; data = c.toDataURL('image/jpeg', q); }
    return data;
  } finally {
    URL.revokeObjectURL(url);
  }
}
