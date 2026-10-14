import { useState, useEffect } from 'react';
import { safeUrl } from '../../utils/safeUrl.js';

/** A recipe photo that hides itself when the URL is missing, unsafe, or fails to load. */
export default function RecipeImage({ src, alt, className }) {
  const url = safeUrl(src);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);

  if (!url || failed) return null;
  return <img src={url} alt={alt} loading="lazy" onError={() => setFailed(true)} className={className} />;
}
