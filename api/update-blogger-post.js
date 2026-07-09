// /api/update-blogger-post.js
import { getBloggerAccessToken } from '../lib/blogger-auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { bloggerPostId, title, content, price, labels } = req.body || {};

  if (!bloggerPostId) {
    return res.status(400).json({ error: 'bloggerPostId is required — this identifies which Blogger post to update' });
  }

  if (!title && !content && price === undefined && !labels) {
    return res.status(400).json({ error: 'Provide at least one of: title, content, price, labels' });
  }

  const blogId = process.env.BLOGGER_BLOG_ID;

  try {
    const accessToken = await getBloggerAccessToken();

    const getRes = await fetch(
      `https://www.googleapis.com/blogger/v3/blogs/${blogId}/posts/${bloggerPostId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const existingPost = await getRes.json();

    if (!getRes.ok) {
      return res.status(getRes.status).json({
        error: 'Could not find the existing Blogger post',
        details: existingPost,
      });
    }

    let updatedContent = content ?? existingPost.content;
    if (price !== undefined) {
      const priceLine = `<p><strong>Price: ₹${Number(price).toLocaleString('en-IN')}</strong></p>`;
      const priceLineRegex = /<p><strong>Price:.*?<\/strong><\/p>/;
      updatedContent = priceLineRegex.test(updatedContent)
        ? updatedContent.replace(priceLineRegex, priceLine)
        : priceLine + updatedContent;
    }

    const updateRes = await fetch(
      `https://www.googleapis.com/blogger/v3/blogs/${blogId}/posts/${bloggerPostId}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: title ?? existingPost.title,
          content: updatedContent,
          labels: labels ?? existingPost.labels,
        }),
      }
    );

    const updatedPost = await updateRes.json();

    if (!updateRes.ok) {
      return res.status(updateRes.status).json({
        error: 'Failed to update Blogger post',
        details: updatedPost,
      });
    }

    return res.status(200).json({
      success: true,
      bloggerPostId: updatedPost.id,
      url: updatedPost.url,
      title: updatedPost.title,
    });
  } catch (err) {
    console.error('update-blogger-post error:', err);
    return res.status(500).json({ error: err.message || 'Internal error updating Blogger post' });
  }
}
