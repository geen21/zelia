import React from 'react';
import { Helmet } from 'react-helmet-async';

const DEFAULT_ORIGIN = 'https://zelia.io';

function getOriginFromUrl(url) {
  if (!url) return DEFAULT_ORIGIN;
  try {
    return new URL(url).origin;
  } catch {
    return DEFAULT_ORIGIN;
  }
}

function toAbsoluteUrl(value, origin) {
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('/')) return `${origin}${value}`;
  return `${origin}/${value}`;
}

export default function SEO({
  title,
  description,
  name,
  type,
  url,
  image,
  imageAlt,
  twitterCard,
  siteName,
  locale,
  schema,
  publishedTime,
  author
}) {
  const origin = getOriginFromUrl(url);
  const absoluteImage = toAbsoluteUrl(image, origin);
  const twitterHandle = typeof name === 'string' && name.trim().startsWith('@') ? name.trim() : null;

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      {url && <link rel="canonical" href={url} />}

      <meta property="og:type" content={type} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      {url && <meta property="og:url" content={url} />}
      {siteName && <meta property="og:site_name" content={siteName} />}
      {locale && <meta property="og:locale" content={locale} />}
      {absoluteImage && <meta property="og:image" content={absoluteImage} />}
      {absoluteImage && <meta property="og:image:secure_url" content={absoluteImage} />}
      {imageAlt && <meta property="og:image:alt" content={imageAlt} />}

      <meta name="twitter:card" content={twitterCard} />
      {url && <meta name="twitter:url" content={url} />}
      {twitterHandle && <meta name="twitter:creator" content={twitterHandle} />}
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      {absoluteImage && <meta name="twitter:image" content={absoluteImage} />}
      {imageAlt && <meta name="twitter:image:alt" content={imageAlt} />}

      {publishedTime && <meta property="article:published_time" content={publishedTime} />}
      {author && <meta property="article:author" content={author} />}

      {schema && (
        <script type="application/ld+json">
          {JSON.stringify(schema)}
        </script>
      )}
    </Helmet>
  );
}

SEO.defaultProps = {
  title: "Zelia - Ta conseillère d'orientation virtuelle",
  description:
    "Découvre ton avenir avec Zelia, l'IA qui révolutionne l'orientation scolaire et professionnelle.",
  name: 'Zelia',
  type: 'website',
  url: 'https://zelia.io/',
  siteName: 'Zelia',
  locale: 'fr_FR',
  twitterCard: 'summary_large_image',
  image: '/assets/images/logo-dark.png',
  imageAlt: 'Zelia'
};
