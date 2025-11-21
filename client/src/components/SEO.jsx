import React from 'react';
import { Helmet } from 'react-helmet-async';

export default function SEO({ title, description, name, type, url, image }) {
  return (
    <Helmet>
      {/* Standard metadata tags */}
      <title>{title}</title>
      <meta name='description' content={description} />
      {url && <link rel="canonical" href={url} />}
      
      {/* Facebook tags */}
      <meta property="og:type" content={type} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      {url && <meta property="og:url" content={url} />}
      {image && <meta property="og:image" content={image} />}
      
      {/* Twitter tags */}
      <meta name="twitter:creator" content={name} />
      <meta name="twitter:card" content={type} />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      {image && <meta name="twitter:image" content={image} />}
    </Helmet>
  );
}

SEO.defaultProps = {
  title: 'Zelia - Ta conseillère d\'orientation virtuelle',
  description: 'Découvre ton avenir avec Zelia, l\'IA qui révolutionne l\'orientation scolaire et professionnelle.',
  name: 'Zelia',
  type: 'website',
  image: '/assets/images/social/share-image.png' // Make sure this image exists or use a default one
};
