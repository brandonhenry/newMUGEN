import { connectLambda, getStore } from '@netlify/blobs';

export function getBlobStore(name, event) {
  const siteID = process.env.NETLIFY_BLOBS_SITE_ID || process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
  const token = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_AUTH_TOKEN;
  if (siteID && token) return getStore({ name, siteID, token });

  if (event) {
    connectLambda(event);
  }

  return getStore(name);
}
