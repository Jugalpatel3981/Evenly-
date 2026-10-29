// Saving a generated file in a browser: the share sheet on phones that can share files, otherwise a download.
export async function saveFile(name: string, text: string, type: string){
  const blob = new Blob([text], {type});
  try {
    const file = new File([blob], name, {type});
    if (navigator.canShare?.({files: [file]}) && /iphone|ipad|android/i.test(navigator.userAgent)) { await navigator.share({files: [file], title: name}); return; }
  } catch (err) { if ((err as Error)?.name === 'AbortError') return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
